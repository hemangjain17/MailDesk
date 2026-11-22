'use client';

import { Construction, Inbox, LockKeyhole, ShieldCheck } from 'lucide-react';

export default function RepliesPage() {
  return (
    <div className="flex min-h-full items-center justify-center bg-background p-6">
      <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-gradient-to-r from-slate-950 to-slate-800 p-8 text-white">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <Inbox className="h-6 w-6" />
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-200 ring-1 ring-amber-300/30">
              <Construction className="h-3.5 w-3.5" />
              Feature under development
            </span>
          </div>
          <h1 className="text-2xl font-bold">Replies / Inbox is temporarily locked</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
            Inbox synchronization and direct replies are paused for this AWS release while thread matching and Gmail history synchronization are being hardened.
          </p>
        </div>

        <div className="grid gap-4 p-8 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <LockKeyhole className="mb-3 h-5 w-5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">No inbox access</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              This page does not fetch, display, or send Gmail replies while it is locked.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <ShieldCheck className="mb-3 h-5 w-5 text-emerald-600" />
            <h2 className="text-sm font-semibold text-foreground">Outreach remains available</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Sending, scheduling, templates, contacts, and follow-up tracking continue to work normally.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
