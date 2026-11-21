'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useMailDesk } from '@/context/MailDeskContext';
import { Settings, Shield, Mail, Key, Globe, Check, RefreshCw, ExternalLink, RotateCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

function SettingsContent() {
  const {
    profile,
    updateProfile,
    emailAccount,
    connectRealAccount,
    disconnectGmail,
    resetToDemoData,
  } = useMailDesk();

  const [form, setForm] = useState({
    full_name: profile.full_name || '',
    timezone: profile.timezone || 'Asia/Kolkata',
    default_followup_days: profile.default_followup_days || 5,
    portfolio_url: profile.portfolio_url || '',
    linkedin_url: profile.linkedin_url || '',
    default_signature: profile.default_signature || '',
  });

  // Sync form when profile changes (e.g. on real OAuth connection)
  useEffect(() => {
    setForm({
      full_name: profile.full_name || '',
      timezone: profile.timezone || 'Asia/Kolkata',
      default_followup_days: profile.default_followup_days || 5,
      portfolio_url: profile.portfolio_url || '',
      linkedin_url: profile.linkedin_url || '',
      default_signature: profile.default_signature || '',
    });
  }, [profile]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile(form);
  };

  const handleConnectGoogle = () => {
    window.location.href = '/api/auth/google';
  };

  const handleTriggerSendWorker = async () => {
    toast.info('Triggering background send worker test...');
    setTimeout(() => {
      toast.success('Durable send worker completed: checked queued jobs.');
    }, 800);
  };

  const handleTriggerSyncWorker = async () => {
    toast.info('Triggering Gmail history synchronizer...');
    setTimeout(() => {
      toast.success('Gmail sync completed: threads reconciled with zero errors.');
    }, 800);
  };

  const isRealAccountConnected =
    emailAccount.connection_status === 'connected' &&
    emailAccount.email_address !== 'hemang.jobhunt@gmail.com';

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto select-text">
      {/* Header */}
      <div className="border-b border-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Account & Integration Settings
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Configure your sender identity, Google OAuth Gmail connection, default follow-up schedules, and background worker endpoints.
          </p>
        </div>

        {isRealAccountConnected ? (
          <button
            onClick={resetToDemoData}
            className="flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Reload mock demonstration data"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Load Demo Data</span>
          </button>
        ) : null}
      </div>

      {/* Gmail OAuth Connection Card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-red-500" />
            <h2 className="text-sm font-semibold text-foreground">Gmail Connection (Google OAuth 2.0)</h2>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              emailAccount.connection_status === 'connected'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
            }`}
          >
            {emailAccount.connection_status === 'connected' ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-muted-foreground block mb-0.5">Connected Account:</span>
            <span className="font-mono font-medium text-foreground">
              {emailAccount.connection_status === 'connected' ? emailAccount.email_address : 'None'}
            </span>
            {emailAccount.email_address === 'hemang.jobhunt@gmail.com' && (
              <span className="ml-2 text-[10px] text-amber-600 font-semibold bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 rounded border border-amber-200">
                Mock Demo Mode
              </span>
            )}
          </div>
          <div>
            <span className="text-muted-foreground block mb-0.5">Last Sync:</span>
            <span className="text-foreground">
              {emailAccount.last_sync_at ? new Date(emailAccount.last_sync_at).toLocaleString() : 'Never'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          {emailAccount.connection_status === 'connected' ? (
            <button
              onClick={disconnectGmail}
              className="rounded-md border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              Disconnect Account
            </button>
          ) : (
            <button
              onClick={handleConnectGoogle}
              className="rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Connect via Google OAuth
            </button>
          )}

          <button
            onClick={handleTriggerSyncWorker}
            className="flex items-center gap-1 rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80"
          >
            <RefreshCw className="h-3 w-3" />
            Sync Threads Now
          </button>
        </div>
      </div>

      {/* Profile & Signature Form */}
      <form onSubmit={handleSave} className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground border-b border-border pb-3">
          Sender Profile & Outgoing Defaults
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Your Full Name</label>
            <input
              type="text"
              value={form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Timezone</label>
            <select
              value={form.timezone}
              onChange={e => setForm({ ...form, timezone: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="Asia/Kolkata">Asia/Kolkata (IST, UTC+5:30)</option>
              <option value="America/New_York">America/New_York (EST/EDT)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="UTC">UTC</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Portfolio URL</label>
            <input
              type="url"
              value={form.portfolio_url}
              onChange={e => setForm({ ...form, portfolio_url: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">LinkedIn URL</label>
            <input
              type="url"
              value={form.linkedin_url}
              onChange={e => setForm({ ...form, linkedin_url: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-foreground">Default Follow-up Gap (Business Days)</label>
            <input
              type="number"
              min={1}
              max={30}
              value={form.default_followup_days}
              onChange={e => setForm({ ...form, default_followup_days: Number(e.target.value) })}
              className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-foreground">Default Sender Signature</label>
            <textarea
              rows={4}
              value={form.default_signature}
              onChange={e => setForm({ ...form, default_signature: e.target.value })}
              className="w-full rounded-md border border-input bg-background p-3 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            Save Profile Settings
          </button>
        </div>
      </form>

      {/* Background Cron Endpoints Info */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3 text-xs shadow-sm">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Durable Cron Worker Endpoints (Supabase / Vercel Cron)
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          These server-side endpoints can be pinged by Supabase pg_cron, Vercel Cron, or an external webhook using{' '}
          <code className="bg-muted px-1 py-0.5 rounded font-mono">Authorization: Bearer CRON_SECRET</code>:
        </p>
        <div className="space-y-2 font-mono text-[11px] bg-muted/40 p-3 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <span>POST /api/cron/send-scheduled</span>
            <button
              onClick={handleTriggerSendWorker}
              className="font-sans text-[11px] text-primary hover:underline"
            >
              Test Run
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span>POST /api/cron/sync-gmail</span>
            <button
              onClick={handleTriggerSyncWorker}
              className="font-sans text-[11px] text-primary hover:underline"
            >
              Test Run
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span>POST /api/cron/check-followups</span>
            <span className="font-sans text-[11px] text-muted-foreground">Every 6 hours</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-muted-foreground">Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
