'use client';

import React from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Mail,
  Clock,
  Users,
  FileText,
  CalendarCheck,
  ArrowRight,
  CheckCircle,
  Shield,
  Layers,
} from 'lucide-react';
import { useMailDesk } from '@/context/MailDeskContext';

export default function LandingPage() {
  const { emailAccount } = useMailDesk();

  const isConnected =
    emailAccount.connection_status === 'connected' &&
    emailAccount.email_address &&
    emailAccount.email_address !== 'hemang.jobhunt@gmail.com';

  const connectedEmail = emailAccount.email_address;

  const features = [
    {
      icon: Users,
      title: 'Spreadsheet Contacts',
      desc: 'Paste, import, and manage outreach contacts in a fast spreadsheet grid with inline editing.',
    },
    {
      icon: Clock,
      title: 'Smart Scheduling',
      desc: 'Schedule emails with sequential intervals. Durable cron workers send via Gmail API at the right time.',
    },
    {
      icon: CalendarCheck,
      title: 'Follow-up Tracking',
      desc: 'Automatic follow-up reminders when contacts don\'t reply within your configured business-day window.',
    },
    {
      icon: FileText,
      title: 'Template Engine',
      desc: 'Create personalized templates with {{variables}} — preview rendered emails before scheduling.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              MailDesk
            </span>
            <span className="rounded-md bg-blue-100 dark:bg-blue-950 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
              v1.0
            </span>
          </div>

          {isConnected ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-medium text-emerald-700 dark:text-emerald-300">
                  {connectedEmail}
                </span>
              </div>
              <Link
                href="/contacts"
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/90 transition-colors"
              >
                Go to Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <a
              href="/api/auth/google"
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/90 transition-colors"
            >
              <Mail className="h-4 w-4" />
              Sign in with Google
            </a>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="text-center max-w-2xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-4 py-1.5 text-xs font-medium text-muted-foreground mb-2">
            <Shield className="h-3.5 w-3.5 text-primary" />
            Personal & Private — Single user deployment with your Gmail account
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
            Your Personal{' '}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Job Outreach
            </span>{' '}
            Command Center
          </h1>

          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto">
            Spreadsheet-style email scheduling dashboard with official Gmail API integration, 
            durable background workers, and dynamic follow-up reminders.
          </p>

          <div className="flex items-center justify-center gap-4 pt-4">
            {isConnected ? (
              <Link
                href="/contacts"
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:shadow-xl"
              >
                <Layers className="h-5 w-5" />
                Open Outreach Spreadsheet
                <ArrowRight className="h-5 w-5" />
              </Link>
            ) : (
              <a
                href="/api/auth/google"
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:shadow-xl"
              >
                <Mail className="h-5 w-5" />
                Connect Gmail & Get Started
              </a>
            )}
          </div>

          {isConnected ? (
            <div className="flex items-center justify-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium pt-2">
              <CheckCircle className="h-4 w-4" />
              Gmail connected as <span className="font-semibold underline">{connectedEmail}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Sign in with your Google account to grant permission to send and track outreach emails.
            </p>
          )}
        </div>
      </section>

      {/* Features Grid */}
      <section className="border-t border-border bg-card/40 py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-8">
            Complete Personal Outreach Workflow
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card p-5 space-y-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-foreground text-sm">{f.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6 px-6 text-center text-xs text-muted-foreground">
        MailDesk v1.0 — Personal Job Outreach Dashboard. AWS cloud deployment ready.
      </footer>
    </div>
  );
}
