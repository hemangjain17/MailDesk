'use client';

import React from 'react';
import Link from 'next/link';
import {
  Users,
  FileEdit,
  Clock,
  Send,
  Inbox,
  CalendarCheck,
  ArrowRight,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { useMailDesk } from '@/context/MailDeskContext';
import { formatDateTime } from '@/lib/utils';

export default function DashboardPage() {
  const { outreachRecords, scheduledEmails, messages, followups, profile, emailAccount } =
    useMailDesk();

  // Metrics counts
  const totalContacts = outreachRecords.length;
  const draftCount = outreachRecords.filter(r => r.current_status === 'Draft').length;
  const scheduledCount = scheduledEmails.filter(s => s.status === 'pending').length;
  const sentCount = outreachRecords.filter(r => r.current_status === 'Sent').length;
  const replyCount = outreachRecords.filter(r => r.current_status === 'Replied').length;
  const followupCount = outreachRecords.filter(r => r.current_status === 'Follow-up Due').length;

  const responseRate = sentCount > 0 ? ((replyCount / (sentCount + replyCount)) * 100).toFixed(1) : '0.0';

  const metrics = [
    { label: 'Total Outreach', value: totalContacts, icon: Users, color: 'text-blue-500', href: '/contacts' },
    { label: 'Drafts Ready', value: draftCount, icon: FileEdit, color: 'text-slate-500', href: '/contacts' },
    { label: 'Scheduled Queue', value: scheduledCount, icon: Clock, color: 'text-indigo-500', href: '/scheduled' },
    { label: 'Sent via Gmail', value: sentCount, icon: Send, color: 'text-cyan-500', href: '/sent' },
    { label: 'Replies Detected', value: replyCount, icon: Inbox, color: 'text-emerald-500', href: '/replies' },
    { label: 'Follow-ups Due', value: followupCount, icon: CalendarCheck, color: 'text-amber-500', href: '/followups' },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Welcome & Overview Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Welcome back, {profile.full_name || 'Job Hunter'}
            <Sparkles className="h-4 w-4 text-primary" />
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Personal job outreach dashboard connected to{' '}
            <span className="font-semibold text-foreground">{emailAccount.email_address}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/contacts"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            <span>Open Outreach Spreadsheet</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map(m => {
          const Icon = m.icon;
          return (
            <Link
              key={m.label}
              href={m.href}
              className="rounded-xl border border-border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between text-muted-foreground mb-2">
                <span className="text-[11px] font-medium uppercase tracking-wider">{m.label}</span>
                <Icon className={`h-4 w-4 ${m.color}`} />
              </div>
              <div className="text-2xl font-bold text-foreground">{m.value}</div>
            </Link>
          );
        })}
      </div>

      {/* Analytics & Activity Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Outreach Performance Snapshot */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Outreach Performance
          </h2>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <span className="text-muted-foreground">Response Rate:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">{responseRate}%</span>
            </div>
            <div className="flex justify-between items-center border-b border-border pb-2">
              <span className="text-muted-foreground">Timezone:</span>
              <span className="font-medium text-foreground">{profile.timezone}</span>
            </div>
            <div className="flex justify-between items-center border-b border-border pb-2">
              <span className="text-muted-foreground">Default Follow-up Gap:</span>
              <span className="font-medium text-foreground">{profile.default_followup_days} Business Days</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Gmail Status:</span>
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Active & Synced
              </span>
            </div>
          </div>
        </div>

        {/* Recent Activity Stream */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
            <Link href="/contacts" className="text-xs text-primary hover:underline">
              View All Contacts →
            </Link>
          </div>

          <div className="divide-y divide-border text-xs">
            {outreachRecords.slice(0, 5).map(r => (
              <div key={r.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground">
                    {r.contact.name || r.contact.email}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.company_override || r.contact.company || 'Direct'} — {r.position_override || r.contact.position || 'Role'}
                  </div>
                </div>
                <div className="text-right">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
                    {r.current_status}
                  </span>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDateTime(r.updated_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
