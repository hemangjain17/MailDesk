export type OutreachStatus =
  | 'Draft'
  | 'Scheduled'
  | 'Sending'
  | 'Sent'
  | 'Failed'
  | 'Replied'
  | 'Follow-up Due'
  | 'Closed';

export type JobStatus = 'pending' | 'locked' | 'sent' | 'failed' | 'cancelled';

export interface UserProfile {
  id: string;
  full_name: string | null;
  timezone: string;
  default_followup_days: number;
  default_signature: string;
  portfolio_url: string;
  linkedin_url: string;
}

export interface EmailAccount {
  id: string;
  user_id: string;
  provider: 'gmail';
  email_address: string;
  connection_status: 'connected' | 'disconnected' | 'expired';
  last_sync_at: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  name: string | null;
  email: string;
  company: string | null;
  position: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DateGroup {
  id: string;
  user_id: string;
  group_date: string; // YYYY-MM-DD
  label: string | null;
  created_at: string;
  count?: number;
}

export interface EmailTemplate {
  id: string;
  user_id: string;
  name: string;
  subject: string;
  body: string;
  signature: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface OutreachRecord {
  id: string;
  user_id: string;
  contact_id: string;
  date_group_id: string | null;
  template_id: string | null;
  company_override: string | null;
  position_override: string | null;
  job_link?: string | null;
  subject_override: string | null;
  body_override: string | null;
  current_status: OutreachStatus;
  followup_days: number;
  scheduled_send_at: string | null;
  sent_at: string | null;
  last_reply_at: string | null;
  created_at: string;
  updated_at: string;

  // Joined fields for spreadsheet display
  contact: Contact;
  template?: EmailTemplate | null;
  date_group?: DateGroup | null;
  latest_message?: EmailMessage | null;
  followup_reminder?: FollowupReminder | null;
}

export interface EmailMessage {
  id: string;
  user_id: string;
  outreach_record_id: string | null;
  email_account_id: string | null;
  direction: 'outgoing' | 'incoming';
  sender_email: string;
  recipient_email: string;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  internet_message_id: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
}

export interface ScheduledEmail {
  id: string;
  user_id: string;
  outreach_record_id: string;
  email_account_id: string;
  approved_subject: string;
  approved_body: string;
  approved_attachments: Array<{
    filename: string;
    storage_path?: string;
    mime_type?: string;
    size_bytes?: number;
  }>;
  scheduled_at: string;
  status: JobStatus;
  attempt_count: number;
  last_error: string | null;
  idempotency_key: string;
  locked_until: string | null;
  sent_message_id: string | null;
  created_at: string;
  outreach_record?: OutreachRecord;
}

export interface FollowupReminder {
  id: string;
  user_id: string;
  outreach_record_id: string;
  due_at: string;
  status: 'pending' | 'reminded' | 'completed' | 'snoozed' | 'dismissed';
  reminded_at: string | null;
  completed_at: string | null;
  created_at: string;
  outreach_record?: OutreachRecord;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  type: 'reply_received' | 'email_sent' | 'send_failed' | 'followup_due' | 'account_disconnected' | 'batch_completed';
  title: string;
  message: string;
  related_record_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface TemplateVariables {
  recipient_name?: string;
  company?: string;
  position?: string;
  sender_name?: string;
  sender_email?: string;
  portfolio_url?: string;
  linkedin_url?: string;
  job_link?: string;
}
