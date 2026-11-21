'use client';

import React, { useMemo } from 'react';
import { useMailDesk } from '@/context/MailDeskContext';
import { formatDateTime } from '@/lib/utils';
import { Send, ExternalLink, Clock, CheckCircle } from 'lucide-react';

export default function SentPage() {
  const { messages, scheduledEmails, emailAccount, profile } = useMailDesk();

  // Merge sent messages from messages array AND completed scheduled emails
  const sentItems = useMemo(() => {
    const fromMessages = messages
      .filter(m => m.direction === 'outgoing')
      .map(msg => ({
        id: msg.id,
        source: 'direct' as const,
        sentAt: msg.sent_at || msg.created_at,
        recipientEmail: msg.recipient_email,
        subject: msg.subject,
        gmailThreadId: msg.gmail_thread_id,
        gmailMessageId: msg.gmail_message_id,
      }));

    // Completed scheduled jobs that may not be in messages yet
    const fromScheduler = scheduledEmails
      .filter(j => j.status === 'sent')
      .map(job => ({
        id: `sched_${job.id}`,
        source: 'scheduler' as const,
        sentAt: job.scheduled_at,
        recipientEmail: job.outreach_record?.contact.email || '—',
        subject: job.approved_subject,
        gmailThreadId: null as string | null,
        gmailMessageId: job.sent_message_id,
      }));

    // Deduplicate: if a scheduler job's recipient+subject matches a message, skip the scheduler entry
    const messageKeys = new Set(
      fromMessages.map(m => `${m.recipientEmail}::${m.subject}`)
    );
    const uniqueScheduler = fromScheduler.filter(
      s => !messageKeys.has(`${s.recipientEmail}::${s.subject}`)
    );

    // Merge and sort by sent time (newest first)
    const all = [...fromMessages, ...uniqueScheduler];
    all.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
    return all;
  }, [messages, scheduledEmails]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Sent Outreach Messages
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Confirmed messages delivered through the Gmail API, including scheduled batch deliveries.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          Total sent: <span className="font-semibold text-foreground">{sentItems.length}</span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs divide-y divide-border">
          <thead className="bg-muted/60 text-muted-foreground font-semibold">
            <tr>
              <th className="px-4 py-3">Sent Timestamp</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Gmail Thread ID</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sentItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted-foreground text-sm">
                  No sent messages yet. Messages sent via "Send Now" or the background scheduler will appear here.
                </td>
              </tr>
            ) : (
              sentItems.map(item => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                    {formatDateTime(item.sentAt, profile.timezone)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-foreground">
                    {item.recipientEmail}
                  </td>
                  <td className="px-4 py-3 text-foreground font-medium truncate max-w-xs">
                    {item.subject}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                    {item.gmailThreadId || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold">
                        Delivered
                      </span>
                      {item.source === 'scheduler' && (
                        <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 text-[10px] font-medium flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          Via Scheduler
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
