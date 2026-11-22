# MailDesk — AI-Powered Cold Email & Outreach Platform

![Next.js 15](https://img.shields.io/badge/Next.js-15.1-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=for-the-badge&logo=vercel)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

MailDesk is a modern, high-performance web platform for managing personalized job applications, founder networking, and cold email outreach. Built as a single-user private dashboard, MailDesk connects directly to your personal Gmail account via official Google OAuth 2.0, providing automated batch scheduling, dynamic date grouping, spreadsheet-style inline editing, and smart follow-up tracking.

---

## ✨ Features

- **Dynamic Outreach Spreadsheet**:
  - **Fit to Screen Mode**: Proportional, non-scrolling layout fitted to your display.
  - **Expand Mode**: Wide scrollable view with spacious columns.
  - **Inline Editing**: Double-click any cell (Name, Email, Company, Position, Subject, Notes) to edit instantly.
  - **Multi-Row Bulk Operations**: Select multiple rows with Shift-Click, batch schedule, send immediately, or delete.
  - **Right-Click Context Menu**: Instant actions for duplicate, preview, schedule, and deletion.
- **Official Google OAuth 2.0 & Gmail API**:
  - Secure offline token exchange with automatic token refreshing.
  - Client-side & serverless direct sending using official `googleapis`.
  - Account state persistence: switching or reconnecting an email automatically preserves existing contacts and schedules.
- **Automated Scheduling & Cron Worker**:
  - Set specific send times and interval spacing (e.g. 5–15 seconds between emails) to protect your domain reputation.
  - Powered by Vercel Cron endpoints with durable execution locking to prevent duplicate sends.
- **Dynamic Variable Interpolation**:
  - Write templates with placeholders (`{{name}}`, `{{company}}`, `{{position}}`, `{{sender_name}}`, `{{portfolio}}`, etc.).
  - Live preview modal shows real interpolated email body before sending.
- **Follow-up Reminders & Notifications**:
  - Configurable follow-up intervals (default: 5 days).
  - Prompts you when sending to schedule a follow-up reminder.
  - Dynamic in-app notifications banner alerting you of due follow-ups.

---

## 🚀 Quick Deploy to Vercel

You can deploy your own private MailDesk instance to Vercel in just a few minutes.

### 1. Click Deploy
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

### 2. Configure Environment Variables
In your Vercel project settings (**Settings > Environment Variables**), set the following keys:

| Variable | Required | Description | Example |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | **Yes** | Your deployed Vercel domain URL | `https://your-app.vercel.app` |
| `GOOGLE_CLIENT_ID` | **Yes** | Google OAuth 2.0 Web Client ID | `xxxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | **Yes** | Google OAuth 2.0 Web Client Secret | `GOCSPX-xxxx` |
| `CRON_SECRET` | Optional | Shared secret to protect Vercel cron routes | `random_32_char_secret` |
| `TOKEN_ENCRYPTION_KEY`| Optional | 32-byte hex key for encrypting tokens in DB | `64-hex-characters` |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Supabase project URL (if using cloud DB) | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Supabase anon public API key | `eyJhbGci...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Supabase service role secret key | `eyJhbGci...` |

> **Note on App URL**: MailDesk automatically detects `VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_URL` on Vercel deployments, so if you leave `NEXT_PUBLIC_APP_URL` empty, it will gracefully fallback to your live Vercel URL!

---

## 🔐 Google OAuth 2.0 Setup Guide

To connect your Gmail account:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `MailDesk-Personal`).
3. Navigate to **APIs & Services > Library**, search for **Gmail API**, and click **Enable**.
4. Go to **APIs & Services > OAuth consent screen**:
   - User Type: **External** (or Internal if using Google Workspace).
   - App Name: `MailDesk`.
   - User Support Email: your email.
   - Developer Contact Email: your email.
   - Add Test Users: Add your personal Gmail address (`you@gmail.com`).
5. Go to **APIs & Services > Credentials**:
   - Click **+ Create Credentials > OAuth client ID**.
   - Application type: **Web application**.
   - Name: `MailDesk Web Client`.
   - **Authorized JavaScript origins**:
     - `http://localhost:3000`
     - `https://your-app.vercel.app` (your Vercel domain)
   - **Authorized redirect URIs**:
     - `http://localhost:3000/api/auth/google/callback`
     - `https://your-app.vercel.app/api/auth/google/callback`
6. Copy the generated **Client ID** and **Client Secret** into your `.env` or Vercel Environment Variables.

---

## 🗄️ Supabase Database Setup (Optional)

MailDesk is designed to work immediately out-of-the-box with local browser state persistence (`localStorage`), and optionally syncs with Supabase for cloud backup.

If you wish to use Supabase:
1. Create a free project at [Supabase](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard.
3. Paste and run the migration script located at:
   ```
   supabase/migrations/20240101000000_initial_schema.sql
   ```
4. Copy your **Project URL**, **Anon Key**, and **Service Role Key** from **Project Settings > API** into your environment variables.

---

## 💻 Local Development

### Prerequisites
- Node.js 18.17+ or 20+
- `pnpm` (recommended) or `npm`

### Installation
```bash
# Clone repository
git clone https://github.com/your-username/maildesk.git
cd maildesk

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env.local
```

Fill in your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`.

### Start Dev Server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Run Production Build
```bash
pnpm build
```

---

## ⏰ Cron Jobs & Delivery Engine

MailDesk includes three automated background routines defined in `vercel.json`:

| Route | Schedule | Purpose |
| :--- | :--- | :--- |
| `/api/cron/send-scheduled` | Every 5 minutes (`*/5 * * * *`) | Claims pending scheduled emails and dispatches them via Gmail API |
| `/api/cron/check-followups` | Every 6 hours (`0 */6 * * *`) | Scans sent emails exceeding follow-up days and creates alerts |
| `/api/cron/sync-gmail` | Every 10 minutes (`*/10 * * * *`) | Checks inbox for replies to update outreach record statuses |

---

## 🛡️ Security & Privacy

- **Single-Tenant Private Tool**: MailDesk is engineered for your own private usage. Only you access your deployment.
- **Zero-Secret Leakage**: `.env`, `.env.local`, and sensitive credentials are in `.gitignore`.
- **Token Security**: OAuth access and refresh tokens are encrypted at rest with fallback support.
- **Spam Prevention**: Intelligent batch spacing and throttling prevents tripping Gmail rate limits.

---

## 📄 License

MIT © [Hemang Jain](https://github.com/HemangJain)
