import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/crypto';
import { getGoogleOAuth2Client } from '@/lib/gmail';
import { extractNameAndEmail } from '@/lib/parser';
import { google } from 'googleapis';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isVercelCron = req.headers.get('x-vercel-cron') === '1';

    if (
      cronSecret &&
      !isVercelCron &&
      authHeader !== `Bearer ${cronSecret}` &&
      req.nextUrl.searchParams.get('secret') !== cronSecret &&
      req.headers.get('host') !== 'localhost:3000' &&
      !req.headers.get('host')?.startsWith('127.0.0.1')
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Query active connected accounts
    const { data: accounts, error: accErr } = await supabaseAdmin
      .from('email_accounts')
      .select('*')
      .eq('connection_status', 'connected');

    if (accErr || !accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'No connected accounts found' }, { status: 400 });
    }

    const summary = {
      accountsChecked: accounts.length,
      threadsScanned: 0,
      repliesDetected: 0,
      syncedThreads: [] as any[],
    };

    for (const account of accounts) {
      if (!account.refresh_token_enc) continue;

      const refreshToken = decryptToken(account.refresh_token_enc);
      const oauth2Client = getGoogleOAuth2Client();
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Fetch recent 25 threads
      const threadsRes = await gmail.users.threads.list({
        userId: 'me',
        maxResults: 25,
      });

      const threads = threadsRes.data.threads || [];
      summary.threadsScanned += threads.length;

      for (const th of threads) {
        if (!th.id) continue;

        const threadDetail = await gmail.users.threads.get({
          userId: 'me',
          id: th.id,
        });

        const msgs = threadDetail.data.messages || [];
        if (msgs.length < 2) continue; // Only threads with responses

        // Find incoming message that is not from the user
        const incomingMessages = msgs.filter(m => {
          const headers = m.payload?.headers || [];
          const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
          return !from.toLowerCase().includes(account.email_address.toLowerCase());
        });

        if (incomingMessages.length === 0) continue;

        // Extract participant email from incoming message
        const firstIncoming = incomingMessages[0];
        const incHeaders = firstIncoming.payload?.headers || [];
        const fromHeader = incHeaders.find(h => h.name?.toLowerCase() === 'from')?.value || '';
        const subjHeader = incHeaders.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
        const parsed = extractNameAndEmail(fromHeader);
        const contactEmail = parsed?.email || fromHeader;
        const contactName = parsed?.name || contactEmail.split('@')[0];

        // Match or create Contact in Supabase Cloud
        let contactId = '';
        let outreachId = '';

        const { data: existingContact } = await supabaseAdmin
          .from('contacts')
          .select('*')
          .eq('email', contactEmail)
          .maybeSingle();

        if (existingContact) {
          contactId = existingContact.id;
        } else {
          const { data: newContact } = await supabaseAdmin
            .from('contacts')
            .insert({
              user_id: account.user_id,
              email: contactEmail,
              name: contactName,
              company: 'Direct Lead',
              position: 'Recipient',
            })
            .select()
            .single();
          if (newContact) contactId = newContact.id;
        }

        // Match or create Outreach Record
        const { data: existingOutreach } = await supabaseAdmin
          .from('outreach_records')
          .select('*')
          .eq('contact_id', contactId)
          .maybeSingle();

        if (existingOutreach) {
          outreachId = existingOutreach.id;
          await supabaseAdmin
            .from('outreach_records')
            .update({
              current_status: 'Replied',
              last_reply_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', outreachId);
        } else {
          const { data: newOutreach } = await supabaseAdmin
            .from('outreach_records')
            .insert({
              user_id: account.user_id,
              contact_id: contactId,
              current_status: 'Replied',
              last_reply_at: new Date().toISOString(),
            })
            .select()
            .single();
          if (newOutreach) outreachId = newOutreach.id;
        }

        // Helper to extract body text from Gmail payload
        const extractBodyText = (msg: any): string => {
          if (msg.snippet) return msg.snippet;
          let body = '';
          const parts = msg.payload?.parts;
          if (parts && Array.isArray(parts)) {
            for (const p of parts) {
              if (p.mimeType === 'text/plain' && p.body?.data) {
                body = Buffer.from(p.body.data, 'base64').toString('utf8');
                break;
              }
            }
          } else if (msg.payload?.body?.data) {
            body = Buffer.from(msg.payload.body.data, 'base64').toString('utf8');
          }
          return body || msg.snippet || '';
        };

        // Sync every message in this thread to email_messages
        for (const m of msgs) {
          const mHeaders = m.payload?.headers || [];
          const mFrom = mHeaders.find(h => h.name?.toLowerCase() === 'from')?.value || '';
          const mTo = mHeaders.find(h => h.name?.toLowerCase() === 'to')?.value || '';
          const mSubj = mHeaders.find(h => h.name?.toLowerCase() === 'subject')?.value || subjHeader;
          const isIncoming = !mFrom.toLowerCase().includes(account.email_address.toLowerCase());
          const bodyText = extractBodyText(m);

          // Check if message already recorded
          const { data: existingMsg } = await supabaseAdmin
            .from('email_messages')
            .select('id')
            .eq('gmail_message_id', m.id)
            .maybeSingle();

          if (!existingMsg) {
            await supabaseAdmin.from('email_messages').insert({
              user_id: account.user_id,
              outreach_record_id: outreachId,
              email_account_id: account.id,
              direction: isIncoming ? 'incoming' : 'outgoing',
              sender_email: mFrom,
              recipient_email: mTo,
              subject: mSubj,
              body_text: bodyText,
              gmail_message_id: m.id,
              gmail_thread_id: th.id,
              received_at: isIncoming ? new Date().toISOString() : null,
              sent_at: !isIncoming ? new Date().toISOString() : null,
            });
          }
        }

        // Cancel pending followups
        await supabaseAdmin
          .from('followup_reminders')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('outreach_record_id', outreachId)
          .eq('status', 'pending');

        // Create in-app notification if not exists
        await supabaseAdmin.from('notifications').insert({
          user_id: account.user_id,
          type: 'reply_received',
          title: `New Reply from ${contactName}`,
          message: `${contactName} (${contactEmail}) replied: "${firstIncoming.snippet || 'Reply received'}"`,
          related_record_id: outreachId,
          is_read: false,
        });

        summary.repliesDetected++;
        summary.syncedThreads.push({
          threadId: th.id,
          contact: contactEmail,
          snippet: firstIncoming.snippet,
        });
      }

      // Update account last_sync_at
      await supabaseAdmin
        .from('email_accounts')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', account.id);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
    });
  } catch (error: any) {
    console.error('Sync Gmail error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
