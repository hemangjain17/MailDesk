# MailDesk — Personal Job Outreach & Email Scheduling Dashboard

> **Implementation brief for Google Antigravity.** Build a real, polished, spreadsheet-style personal outreach app. Do not replace working integrations with mock-only UI. Keep the scope focused: manually entered contacts, templates, scheduling, Gmail sending, reply tracking, notifications, and follow-up reminders.

## 1. Product goal

MailDesk is a lightweight personal job cold-emailing dashboard combining the ease of a spreadsheet with Gmail integration and reliable scheduling.

**Primary workflow:** Sign in → paste recipient emails → edit contact rows → choose templates → select multiple rows → right-click to schedule → approve personalized previews → send automatically at the scheduled time → detect replies → notify the user → remind about unanswered messages.

This is **not** a job scraper, company discovery tool, AI lead-generation platform, or complex CRM. All contacts are entered by the user.

## 2. Recommended stack

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Table, TanStack Query, React Hook Form, Zod, Lucide, Sonner, date-fns.
- **Backend:** Next.js server routes and/or Supabase Edge Functions.
- **Data and auth:** Supabase PostgreSQL, Auth, Row-Level Security, Realtime, Storage for optional attachments.
- **Email:** Gmail API with Google OAuth 2.0 for sending and reading threads.
- **Background work:** Supabase Cron / pg_cron plus Edge Functions, or a comparably reliable durable worker.
- **Deployment:** Vercel + Supabase.

Use stable package versions and document environment variables. Never expose Google refresh tokens or Supabase service-role keys to the browser.

## 3. UI structure

### Navigation

Sidebar: Dashboard, All Contacts, Scheduled, Sent, Replies / Inbox, Follow-ups, Email Templates, Settings. Keep it collapsible.

Top bar: product name, current page, connected Gmail account, unread notification bell, account menu.

Dashboard summary: total contacts, drafts, scheduled, sent, replies, follow-ups due. The spreadsheet is the main visual focus, not large decorative cards.

### Date-wise tabs

Show date tabs such as **20 Nov 2026**, **21 Nov 2026**, **22 Nov 2026**, and **+ New Date**.

- Automatically create tabs for new organizational dates; support manually creating tabs.
- Display counts per tab; provide **All Dates** and a calendar picker for older dates.
- Allow moving or explicitly copying rows between dates.
- Persist selected date and remember it across refreshes.
- **Keep organizational date separate from scheduled send timestamp**: a contact organized under 20 November may be scheduled to send on 22 November. Offer a setting for whether tabs represent organizational dates or scheduled dates, without silently losing records.

## 4. Bulk contact import

A prominent **Add Emails** button opens a modal with a large textarea.

Accept newlines, commas, semicolons, tabs, spaces, and spreadsheet-pasted data, for example:

```text
alex@example.com
sam@example.com, hr@example.com
jordan@example.com; careers@example.com
```

- Parse, trim, normalize, and validate addresses.
- Detect duplicates within the import and existing contacts.
- Show preview and counts for valid, invalid, and duplicate addresses.
- Allow skipping duplicates or updating existing contact records.
- Import valid entries as individual editable rows with `Draft` status and today's organizational date.
- Support a single manually added row and optional CSV import with column mapping.

## 5. Spreadsheet-style contact table

Use TanStack Table with compact rows, sticky header and selection column, resizing, sorting, filtering, column visibility, horizontal scrolling, and search.

| Column | Control | Behavior |
|---|---|---|
| Select | Checkbox | Individual, select-all, and multi-row actions |
| Recipient Name | Inline text | Editable |
| Email Address | Inline text | Validate |
| Company | Text / suggestions | Editable |
| Position | Text / suggestions | Editable |
| Email Template | Dropdown | Saved templates |
| Subject | Inline text | Template-derived, overridable |
| Status | Badge | Draft / Scheduled / Sending / Sent / Failed / Replied / Follow-up Due / Closed |
| Scheduled Date | Date picker | Optional |
| Scheduled Time | Time picker | Optional |
| Sent At | Timestamp | Read-only |
| Follow-up Due | Date | Automatic or manual |
| Last Reply | Timestamp | Read-only |
| Notes | Inline text | Editable |
| Actions | Menu | Preview, schedule, edit, delete |

**Interaction requirements:** double-click or Enter to edit; Tab navigates cells; Enter saves; Escape cancels; debounced auto-save with visible saving/error state; undo where feasible; no full-page refresh. Support checkbox selection, Shift-click range selection, Ctrl/Cmd-click, and a floating toolbar showing selected count.

## 6. Right-click context menu

Right-clicking a selected row applies the menu to all selected rows. Right-clicking an unselected row targets only that row. Preserve selection while the menu is open.

Actions:

- Schedule Email
- Send Now
- Change Email Template
- Change Position
- Change Company
- Set Follow-up Reminder
- Mark as Contacted
- Move to Date
- Duplicate Row
- View Email Preview
- Delete Selected Rows

Confirm destructive or sending actions, showing the exact affected row count. Never send merely because a user selected or right-clicked rows.

## 7. Reusable email templates

Provide a Templates page to create, edit, duplicate, and delete templates. Each has a name, subject, body, optional signature, and optional default attachment.

Supported placeholders:

```text
{{recipient_name}}
{{company}}
{{position}}
{{sender_name}}
{{sender_email}}
{{portfolio_url}}
{{linkedin_url}}
```

Example:

```text
Subject: Application for {{position}} at {{company}}

Hi {{recipient_name}},

I hope you're doing well. I'm reaching out to express my interest in
{{position}} opportunities at {{company}}.

I've attached my resume for reference and would welcome the opportunity
to discuss how my experience might fit your team.

Best regards,
{{sender_name}}
```

- Render each recipient's variables independently.
- Permit blank optional fields but warn about required missing values.
- **Never send unresolved placeholders.**
- Preview and override subject/body for an individual row without modifying the shared template.
- Save a **snapshot** of the approved rendered subject, body, signature, and attachments when scheduling. Later template edits must not silently change scheduled emails.
- Support plain text and simple safe rich-text formatting.

## 8. Multi-row scheduling

Workflow: select rows → right-click → **Schedule Email** → scheduling modal → preview → confirm.

Modal fields: selected recipient count and list, sending Gmail account, chosen template, date, time, time zone, optional interval between messages, validation results, and per-recipient previews.

Scheduling modes:

1. **Same time:** all selected messages become eligible at the chosen time.
2. **Sequential:** schedule each message with a configurable interval, e.g. 10:00, 10:02, 10:04.

Rules:

- Disallow past times; store timestamps in UTC and display in user timezone (default **Asia/Kolkata**).
- Validate recipients, template, rendered subject/body, attachment availability, and Gmail connection.
- Warn about duplicate contact/thread/schedule combinations.
- Require explicit approval of final recipients and message content.
- Persist durable scheduled jobs and allow edit, reschedule, and cancellation before processing.
- Scheduled messages must send even when the browser is closed.
- **Send Now** must also show a final confirmation and enqueue through the backend.
- No browser timers for actual delivery.

## 9. Gmail integration

Connect Gmail using official Google OAuth 2.0 and only the scopes necessary for sending and relevant thread synchronization. Implement secure token storage, refresh, revocation, and reconnect flows.

Settings should show connected email address, connection status, last sync, reconnect, and disconnect.

Document Google Cloud project setup, OAuth consent screen, Gmail API activation, redirect URIs, and potential Google verification requirements. Do not use browser automation or bypass provider restrictions.

## 10. Durable email sending worker

A server-side scheduled worker periodically:

1. Queries approved jobs due for sending.
2. Atomically claims jobs using locks or leases.
3. Rechecks approval, cancellation, duplicate-send safeguards, and Gmail connection.
4. Sends via Gmail API.
5. Saves Gmail message ID, thread ID, internet message ID when available, and actual sent timestamp.
6. Marks success or records a failure with actionable error details.

Include idempotency keys, rate-limit handling, exponential backoff, dead-letter/terminal failure states, manual retry, and execution logs. If Gmail times out after possibly accepting a message, reconcile before retrying rather than blindly sending a duplicate.

Distinguish **Scheduled**, **Sending**, **Sent**, and **Failed**. Never mark `Sent` before Gmail accepts the message. Document expected scheduling precision based on the cron interval.

## 11. Status and message history

Outreach statuses: Draft, Scheduled, Sending, Sent, Failed, Replied, Follow-up Due, Closed.

Maintain message-level and status-transition histories rather than overwriting prior messages. A contact may have multiple outgoing/incoming messages in the same Gmail thread. Allow manual correction of status without destroying the underlying events.

## 12. Reply detection and inbox

After each send, save sender, recipient, subject, sent timestamp, Gmail message ID, Gmail thread ID, and linked outreach record ID.

Implement periodic Gmail synchronization for the MVP; keep the design extensible to Gmail push notifications later.

- Retrieve messages incrementally using Gmail history IDs or equivalent sync state.
- Recover gracefully from expired history cursors.
- Match by thread IDs and message headers, not subject alone.
- Confirm incoming sender and exclude the user's own outgoing messages.
- Distinguish real replies from delivery failures and unrelated messages.
- Deduplicate imported messages.
- Update outreach status to `Replied`, save message, create notification, and cancel pending follow-up reminders.

**Replies / Inbox page:** two-panel layout. Left: conversations with sender, company, subject, preview, timestamp, unread indicator. Right: complete thread with outgoing and incoming messages, timestamps, and supported attachments. Actions: mark read, open in Gmail, copy address, add note, close, draft reply. Require approval before sending a reply.

## 13. Notifications

Persistent Supabase-backed in-app notifications with unread count, mark-read, mark-all-read, and deep links to records.

Events:

- New reply
- Successfully sent email
- Failed send
- Follow-up due
- Gmail disconnected
- Scheduled batch completed

Use Supabase Realtime to update the open UI. Optional browser notifications must be permission-based. For alerts while the site is closed, implement real web push (service worker + push subscriptions) or a reliable email notification fallback; do not misrepresent in-app notifications as offline push.

## 14. Follow-up reminders

Configurable default reminder interval (e.g. 3, 5, 7, 10 days), business-day vs calendar-day calculation, reminder time, timezone, and enable/disable preference.

After sending, calculate and persist follow-up due date. A server-side reminder worker checks due records, verifies whether a reply exists, and creates a notification if unanswered. If a reply arrives, cancel outstanding reminders.

Follow-ups page sections: Overdue, Due Today, Upcoming, Completed, Dismissed.

Each item shows recipient, company, position, original subject, sent date, days elapsed, due date, reply status, and actions:

- Draft Follow-up
- Remind Tomorrow
- Snooze 3 Days
- Change Due Date
- Mark Done
- Dismiss
- Close Conversation

**MVP reminder only:** do not automatically send follow-up emails. User reviews and sends them manually.

## 15. Attachments and sender signature

Allow secure Supabase Storage uploads for resumes and professional attachments (primarily PDF). Support multiple saved resumes, default attachment, per-row overrides, preview/removal, and size/type validation. Show attachments in the pre-send preview. Provide a reusable sender signature in Settings.

## 16. Search, filters, and bulk actions

Search names, email addresses, companies, positions, and subjects. Filter by date, status, company, position, template, replied/unreplied, and follow-up due. Combine filters. Bulk operations include template/company/position assignment, moving dates, follow-up intervals, scheduling, deletion, and CSV export. Use an explicit Apply action.

## 17. Suggested Supabase schema

Create normalized tables with `id`, `user_id` where applicable, timestamps, foreign keys, constraints, indexes, and RLS:

| Table | Main fields |
|---|---|
| `profiles` | user_id, full_name, timezone, default_followup_days, notification_preferences |
| `email_accounts` | user_id, provider, email_address, encrypted_token_reference, connection_status, last_sync_at, gmail_history_id |
| `contacts` | user_id, name, email, company, position, notes |
| `date_groups` | user_id, group_date, label |
| `outreach_records` | user_id, contact_id, date_group_id, template_id, company_override, position_override, current_status, followup_days |
| `email_templates` | user_id, name, subject, body, signature, is_default |
| `email_messages` | user_id, outreach_record_id, email_account_id, direction, sender_email, recipient_email, subject, body, gmail_message_id, gmail_thread_id, internet_message_id, sent_at, received_at |
| `scheduled_emails` | user_id, outreach_record_id, email_account_id, approved_subject, approved_body, approved_attachments, scheduled_at, status, attempt_count, last_error, idempotency_key, locked_until, sent_message_id |
| `followup_reminders` | user_id, outreach_record_id, due_at, status, reminded_at, completed_at |
| `notifications` | user_id, type, title, message, related_record_id, is_read |
| `attachments` | user_id, storage_path, filename, mime_type, size_bytes |
| `activity_logs` | user_id, outreach_record_id, event_type, metadata |

Refine schema as necessary. Separate contact identity from outreach attempts and individual messages. Use row-level security for all user-owned data, and restrict privileged worker operations to the server.

## 18. Pages

```text
/login
/dashboard
/contacts
/scheduled
/sent
/replies
/followups
/templates
/settings
```

Settings includes profile, default sender signature, timezone, Gmail connection/reconnection, default template/position/attachment, default scheduling interval, follow-up preferences, notifications, data export, and account deletion.

## 19. UI/UX expectations

A polished, minimal SaaS aesthetic: clean typography, compact spreadsheet rows, restrained colors, light borders, rounded corners, responsive layout, dark/light themes, accessible controls, subtle transitions, and meaningful loading/empty/error states. Avoid oversized cards and decorative clutter. Keep table position and selections stable when possible. Use optimistic updates only when safe.

## 20. Security and compliance

- Supabase Auth and RLS; server-side authorization for every action.
- OAuth state protection and appropriate PKCE handling.
- Encrypted token storage; no secrets in client bundles.
- Secure attachment storage and signed access.
- Input validation, HTML sanitization, CSRF protections where relevant, rate limiting, audit logs.
- Explicit recipient review before sending and robust duplicate prevention.
- Respect Gmail policies, sending quotas, recipient opt-outs, and applicable privacy/electronic communication rules.
- Do not implement spam-filter evasion, scraping private contacts, or unauthorized bulk messaging.

## 21. Background jobs

Implement three independently scheduled, authenticated, idempotent jobs:

1. **Scheduled Sender:** claim and send approved due messages.
2. **Gmail Synchronizer:** fetch new messages, detect replies, update records, notify.
3. **Reminder Checker:** identify unanswered messages whose follow-up dates are due and notify.

All must run when the site is closed, log failures, and never mix users' data. Document cron cadence and expected latency.

## 22. Tests

**Unit tests:** address parsing, deduplication, placeholder rendering, timezones, follow-up calculations, state transitions.

**Integration tests:** database persistence, queue claiming, Gmail adapter, message reconciliation, reply matching, notifications, reminder cancellation.

**End-to-end tests:** login → paste addresses → import → edit rows → multi-select → right-click → choose template → preview → schedule → verify persisted jobs → simulate sending → simulate reply → verify notification and reminder cancellation → refresh and verify persistence.

Use Gmail mocks for automated tests and provide a real-account manual integration checklist.

## 23. Build phases

1. **Foundation:** Next.js, Supabase, auth, schema, migrations, app shell.
2. **Spreadsheet:** date tabs, import, editable rows, selection, right-click actions, search, autosave.
3. **Templates:** editor, placeholders, previews, signatures, attachments.
4. **Gmail and scheduling:** OAuth, secure tokens, durable queue, sender worker, send status.
5. **Replies and notifications:** incremental sync, thread matching, inbox, alerts.
6. **Follow-ups:** reminder calculation, cron, follow-up dashboard, snooze/completion.
7. **Hardening:** tests, security, observability, real Gmail verification, deployment documentation.

## 24. Required deliverables

A complete working repository with frontend, backend routes, Supabase SQL migrations and RLS policies, Gmail integration, scheduling and sync workers, reminder engine, templates, notifications, automated tests, `.env.example`, README setup instructions, and Vercel/Supabase deployment guide.

Document required Supabase credentials, Google Cloud/Gmail API and OAuth configuration, redirect URLs, scopes, token encryption, cron deployment, and Vercel environment variables. Never invent credentials. If unavailable, implement configurable integration points and state clearly what remains unverified.

## 25. Acceptance test

The product is complete when I can:

1. Log in and paste 30 addresses.
2. See 30 editable rows with company, position, name, template, and status fields.
3. Select 10 rows via checkboxes or Shift-click.
4. Right-click and choose **Schedule Email**.
5. Choose tomorrow at **10:30 AM Asia/Kolkata** and review all personalized previews.
6. Confirm; see 10 durable jobs stored in Supabase.
7. Close the browser and have the backend send the approved emails when due.
8. See successful messages in **Sent**, including Gmail thread references.
9. Receive a notification when a recipient replies and see the thread in **Replies**.
10. Get a follow-up reminder after the configured interval if no reply arrives.
11. Browse records in date-wise tabs without losing history.
12. Refresh and find all data intact.

No fake buttons, placeholder actions, or mock-only integrations may be presented as complete.

## 26. Instructions for Google Antigravity

**Act as the implementing engineer, not merely a planner.**

1. Inspect the repository first.
2. Propose a concise implementation plan, schema, state transitions, and API contracts.
3. Identify required environment variables and external setup steps.
4. Implement each phase with working code and tests.
5. Run build, lint, and test commands and fix errors.
6. Use reasonable defaults without repeatedly asking for minor decisions.
7. Ask for credentials or external configuration only when actually required.
8. Clearly distinguish fully tested functionality from integrations that still require external credentials or verification.

**Priority:** A fast, reliable spreadsheet-style personal job mailing platform—not a large-scale sales automation system.
#   M a i l D e s k  
 