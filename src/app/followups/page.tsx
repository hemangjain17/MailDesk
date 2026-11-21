'use client';

import React, { useState } from 'react';
import { useMailDesk } from '@/context/MailDeskContext';
import { formatDateTime } from '@/lib/utils';
import { CalendarCheck, Clock, CheckCircle, Bell, ArrowRight } from 'lucide-react';

export default function FollowupsPage() {
  const { followups, outreachRecords, snoozeFollowup, completeFollowup, profile } =
    useMailDesk();

  const [activeTab, setActiveTab] = useState<'due' | 'completed'>('due');

  const pendingReminders = followups.filter(f => f.status === 'pending' || f.status === 'snoozed');
  const completedReminders = followups.filter(f => f.status === 'completed');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            Follow-up Reminders
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Tracks unanswered outreach messages and alerts you when the configured follow-up interval arrives ({profile.default_followup_days} days).
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex rounded-lg border border-border bg-muted/40 p-1 text-xs">
          <button
            onClick={() => setActiveTab('due')}
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              activeTab === 'due' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Due / Upcoming ({pendingReminders.length})
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              activeTab === 'completed' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Completed ({completedReminders.length})
          </button>
        </div>
      </div>

      {/* Reminders List */}
      <div className="space-y-3">
        {activeTab === 'due' && pendingReminders.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-xs text-muted-foreground">
            No follow-ups currently due. Great job keeping up with your outreach!
          </div>
        )}

        {(activeTab === 'due' ? pendingReminders : completedReminders).map(fol => {
          const outreach = fol.outreach_record;
          const contact = outreach?.contact;

          return (
            <div
              key={fol.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-all shadow-sm"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground">
                    {contact?.name || contact?.email || 'Candidate Outreach'}
                  </span>
                  <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 text-[10px] font-semibold">
                    Follow-up Due
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {contact?.company || 'Company'} — {contact?.position || 'Position'} • Email: {contact?.email}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
                  <Clock className="h-3 w-3 text-amber-500" />
                  Target due date: <span className="font-medium text-foreground">{formatDateTime(fol.due_at)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              {activeTab === 'due' && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => snoozeFollowup(fol.id, 1)}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    Remind Tomorrow
                  </button>
                  <button
                    onClick={() => snoozeFollowup(fol.id, 3)}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    Snooze 3 Days
                  </button>
                  <button
                    onClick={() => completeFollowup(fol.id)}
                    className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Mark Done
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
