import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/crypto';
import { buildRawMimeMessage, getGoogleOAuth2Client } from '@/lib/gmail';
import { google } from 'googleapis';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, subject, textBody, htmlBody, outreachRecordId } = body;

    if (!to || !subject || !textBody) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, textBody' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Query active connected email account
    const { data: accounts, error: accErr } = await supabaseAdmin
      .from('email_accounts')
      .select('*')
      .eq('connection_status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (accErr || !accounts || accounts.length === 0) {
      return NextResponse.json(
        { error: 'No connected Gmail account found. Please connect in Settings first.' },
        { status: 400 }
      );
    }

    const account = accounts[0];
    if (!account.refresh_token_enc) {
      return NextResponse.json(
        { error: 'Connected account is missing refresh tokens. Please reconnect.' },
        { status: 400 }
      );
    }

    const refreshToken = decryptToken(account.refresh_token_enc);
    const oauth2Client = getGoogleOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Build RFC 2822 MIME message
    const rawMessage = buildRawMimeMessage({
      from: account.email_address,
      to,
      subject,
      textBody,
      htmlBody: htmlBody || `<p>${textBody.replace(/\n/g, '<br/>')}</p>`,
    });

    // Send via official Gmail API
    const sendRes = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage,
      },
    });

    const gmailMessageId = sendRes.data.id || null;
    const gmailThreadId = sendRes.data.threadId || null;

    // Log in Supabase email_messages
    const { data: insertedMsg } = await supabaseAdmin
      .from('email_messages')
      .insert({
        user_id: account.user_id,
        outreach_record_id: outreachRecordId || null,
        email_account_id: account.id,
        direction: 'outgoing',
        sender_email: account.email_address,
        recipient_email: to,
        subject,
        body_text: textBody,
        gmail_message_id: gmailMessageId,
        gmail_thread_id: gmailThreadId,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (outreachRecordId) {
      await supabaseAdmin
        .from('outreach_records')
        .update({
          current_status: 'Sent',
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', outreachRecordId);
    }

    return NextResponse.json({
      success: true,
      sender: account.email_address,
      recipient: to,
      gmailMessageId,
      gmailThreadId,
      sentAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error sending email via Gmail API:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}
