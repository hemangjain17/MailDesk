'use client';

import React, { useMemo, useState } from 'react';
import { useMailDesk } from '@/context/MailDeskContext';
import { formatDateTime } from '@/lib/utils';
import { CalendarCheck, Clock, CheckCircle, Send, Mail, GitBranchPlus } from 'lucide-react';
import { FollowupPreviewModal } from '@/components/followups/FollowupPreviewModal';
import { format, startOfDay, subDays } from 'date-fns';

export default function FollowupsPage() {
  const { followups, outreachRecords, templates, messages, snoozeFollowup, completeFollowup, createNextFollowup, profile } =
    useMailDesk();

  const [activeTab, setActiveTab] = useState<'due' | 'completed'>('due');
  const [selectedReminderIds, setSelectedReminderIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedFollowupDate, setSelectedFollowupDate] = useState('all');

  const followupDateTabs = useMemo(
    () =>
      Array.from({ length: 10 }, (_, index) => {
        const date = subDays(new Date(), index);
        return { value: format(date, 'yyyy-MM-dd'), label: format(date, 'd MMM') };
      }),
    []
  );
  const tenDayStart = startOfDay(subDays(new Date(), 9)).getTime();
  const getOutreachForReminder = (reminder: (typeof followups)[number]) =>
    outreachRecords.find(record => record.id === reminder.outreach_record_id) || reminder.outreach_record;
  const recentFollowups = followups.filter(reminder => {
    const outreach = getOutreachForReminder(reminder);
    const activityDate = outreach?.sent_at || reminder.created_at;
    return new Date(activityDate).getTime() >= tenDayStart;
  });
  const pendingReminders = recentFollowups.filter(f => f.status === 'pending' || f.status === 'snoozed');
  const completedReminders = recentFollowups.filter(f => f.status === 'completed');
  const filterBySelectedDate = (reminder: (typeof followups)[number]) => {
    if (selectedFollowupDate === 'all') return true;
    const outreach = getOutreachForReminder(reminder);
    return format(new Date(outreach?.sent_at || reminder.created_at), 'yyyy-MM-dd') === selectedFollowupDate;
  };
  const visiblePendingReminders = pendingReminders.filter(filterBySelectedDate);
  const visibleCompletedReminders = completedReminders.filter(filterBySelectedDate);
  const allPendingSelected =
    visiblePendingReminders.length > 0 && visiblePendingReminders.every(reminder => selectedReminderIds.includes(reminder.id));

  const toggleReminder = (reminderId: string) => {
    setSelectedReminderIds(previous =>
      previous.includes(reminderId)
        ? previous.filter(id => id !== reminderId)
        : [...previous, reminderId]
    );
  };

  const toggleAllPending = () => {
    setSelectedReminderIds(
      allPendingSelected ? [] : visiblePendingReminders.map(reminder => reminder.id)
    );
  };

  const selectedRecordIds = Array.from(
    new Set(
      pendingReminders
        .filter(reminder => selectedReminderIds.includes(reminder.id))
        .map(reminder => reminder.outreach_record_id)
    )
  );

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
            Sent History ({completedReminders.length})
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto rounded-lg border border-border bg-card p-2 text-xs">
        <button
          onClick={() => { setSelectedFollowupDate('all'); setSelectedReminderIds([]); }}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 font-medium ${
            selectedFollowupDate === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:text-foreground'
          }`}
        >
          Last 10 Days ({recentFollowups.length})
        </button>
        {followupDateTabs.map(dateTab => {
          const count = recentFollowups.filter(reminder => {
            const outreach = getOutreachForReminder(reminder);
            return format(new Date(outreach?.sent_at || reminder.created_at), 'yyyy-MM-dd') === dateTab.value;
          }).length;
          return (
            <button
              key={dateTab.value}
              onClick={() => { setSelectedFollowupDate(dateTab.value); setSelectedReminderIds([]); }}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 font-medium ${
                selectedFollowupDate === dateTab.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              {dateTab.label} ({count})
            </button>
          );
        })}
      </div>

      {activeTab === 'due' && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Mail className="h-4 w-4 text-primary" />
                Send follow-ups
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                MailDesk first replies in the original Gmail thread; if Gmail cannot recover it, the follow-up is sent as a new email.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="space-y-1">
                <span className="block text-[11px] font-medium text-muted-foreground">Follow-up template</span>
                <select
                  value={selectedTemplateId}
                  onChange={event => setSelectedTemplateId(event.target.value)}
                  className="min-w-56 rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Choose a template...</option>
                  {templates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setIsPreviewOpen(true)}
                disabled={!selectedTemplateId || selectedReminderIds.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                Preview Follow-up ({selectedReminderIds.length})
              </button>
            </div>
          </div>

          {visiblePendingReminders.length > 0 && (
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={allPendingSelected}
                onChange={toggleAllPending}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
              Select all due and upcoming reminders
            </label>
          )}
        </section>
      )}

      {/* Reminders List */}
      <div className="space-y-3">
        {activeTab === 'due' && visiblePendingReminders.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-xs text-muted-foreground">
            No follow-ups currently due. Great job keeping up with your outreach!
          </div>
        )}
        {activeTab === 'completed' && visibleCompletedReminders.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-xs text-muted-foreground">
            No sent follow-ups in the selected period yet.
          </div>
        )}

        {(activeTab === 'due' ? visiblePendingReminders : visibleCompletedReminders).map(fol => {
          const outreach =
            outreachRecords.find(record => record.id === fol.outreach_record_id) || fol.outreach_record;
          const contact = outreach?.contact;
          const originalMessage = messages
            .filter(message => message.outreach_record_id === fol.outreach_record_id && message.direction === 'outgoing')
            .sort((a, b) => new Date(a.sent_at || a.created_at).getTime() - new Date(b.sent_at || b.created_at).getTime())[0];
          const originalTemplateName =
            originalMessage?.template_name ||
            templates.find(template => template.id === originalMessage?.client_template_id)?.name ||
            outreach?.template?.name ||
            templates.find(template => template.id === outreach?.template_id)?.name ||
            'Unknown template';

          return (
            <div
              key={fol.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-all shadow-sm"
            >
              <div className="flex items-start gap-3">
                {activeTab === 'due' && (
                  <input
                    type="checkbox"
                    checked={selectedReminderIds.includes(fol.id)}
                    onChange={() => toggleReminder(fol.id)}
                    aria-label={`Select follow-up for ${contact?.name || contact?.email || 'contact'}`}
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-input text-primary focus:ring-primary"
                  />
                )}
                <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground">
                    {contact?.name || contact?.email || 'Candidate Outreach'}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    activeTab === 'completed'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  }`}>
                    {activeTab === 'completed' ? 'Follow-up Sent' : 'Follow-up Due'}
                  </span>
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                    Sequence #{fol.sequence_number || 1}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {contact?.company || 'Company'} — {contact?.position || 'Position'} • Email: {contact?.email}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
                  <Clock className="h-3 w-3 text-amber-500" />
                  Target due date: <span className="font-medium text-foreground">{formatDateTime(fol.due_at)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Original template: <span className="font-medium text-foreground">{originalTemplateName}</span>
                </div>
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
                    onClick={() => {
                      completeFollowup(fol.id);
                      setSelectedReminderIds(previous => previous.filter(id => id !== fol.id));
                    }}
                    className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Mark Done
                  </button>
                </div>
              )}
              {activeTab === 'completed' && (
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="text-[11px] text-muted-foreground">
                    Sent: {fol.completed_at ? formatDateTime(fol.completed_at) : 'Recorded as completed'}
                  </div>
                  <button
                    type="button"
                    onClick={() => void createNextFollowup(fol.id, 3)}
                    className="flex items-center gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
                  >
                    <GitBranchPlus className="h-3.5 w-3.5" />
                    Create Follow-up #{(fol.sequence_number || 1) + 1}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <FollowupPreviewModal
        isOpen={isPreviewOpen}
        recordIds={selectedRecordIds}
        templateId={selectedTemplateId}
        onClose={() => setIsPreviewOpen(false)}
        onSent={() => setSelectedReminderIds([])}
      />
    </div>
  );
}
