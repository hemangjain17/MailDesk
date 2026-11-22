import { google } from 'googleapis';

export interface ComposeEmailOptions {
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    contentBase64: string;
  }>;
}

/**
 * Builds an RFC 2822 compliant MIME message string and base64url encodes it for the Gmail API.
 */
export function buildRawMimeMessage(options: ComposeEmailOptions): string {
  const boundary = `====boundary_${Date.now()}_${Math.random().toString(36).substring(2, 9)}====`;
  const altBoundary = `====alt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}====`;

  const headers: string[] = [
    `From: ${options.from}`,
    `To: ${options.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(options.subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
  ];

  if (options.inReplyTo) {
    headers.push(`In-Reply-To: ${options.inReplyTo}`);
  }
  if (options.references) {
    headers.push(`References: ${options.references}`);
  }

  const hasAttachments = options.attachments && options.attachments.length > 0;

  let mimeBody = '';

  if (hasAttachments) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    mimeBody += `--${boundary}\r\n`;
    mimeBody += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;

    // Plain text part
    mimeBody += `--${altBoundary}\r\n`;
    mimeBody += `Content-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: 7bit\r\n\r\n`;
    mimeBody += `${options.textBody}\r\n\r\n`;

    // HTML part
    if (options.htmlBody) {
      mimeBody += `--${altBoundary}\r\n`;
      mimeBody += `Content-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: 7bit\r\n\r\n`;
      mimeBody += `${options.htmlBody}\r\n\r\n`;
    }
    mimeBody += `--${altBoundary}--\r\n\r\n`;

    // Attachments
    for (const att of options.attachments!) {
      mimeBody += `--${boundary}\r\n`;
      mimeBody += `Content-Type: ${att.contentType}; name="${att.filename}"\r\n`;
      mimeBody += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
      mimeBody += `Content-Transfer-Encoding: base64\r\n\r\n`;
      mimeBody += `${att.contentBase64}\r\n\r\n`;
    }
    mimeBody += `--${boundary}--`;
  } else {
    // No attachments
    if (options.htmlBody) {
      headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
      mimeBody += `--${altBoundary}\r\n`;
      mimeBody += `Content-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: 7bit\r\n\r\n`;
      mimeBody += `${options.textBody}\r\n\r\n`;

      mimeBody += `--${altBoundary}\r\n`;
      mimeBody += `Content-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: 7bit\r\n\r\n`;
      mimeBody += `${options.htmlBody}\r\n\r\n`;
      mimeBody += `--${altBoundary}--`;
    } else {
      headers.push('Content-Type: text/plain; charset="UTF-8"');
      headers.push('Content-Transfer-Encoding: 7bit');
      mimeBody = options.textBody;
    }
  }

  const rawMessage = `${headers.join('\r\n')}\r\n\r\n${mimeBody}`;

  // Gmail API requires base64url format
  return Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Resolves the active base URL for OAuth callbacks and links.
 * Uses the explicitly configured public URL in production and localhost only
 * while running the local development server.
 */
export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_APP_URL must be configured for a production deployment');
  }
  return 'http://localhost:3000';
}

/**
 * Creates an authorized OAuth2 client for Google APIs
 */
export function getGoogleOAuth2Client() {
  const appUrl = getAppUrl();
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/auth/google/callback`
  );
}
