# Deploy MailDesk on AWS

MailDesk uses four managed services:

- **AWS Amplify Hosting** runs the Next.js 15 application and API routes.
- **AWS Lambda** securely invokes the background API routes.
- **Amazon EventBridge** triggers Lambda every minute for scheduled mail and every 15 minutes for follow-ups.
- **Supabase Cloud** remains the durable database and queue.

The Replies/Inbox feature is intentionally locked in this release. Gmail inbox synchronization is not scheduled.

## 1. Before deployment

1. Apply every SQL file in `supabase/migrations` to the existing Supabase project, in filename order.
2. Push this repository and branch to GitHub.
3. Generate two different secrets:
   - `CRON_SECRET`: at least 32 random characters.
   - `TOKEN_ENCRYPTION_KEY`: exactly 64 hexadecimal characters.
4. Retain these values securely. The token encryption key must not change after connecting Gmail.

## 2. Create the Amplify application

1. Open **AWS Console > AWS Amplify > Create new app**.
2. Choose **GitHub**, authorize AWS, and select this repository and branch.
3. Amplify reads `amplify.yml`. Confirm the detected framework is Next.js SSR.
4. Add the variables listed in `.env.example`, initially omitting `NEXT_PUBLIC_APP_URL` and `GOOGLE_REDIRECT_URI`.
5. Deploy the branch and copy the generated `https://...amplifyapp.com` domain.
6. In **Amplify > App settings > Environment variables**, add:
   - `NEXT_PUBLIC_APP_URL=https://<generated-domain>`
   - `GOOGLE_REDIRECT_URI=https://<generated-domain>/api/auth/google/callback`
7. Redeploy the branch so the public URL is embedded in the browser build.

## 3. Configure Google OAuth

In **Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client IDs**, edit the Web client:

- Authorized JavaScript origin: `https://<generated-domain>`
- Authorized redirect URI: `https://<generated-domain>/api/auth/google/callback`

Keep the local entries if local development is still required:

- `http://localhost:3000`
- `http://localhost:3000/api/auth/google/callback`

## 4. Create the scheduler

The repeatable infrastructure is defined in `infra/aws/template.yaml`. Deploy it with AWS SAM:

```bash
sam build --template-file infra/aws/template.yaml
sam deploy --guided \
  --stack-name maildesk-background-jobs \
  --parameter-overrides AppUrl=https://<generated-domain> CronSecret=<same-CRON_SECRET-as-Amplify> \
  --capabilities CAPABILITY_IAM
```

For a console-only setup, create one Node.js 22 Lambda from `infra/aws/scheduler/index.mjs`, set `APP_URL` and `CRON_SECRET`, and add two EventBridge schedules:

- `rate(1 minute)` with input `{"endpoint":"/api/cron/send-scheduled"}`
- `rate(15 minutes)` with input `{"endpoint":"/api/cron/check-followups"}`

## 5. Verify production

1. Open the Amplify URL and connect Gmail in Settings.
2. Schedule a test email 3–5 minutes ahead.
3. Close the browser; the AWS worker must send it without the computer running.
4. In **AWS Lambda > maildesk-scheduler > Monitor > View CloudWatch logs**, confirm HTTP 200 responses.
5. Check **Scheduled**, **Sent**, and **Follow-ups > Sent History** in MailDesk.
