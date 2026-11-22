import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/crypto';
import { buildRawMimeMessage, getGoogleOAuth2Client } from '@/lib/gmail';
import { google } from 'googleapis';
import { htmlToPlainText, normalizeTemplateHtml, sanitizeEmailHtml } from '@/lib/email-html';
import { authorizeCronRequest } from '@/lib/cron-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const unauthorized = authorizeCronRequest(req);
    if (unauthorized) return unauthorized;

    const supabaseAdmin = getSupabaseAdmin();

    // Atomically claim due jobs so overlapping AWS invocations cannot send twice.
    const { data: claimedJobs, error: claimError } = await supabaseAdmin.rpc(
      'claim_due_scheduled_emails',
      { p_batch_size: 25, p_lease_seconds: 300 }
    );

    if (claimError) {
      console.error('Failed to claim scheduled emails:', claimError);
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }

    const claimedIds = (claimedJobs || []).map((job: { job_id: string }) => job.job_id);
    const { data: dueJobs, error: queryError } = claimedIds.length
      ? await supabaseAdmin
          .from('scheduled_emails')
          .select('*, outreach_record:outreach_records(*, contact:contacts(*)), account:email_accounts(*)')
          .in('id', claimedIds)
      : { data: [], error: null };

    if (queryError) {
      console.error('Failed to query due scheduled emails:', queryError);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    const results = {
      found: dueJobs?.length || 0,
      processed: 0,
      sent: 0,
      failed: 0,
      details: [] as any[],
    };

    if (dueJobs && dueJobs.length > 0) {
      for (const job of dueJobs) {
        results.processed++;

        try {
          const account = job.account;
          if (!account || !account.refresh_token_enc) {
            throw new Error(`Email account credentials not found for job ${job.id}`);
          }

          const recipientEmail =
            job.outreach_record?.contact?.email || job.approved_recipient_email;

          if (!recipientEmail) {
            throw new Error(`Recipient email address not found for job ${job.id}`);
          }

          const refreshToken = decryptToken(account.refresh_token_enc);
          const oauth2Client = getGoogleOAuth2Client();
          oauth2Client.setCredentials({ refresh_token: refreshToken });

          const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

          const htmlBody = sanitizeEmailHtml(normalizeTemplateHtml(job.approved_body));
          const textBody = htmlToPlainText(htmlBody);

          // Build raw message
          const rawMessage = buildRawMimeMessage({
            from: account.email_address,
            to: recipientEmail,
            subject: job.approved_subject,
            textBody,
            htmlBody,
          });

          // Send via Gmail API
          const sendRes = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
              raw: rawMessage,
            },
          });

          const gmailMessageId = sendRes.data.id || null;
          const gmailThreadId = sendRes.data.threadId || null;

          // Record in email_messages
          const { data: messageRecord } = await supabaseAdmin
            .from('email_messages')
            .insert({
              user_id: job.user_id,
              outreach_record_id: job.outreach_record_id,
              email_account_id: account.id,
              direction: 'outgoing',
              sender_email: account.email_address,
              recipient_email: recipientEmail,
              subject: job.approved_subject,
              body_html: htmlBody,
              body_text: textBody,
              gmail_message_id: gmailMessageId,
              gmail_thread_id: gmailThreadId,
              sent_at: new Date().toISOString(),
            })
            .select()
            .single();

          // Mark job as sent
          await supabaseAdmin
            .from('scheduled_emails')
            .update({
              status: 'sent',
              sent_message_id: messageRecord?.id || null,
              locked_until: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id);

          // Update outreach_record
          if (job.outreach_record_id) {
            await supabaseAdmin
              .from('outreach_records')
              .update({
                current_status: 'Sent',
                sent_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', job.outreach_record_id);

            const followupDays = job.outreach_record?.followup_days || 5;
            const dueAt = new Date(Date.now() + followupDays * 24 * 60 * 60 * 1000).toISOString();
            const { data: existingReminder } = await supabaseAdmin
              .from('followup_reminders')
              .select('id')
              .eq('outreach_record_id', job.outreach_record_id)
              .in('status', ['pending', 'snoozed'])
              .limit(1)
              .maybeSingle();
            if (!existingReminder) {
              await supabaseAdmin.from('followup_reminders').insert({
                user_id: job.user_id,
                outreach_record_id: job.outreach_record_id,
                due_at: dueAt,
                status: 'pending',
                sequence_number: 1,
              });
            }
          }

          results.sent++;
          results.details.push({
            id: job.id,
            to: recipientEmail,
            status: 'sent',
            gmailMessageId,
          });
        } catch (jobErr: any) {
          results.failed++;
          results.details.push({
            id: job.id,
            status: 'failed',
            error: jobErr.message || String(jobErr),
          });

          await supabaseAdmin
            .from('scheduled_emails')
            .update({
              status: 'failed',
              last_error: jobErr.message || String(jobErr),
              locked_until: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error: any) {
    console.error('Worker error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
