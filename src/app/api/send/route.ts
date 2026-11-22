import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/crypto';
import { buildRawMimeMessage, getGoogleOAuth2Client } from '@/lib/gmail';
import { google } from 'googleapis';
import { normalizeTemplateHtml, sanitizeEmailHtml } from '@/lib/email-html';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      to,
      subject,
      textBody,
      htmlBody,
      outreachRecordId,
      replyToOriginal,
      replyToMessageId,
      replyToThreadId,
      originalSubject: clientOriginalSubject,
    } = body;

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

    const cleanHtmlBody = sanitizeEmailHtml(normalizeTemplateHtml(htmlBody || textBody));
    let effectiveSubject = subject;
    let replyThreadId: string | undefined;
    let inReplyTo: string | undefined;
    let references: string | undefined;

    if (replyToOriginal) {
      if (!outreachRecordId) {
        return NextResponse.json(
          { error: 'An outreach record is required to send a threaded follow-up.' },
          { status: 400 }
        );
      }

      const { data: storedOriginalMessage, error: originalError } = await supabaseAdmin
        .from('email_messages')
        .select('gmail_message_id, gmail_thread_id, internet_message_id, subject')
        .eq('outreach_record_id', outreachRecordId)
        .eq('direction', 'outgoing')
        .order('sent_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const originalMessage = storedOriginalMessage?.gmail_message_id
        ? storedOriginalMessage
        : replyToMessageId
          ? {
              gmail_message_id: replyToMessageId,
              gmail_thread_id: replyToThreadId || null,
              internet_message_id: null,
              subject: clientOriginalSubject || subject,
            }
          : null;

      if (originalError || !originalMessage?.gmail_message_id) {
        return NextResponse.json(
          { error: 'The original sent Gmail message could not be found. Follow-up was not sent as a new email.' },
          { status: 409 }
        );
      }

      try {
        const originalMetadata = await gmail.users.messages.get({
          userId: 'me',
          id: originalMessage.gmail_message_id,
          format: 'metadata',
          metadataHeaders: ['Message-ID', 'References', 'Subject'],
        });
        const originalHeaders = originalMetadata.data.payload?.headers || [];
        const messageId =
          originalMessage.internet_message_id ||
          originalHeaders.find(header => header.name?.toLowerCase() === 'message-id')?.value ||
          undefined;
        const priorReferences =
          originalHeaders.find(header => header.name?.toLowerCase() === 'references')?.value || '';

        if (!messageId) throw new Error('Original RFC Message-ID is missing.');

        replyThreadId = originalMetadata.data.threadId || originalMessage.gmail_thread_id || undefined;
        if (!replyThreadId) throw new Error('Original Gmail thread ID is missing.');
        inReplyTo = messageId;
        references = `${priorReferences} ${messageId}`.trim();
        const metadataSubject =
          originalHeaders.find(header => header.name?.toLowerCase() === 'subject')?.value || '';
        const originalSubject = metadataSubject || originalMessage.subject || subject;
        effectiveSubject = /^re:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`;
      } catch (metadataError) {
        console.error('Could not load original Gmail metadata:', metadataError);
        return NextResponse.json(
          { error: 'The original Gmail message is unavailable. Follow-up was not sent as a new email.' },
          { status: 409 }
        );
      }
    }

    // Build RFC 2822 MIME message
    const rawMessage = buildRawMimeMessage({
      from: account.email_address,
      to,
      subject: effectiveSubject,
      textBody,
      htmlBody: cleanHtmlBody,
      inReplyTo,
      references,
    });

    // Send via official Gmail API
    const sendRes = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage,
        ...(replyThreadId ? { threadId: replyThreadId } : {}),
      },
    });

    const gmailMessageId = sendRes.data.id || null;
    const gmailThreadId = sendRes.data.threadId || null;
    let internetMessageId: string | null = null;

    if (gmailMessageId) {
      try {
        const sentMetadata = await gmail.users.messages.get({
          userId: 'me',
          id: gmailMessageId,
          format: 'metadata',
          metadataHeaders: ['Message-ID'],
        });
        internetMessageId =
          sentMetadata.data.payload?.headers?.find(header => header.name?.toLowerCase() === 'message-id')?.value ||
          null;
      } catch (metadataError) {
        console.warn('Sent message metadata could not be loaded:', metadataError);
      }
    }

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
        subject: effectiveSubject,
        body_html: cleanHtmlBody,
        body_text: textBody,
        gmail_message_id: gmailMessageId,
        gmail_thread_id: gmailThreadId,
        internet_message_id: internetMessageId,
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
      internetMessageId,
      subject: effectiveSubject,
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
