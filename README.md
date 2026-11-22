# MailDesk

MailDesk is a private job-outreach dashboard built with Next.js 15, TypeScript, Gmail API, and Supabase. It supports rich-text email templates, per-recipient job links, immediate and scheduled sending, date-grouped contacts, and multi-step follow-up tracking.

## Production architecture

- AWS Amplify Hosting: Next.js application and API routes
- AWS Lambda + EventBridge: durable scheduled-email and follow-up workers
- Supabase Cloud: contacts, Gmail connection, queue, messages, and reminders
- Google OAuth 2.0 + Gmail API: authorized mail delivery

The Replies/Inbox screen is intentionally locked while Gmail thread synchronization is under development. It is not invoked by the AWS scheduler.

## Local development

Requirements: Node.js 20 or 22 and Corepack.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

When `NEXT_PUBLIC_APP_URL` and `GOOGLE_REDIRECT_URI` are omitted locally, OAuth falls back to `http://localhost:3000`.

## Database

Apply every file in [`supabase/migrations`](supabase/migrations) in filename order using the Supabase SQL Editor. Scheduled delivery requires Supabase; browser local storage alone is not a durable cloud queue.

## AWS deployment

The repository contains:

- [`amplify.yml`](amplify.yml): reproducible Amplify build
- [`infra/aws/template.yaml`](infra/aws/template.yaml): Lambda and EventBridge schedules
- [`infra/aws/scheduler/index.mjs`](infra/aws/scheduler/index.mjs): authenticated worker invoker
- [`docs/AWS_DEPLOYMENT.md`](docs/AWS_DEPLOYMENT.md): complete deployment and verification procedure

## Required environment variables

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth Web client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Web client secret |
| `NEXT_PUBLIC_APP_URL` | Final Amplify HTTPS domain |
| `GOOGLE_REDIRECT_URI` | Final domain plus `/api/auth/google/callback` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase key |
| `CRON_SECRET` | Shared Amplify/Lambda worker secret |
| `TOKEN_ENCRYPTION_KEY` | Stable 64-character hex token-encryption key |
| `DEFAULT_TIMEZONE` | Scheduling timezone, normally `Asia/Kolkata` |

Never commit `.env` or downloaded Google credential JSON files.

## Checks

```bash
pnpm test
pnpm build
```
