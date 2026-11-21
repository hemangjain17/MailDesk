import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/crypto';
import { buildRawMimeMessage, getGoogleOAuth2Client } from '@/lib/gmail';
import { google } from 'googleapis';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Allow authorization via Bearer token OR internal app query param ?secret=... OR local development
    const searchParams = req.nextUrl.searchParams;
    const querySecret = searchParams.get('secret');

    if (
      cronSecret &&
      authHeader !== `Bearer ${cronSecret}` &&
      querySecret !== cronSecret &&
      req.headers.get('host') !== 'localhost:3000' &&
      !req.headers.get('host')?.startsWith('127.0.0.1')
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Query due scheduled emails using service_role to bypass RLS
    const nowIso = new Date().toISOString();
    const { data: dueJobs, error: queryError } = await supabaseAdmin
      .from('scheduled_emails')
      .select('*, outreach_record:outreach_records(*, contact:contacts(*)), account:email_accounts(*)')
      .in('status', ['pending', 'locked'])
      .lte('scheduled_at', nowIso)
      .limit(25);

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

        // Lock job
        await supabaseAdmin
          .from('scheduled_emails')
          .update({
            status: 'locked',
            locked_until: new Date(Date.now() + 5 * 60000).toISOString(),
            attempt_count: (job.attempt_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

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

          // Build raw message
          const rawMessage = buildRawMimeMessage({
            from: account.email_address,
            to: recipientEmail,
            subject: job.approved_subject,
            textBody: job.approved_body,
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
              body_text: job.approved_body,
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
