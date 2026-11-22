-- Correlates browser-created spreadsheet rows with durable Supabase records.
ALTER TABLE outreach_records
  ADD COLUMN IF NOT EXISTS client_outreach_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_outreach_user_client_id
  ON outreach_records(user_id, client_outreach_id)
  WHERE client_outreach_id IS NOT NULL;
