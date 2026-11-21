'use client';

import React, { useState, useMemo } from 'react';
import { useMailDesk } from '@/context/MailDeskContext';
import { formatDateTime } from '@/lib/utils';
import { Clock, Trash2, Send, AlertTriangle, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ScheduledPage() {
  const { scheduledEmails, cancelScheduledJob, profile, emailAccount, processDueEmails } = useMailDesk();
  const [isProcessing, setIsProcessing] = useState(false);

  // Split scheduled emails by status
  const pendingJobs = useMemo(
    () => scheduledEmails.filter(j => j.status === 'pending' || j.status === 'locked'),
    [scheduledEmails]
  );

  const failedJobs = useMemo(
    () => scheduledEmails.filter(j => j.status === 'failed'),
    [scheduledEmails]
  );

  const handleProcessDueNow = async () => {
    setIsProcessing(true);
    toast.info('Sending due emails via Gmail API...');
    try {
      const res = await processDueEmails(true);
      if (res.sent > 0) {
        toast.success(`Successfully sent ${res.sent} email(s) via Gmail! Moved to Sent.`);
      } else if (res.failed > 0) {
        toast.error(`${res.failed} email(s) failed delivery. Check the error list below.`);
      } else {
        toast.info('No pending emails are currently due for sending.');
      }
    } catch (e: any) {
      toast.error(`Worker error: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
      case 'locked':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 animate-pulse';
      case 'failed':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Scheduled Delivery Queue
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Durable cron worker claims and sends these messages automatically via Gmail at the scheduled timestamps.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
            Queue timezone: <span className="font-semibold text-foreground">{profile.timezone}</span>
          </div>
          <button
            onClick={handleProcessDueNow}
            disabled={isProcessing}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{isProcessing ? 'Processing...' : 'Send Due Emails Now'}</span>
          </button>
        </div>
      </div>

      {/* Pending Queue Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs divide-y divide-border">
          <thead className="bg-muted/60 text-muted-foreground font-semibold">
            <tr>
              <th className="px-4 py-3">Scheduled Time ({profile.timezone})</th>
              <th className="px-4 py-3">Recipient Email</th>
              <th className="px-4 py-3">Approved Subject</th>
              <th className="px-4 py-3">Sending Account</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pendingJobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">
                  No emails currently pending in the queue. Select rows in the spreadsheet and choose <strong>Schedule Email</strong>.
                </td>
              </tr>
            ) : (
              pendingJobs.map(job => (
                <tr key={job.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                    {formatDateTime(job.scheduled_at, profile.timezone)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-foreground">
                    {job.outreach_record?.contact.email || '—'}
                  </td>
                  <td className="px-4 py-3 text-foreground truncate max-w-xs">
                    {job.approved_subject}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {emailAccount.email_address}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getStatusBadge(job.status)}`}>
                      {job.status === 'locked' ? 'Sending...' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => cancelScheduledJob(job.id)}
                      className="rounded p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      title="Cancel scheduled delivery"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Failed Jobs Section */}
      {failedJobs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            Failed Deliveries ({failedJobs.length})
          </h2>
          <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs divide-y divide-rose-200 dark:divide-rose-900">
              <thead className="bg-rose-100/60 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold">
                <tr>
                  <th className="px-4 py-3">Scheduled Time</th>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Error</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-200 dark:divide-rose-900">
                {failedJobs.map(job => (
                  <tr key={job.id} className="hover:bg-rose-100/30 dark:hover:bg-rose-950/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                      {formatDateTime(job.scheduled_at, profile.timezone)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-foreground">
                      {job.outreach_record?.contact.email || '—'}
                    </td>
                    <td className="px-4 py-3 text-foreground truncate max-w-xs">
                      {job.approved_subject}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-1.5">
                        <XCircle className="h-3.5 w-3.5 text-rose-500 mt-0.5 shrink-0" />
                        <span className="text-rose-700 dark:text-rose-300 text-[11px] leading-relaxed">
                          {job.last_error || 'Unknown error — email may not exist or account disconnected'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => cancelScheduledJob(job.id)}
                        className="rounded p-1 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-950/40 transition-colors"
                        title="Remove failed job"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
