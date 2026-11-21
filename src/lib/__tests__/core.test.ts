import { describe, it, expect } from 'vitest';
import { parseBulkContacts } from '../parser';
import { renderTemplate, validateEmailForSending } from '../template';
import { calculateFollowupDueDate, isFollowupOverdue } from '../followup';
import { encryptToken, decryptToken } from '../crypto';
import { buildRawMimeMessage } from '../gmail';

describe('MailDesk Core Engine Tests', () => {
  describe('Bulk Contact Parser', () => {
    it('parses diverse delimiters: newlines, commas, semicolons, tabs', () => {
      const input = `
        alex@example.com
        sam@example.com, hr@google.com
        jordan@openai.com; careers@anthropic.com
        "Sundar Pichai" <sundar@google.com>
        invalid-email-address
      `;
      const result = parseBulkContacts(input);

      expect(result.valid.length).toBe(6);
      expect(result.valid.map(v => v.email)).toContain('alex@example.com');
      expect(result.valid.map(v => v.email)).toContain('sam@example.com');
      expect(result.valid.map(v => v.email)).toContain('hr@google.com');
      expect(result.valid.map(v => v.email)).toContain('sundar@google.com');

      const sundar = result.valid.find(v => v.email === 'sundar@google.com');
      expect(sundar?.name).toBe('Sundar Pichai');

      expect(result.invalid).toContain('invalid-email-address');
    });

    it('detects duplicates within the import and against existing contacts', () => {
      const existing = ['prior@example.com'];
      const input = `
        test@example.com
        TEST@example.com
        prior@example.com
      `;
      const result = parseBulkContacts(input, existing);
      expect(result.valid.length).toBe(1);
      expect(result.valid[0].email).toBe('test@example.com');
      expect(result.duplicates.length).toBe(2);
    });
  });

  describe('Template Engine', () => {
    it('correctly interpolates variables', () => {
      const body = 'Hi {{recipient_name}}, applying for {{position}} at {{company}}! Regards, {{sender_name}}.';
      const result = renderTemplate(body, {
        recipient_name: 'Satya',
        company: 'Microsoft',
        position: 'Software Engineer',
        sender_name: 'Hemang',
      });

      expect(result.renderedText).toBe(
        'Hi Satya, applying for Software Engineer at Microsoft! Regards, Hemang.'
      );
      expect(result.hasUnresolvedPlaceholders).toBe(false);
      expect(result.missingVariables.length).toBe(0);
    });

    it('detects unresolved placeholders and fails validation', () => {
      const subject = 'Role at {{company}}';
      const body = 'Hi {{recipient_name}}, noticed your opening for {{position}}!';
      const rendered = renderTemplate(body, {
        recipient_name: 'Alex',
        // missing position
      });

      expect(rendered.hasUnresolvedPlaceholders).toBe(true);
      expect(rendered.missingVariables).toContain('position');

      const val = validateEmailForSending(subject, rendered.renderedText);
      expect(val.isValid).toBe(false);
      expect(val.errors.some(e => e.includes('unresolved placeholders'))).toBe(true);
    });
  });

  describe('Crypto Token Security', () => {
    it('encrypts and decrypts OAuth tokens reliably', () => {
      const token = 'ya29.a0AfH6SMD_secret_refresh_token_test_12345';
      const encrypted = encryptToken(token);
      expect(encrypted).not.toBe(token);
      expect(encrypted.split(':').length).toBe(3);

      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(token);
    });
  });

  describe('Follow-up Calculation', () => {
    it('calculates calendar and business days properly', () => {
      // Friday 2026-11-20
      const friday = new Date('2026-11-20T10:00:00Z');

      // 3 business days: Mon, Tue, Wed -> Nov 25
      const dueDate = calculateFollowupDueDate(friday, 3, true);
      expect(dueDate.getUTCDay()).not.toBe(0); // Not Sun
      expect(dueDate.getUTCDay()).not.toBe(6); // Not Sat

      const pastDate = new Date('2026-11-01');
      expect(isFollowupOverdue(pastDate)).toBe(true);
    });
  });

  describe('Gmail RFC 2822 MIME Builder', () => {
    it('builds base64url encoded MIME message', () => {
      const raw = buildRawMimeMessage({
        from: 'me@example.com',
        to: 'candidate@example.com',
        subject: 'Job Inquiry',
        textBody: 'Hello world',
        htmlBody: '<p>Hello world</p>',
      });

      expect(typeof raw).toBe('string');
      expect(raw.length).toBeGreaterThan(20);
      expect(raw).not.toContain('+');
      expect(raw).not.toContain('/');
    });
  });
});
