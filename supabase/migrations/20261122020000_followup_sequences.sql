-- Tracks follow-up history and uniquely identifies follow-ups of follow-ups.
ALTER TABLE followup_reminders
  ADD COLUMN IF NOT EXISTS parent_reminder_id UUID REFERENCES followup_reminders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sequence_number INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_followup_parent ON followup_reminders(parent_reminder_id);
CREATE INDEX IF NOT EXISTS idx_followup_sequence ON followup_reminders(outreach_record_id, sequence_number);
