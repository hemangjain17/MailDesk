import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/crypto';
import { buildRawMimeMessage, getGoogleOAuth2Client } from '@/lib/gmail';
import { google } from 'googleapis';
import { normalizeTemplateHtml, sanitizeEmailHtml } from '@/lib/email-html';
import { requireSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.error) return session.error;
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
      templateId,
      templateName,
      recipientName,
      company,
      position,
      jobLink,
      followupDays,
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
      .eq('user_id', session.userId)
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
    let threadFallbackReason: string | null = null;
    const isUuid = (value: unknown): value is string =>
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    let persistedOutreachId: string | null = isUuid(outreachRecordId) ? outreachRecordId : null;
    if (!persistedOutreachId && outreachRecordId) {
      const { data: correlatedOutreach } = await supabaseAdmin
        .from('outreach_records')
        .select('id')
        .eq('user_id', account.user_id)
        .eq('client_outreach_id', outreachRecordId)
        .maybeSingle();
      persistedOutreachId = correlatedOutreach?.id || null;
    }

    if (!persistedOutreachId) {
      const normalizedEmail = String(to).trim().toLowerCase();
      let { data: contact, error: contactLookupError } = await supabaseAdmin
        .from('contacts')
        .select('*')
        .eq('user_id', account.user_id)
        .ilike('email', normalizedEmail)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (contactLookupError) throw contactLookupError;

      if (!contact) {
        const { data: createdContact, error: contactError } = await supabaseAdmin
          .from('contacts')
          .insert({
            user_id: account.user_id,
            email: normalizedEmail,
            name: recipientName || null,
            company: company || null,
            position: position || null,
          })
          .select()
          .single();
        if (contactError) throw contactError;
        contact = createdContact;
      }

      const { data: createdOutreach, error: outreachError } = await supabaseAdmin
        .from('outreach_records')
        .insert({
          user_id: account.user_id,
          contact_id: contact.id,
          client_outreach_id: outreachRecordId || null,
          current_status: 'Draft',
          job_link: jobLink || null,
          followup_days: followupDays || 5,
        })
        .select()
        .single();
      if (outreachError) throw outreachError;
      persistedOutreachId = createdOutreach.id;
    }

    if (replyToOriginal) {
      if (!outreachRecordId) {
        return NextResponse.json(
          { error: 'An outreach record is required to send a threaded follow-up.' },
          { status: 400 }
        );
      }

      let storedOriginalMessage: any = null;
      let originalError: any = null;
      const originalQuery = supabaseAdmin
        .from('email_messages')
        .select('gmail_message_id, gmail_thread_id, internet_message_id, subject, client_template_id, template_name')
        .eq('direction', 'outgoing')
        .order('sent_at', { ascending: true })
        .limit(1);

      if (persistedOutreachId) {
        const result = await originalQuery.eq('outreach_record_id', persistedOutreachId).maybeSingle();
        storedOriginalMessage = result.data;
        originalError = result.error;
      } else {
        const result = await originalQuery.eq('client_outreach_id', outreachRecordId).maybeSingle();
        storedOriginalMessage = result.data;
        originalError = result.error;
      }

      if (originalError) {
        console.warn('Original message database lookup failed; trying Gmail fallback:', originalError.message);
      }

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

      if (!originalMessage?.gmail_message_id) {
        threadFallbackReason = 'The original Gmail message record could not be found.';
      } else try {
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
        threadFallbackReason = 'The original Gmail thread metadata was unavailable.';
        replyThreadId = undefined;
        inReplyTo = undefined;
        references = undefined;
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

    // Log in Supabase email_messages. Client-generated outreach IDs are stored
    // separately because the relational outreach_record_id column requires UUIDs.
    const messagePayload = {
        user_id: account.user_id,
        outreach_record_id: persistedOutreachId,
        client_outreach_id: outreachRecordId || null,
        client_template_id: templateId || null,
        template_name: templateName || null,
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
      };
    const { error: messageLogError } = await supabaseAdmin
      .from('email_messages')
      .insert(messagePayload);

    if (messageLogError) {
      console.error('Gmail sent successfully but message history logging failed:', messageLogError);
      // Keep basic history working before the correlation migration is applied.
      const { client_outreach_id, client_template_id, template_name, ...legacyPayload } = messagePayload;
      const { error: legacyLogError } = await supabaseAdmin.from('email_messages').insert(legacyPayload);
      if (legacyLogError) {
        console.error('Legacy message history logging also failed:', legacyLogError);
      }
    }

    let createdFollowupReminder: any = null;
    if (persistedOutreachId) {
      await supabaseAdmin
        .from('outreach_records')
        .update({
          current_status: 'Sent',
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', persistedOutreachId);

      if (!replyToOriginal && followupDays) {
        const dueAt = new Date(Date.now() + Number(followupDays) * 24 * 60 * 60 * 1000).toISOString();
        const { data: existingReminder } = await supabaseAdmin
          .from('followup_reminders')
          .select('*')
          .eq('outreach_record_id', persistedOutreachId)
          .in('status', ['pending', 'snoozed'])
          .limit(1)
          .maybeSingle();
        if (existingReminder) {
          createdFollowupReminder = existingReminder;
        } else {
          const { data: insertedReminder } = await supabaseAdmin
            .from('followup_reminders')
            .insert({
              user_id: account.user_id,
              outreach_record_id: persistedOutreachId,
              due_at: dueAt,
              status: 'pending',
              sequence_number: 1,
            })
            .select()
            .single();
          createdFollowupReminder = insertedReminder;
        }
      }
    }

    return NextResponse.json({
      success: true,
      sender: account.email_address,
      recipient: to,
      gmailMessageId,
      gmailThreadId,
      internetMessageId,
      subject: effectiveSubject,
      sentAsNewMessage: Boolean(replyToOriginal && !replyThreadId),
      threadFallbackReason,
      templateId: templateId || null,
      templateName: templateName || null,
      sentAt: new Date().toISOString(),
      outreachRecordId: persistedOutreachId,
      followupReminder: createdFollowupReminder,
    });
  } catch (error: any) {
    console.error('Error sending email via Gmail API:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}
