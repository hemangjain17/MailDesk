ALTER TABLE email_messages
ADD COLUMN IF NOT EXISTS client_outreach_id TEXT,
ADD COLUMN IF NOT EXISTS client_template_id TEXT,
ADD COLUMN IF NOT EXISTS template_name TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_client_outreach
ON email_messages(client_outreach_id, direction, sent_at);
