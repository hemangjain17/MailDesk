-- MailDesk Initial Schema Migration
-- Matches README specifications with RLS, atomic lease claiming, and indexing.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  default_followup_days INTEGER NOT NULL DEFAULT 5,
  default_signature TEXT DEFAULT '',
  portfolio_url TEXT DEFAULT '',
  linkedin_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Email Accounts (Encrypted OAuth Tokens)
CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gmail',
  email_address TEXT NOT NULL,
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  token_expiry TIMESTAMPTZ,
  connection_status TEXT NOT NULL DEFAULT 'connected' CHECK (connection_status IN ('connected', 'disconnected', 'expired')),
  last_sync_at TIMESTAMPTZ,
  gmail_history_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_provider_email UNIQUE (user_id, provider, email_address)
);

-- 3. Date Groups (Organizational Date Tabs)
CREATE TABLE IF NOT EXISTS date_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_date DATE NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_group_date UNIQUE (user_id, group_date)
);

-- 4. Contacts Table
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT NOT NULL,
  company TEXT,
  position TEXT,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contacts_user_email ON contacts(user_id, email);

-- 5. Email Templates
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  signature TEXT DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Attachments (Stored in Supabase Storage)
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  is_default_resume BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Outreach Records (Core spreadsheet row state)
CREATE TABLE IF NOT EXISTS outreach_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  date_group_id UUID REFERENCES date_groups(id) ON DELETE SET NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  company_override TEXT,
  position_override TEXT,
  subject_override TEXT,
  body_override TEXT,
  current_status TEXT NOT NULL DEFAULT 'Draft' CHECK (
    current_status IN ('Draft', 'Scheduled', 'Sending', 'Sent', 'Failed', 'Replied', 'Follow-up Due', 'Closed')
  ),
  followup_days INTEGER NOT NULL DEFAULT 5,
  scheduled_send_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_reply_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outreach_user_status ON outreach_records(user_id, current_status);
CREATE INDEX IF NOT EXISTS idx_outreach_date_group ON outreach_records(user_id, date_group_id);

-- 8. Email Messages (Thread & Direction tracking)
CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outreach_record_id UUID REFERENCES outreach_records(id) ON DELETE CASCADE,
  email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outgoing', 'incoming')),
  sender_email TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  internet_message_id TEXT,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON email_messages(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_outreach_record ON email_messages(outreach_record_id);

-- 9. Scheduled Emails (Durable Queue)
CREATE TABLE IF NOT EXISTS scheduled_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outreach_record_id UUID NOT NULL REFERENCES outreach_records(id) ON DELETE CASCADE,
  email_account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE RESTRICT,
  approved_subject TEXT NOT NULL,
  approved_body TEXT NOT NULL,
  approved_attachments JSONB DEFAULT '[]'::jsonb,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'locked', 'sent', 'failed', 'cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  locked_until TIMESTAMPTZ,
  sent_message_id UUID REFERENCES email_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_queue ON scheduled_emails(status, scheduled_at) WHERE status IN ('pending', 'locked');

-- 10. Follow-up Reminders
CREATE TABLE IF NOT EXISTS followup_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outreach_record_id UUID NOT NULL REFERENCES outreach_records(id) ON DELETE CASCADE,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reminded', 'completed', 'snoozed', 'dismissed')),
  reminded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_followups_due ON followup_reminders(user_id, status, due_at);

-- 11. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('reply_received', 'email_sent', 'send_failed', 'followup_due', 'account_disconnected', 'batch_completed')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_record_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

-- 12. Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outreach_record_id UUID REFERENCES outreach_records(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE date_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Standard owner policies
CREATE POLICY "Users can manage own profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users can manage own email_accounts" ON email_accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own contacts" ON contacts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own date_groups" ON date_groups FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own email_templates" ON email_templates FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own attachments" ON attachments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own outreach_records" ON outreach_records FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own email_messages" ON email_messages FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own scheduled_emails" ON scheduled_emails FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own followup_reminders" ON followup_reminders FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own notifications" ON notifications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own activity_logs" ON activity_logs FOR ALL USING (auth.uid() = user_id);

-- ==========================================================
-- ATOMIC QUEUE CLAIMING STORED PROCEDURE
-- ==========================================================
CREATE OR REPLACE FUNCTION claim_due_scheduled_emails(
  p_batch_size INT DEFAULT 20,
  p_lease_seconds INT DEFAULT 300
)
RETURNS TABLE (
  job_id UUID,
  job_user_id UUID,
  job_outreach_record_id UUID,
  job_email_account_id UUID,
  job_approved_subject TEXT,
  job_approved_body TEXT,
  job_approved_attachments JSONB,
  job_scheduled_at TIMESTAMPTZ,
  job_attempt_count INT,
  job_idempotency_key TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT s.id
    FROM scheduled_emails s
    WHERE (
      (s.status = 'pending' AND s.scheduled_at <= NOW())
      OR (s.status = 'locked' AND s.locked_until < NOW())
    )
    ORDER BY s.scheduled_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE scheduled_emails s
  SET 
    status = 'locked',
    locked_until = NOW() + (p_lease_seconds || ' seconds')::INTERVAL,
    attempt_count = s.attempt_count + 1,
    updated_at = NOW()
  FROM claimable c
  WHERE s.id = c.id
  RETURNING 
    s.id,
    s.user_id,
    s.outreach_record_id,
    s.email_account_id,
    s.approved_subject,
    s.approved_body,
    s.approved_attachments,
    s.scheduled_at,
    s.attempt_count,
    s.idempotency_key;
END;
$$;
