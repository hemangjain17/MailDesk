'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Clock,
  Send,
  Inbox,
  CalendarCheck,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMailDesk } from '@/context/MailDeskContext';
import { startOfDay, subDays } from 'date-fns';

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const { outreachRecords, scheduledEmails, messages, followups } = useMailDesk();

  const tenDayStart = startOfDay(subDays(new Date(), 9)).getTime();
  const followupsDue = followups.filter(reminder => {
    if (reminder.status !== 'pending' && reminder.status !== 'snoozed') return false;
    const outreach = outreachRecords.find(record => record.id === reminder.outreach_record_id) || reminder.outreach_record;
    return new Date(outreach?.sent_at || reminder.created_at).getTime() >= tenDayStart;
  }).length;
  const uniqueContactCount = new Set(
    outreachRecords.map(record => record.contact.email.trim().toLowerCase()).filter(Boolean)
  ).size;
  const pendingScheduled = scheduledEmails.filter(s => s.status === 'pending' || s.status === 'locked').length;
  const sentCount = messages.filter(m => m.direction === 'outgoing').length + scheduledEmails.filter(s => s.status === 'sent').length;

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    {
      label: 'All Contacts',
      href: '/contacts',
      icon: Users,
      badge: uniqueContactCount > 0 ? uniqueContactCount : undefined,
    },
    {
      label: 'Scheduled',
      href: '/scheduled',
      icon: Clock,
      badge: pendingScheduled > 0 ? pendingScheduled : undefined,
    },
    {
      label: 'Sent',
      href: '/sent',
      icon: Send,
      badge: sentCount > 0 ? sentCount : undefined,
      badgeColor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
    },
    {
      label: 'Replies / Inbox',
      href: '/replies',
      icon: Inbox,
      badge: 'Locked',
      badgeColor: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    },
    {
      label: 'Follow-ups',
      href: '/followups',
      icon: CalendarCheck,
      badge: followupsDue > 0 ? followupsDue : undefined,
      badgeColor: 'bg-amber-500 text-white',
    },
    { label: 'Email Templates', href: '/templates', icon: FileText },
    { label: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <aside
      className={cn(
        'relative flex flex-col border-r border-border bg-card transition-all duration-300 ease-in-out select-none',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Brand Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        {!isCollapsed && (
          <div className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="text-base font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              MailDesk
            </span>
            <span className="rounded bg-blue-100 dark:bg-blue-950 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
              v1.0
            </span>
          </div>
        )}
        {isCollapsed && (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav List */}
      <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
        {navItems.map(item => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
              {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
              {!isCollapsed && item.badge !== undefined && (
                <span
                  className={cn(
                    'ml-auto rounded-full px-2 py-0.5 text-xs font-semibold',
                    item.badgeColor || 'bg-muted text-muted-foreground'
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom info */}
      {!isCollapsed && (
        <div className="border-t border-border p-3 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">Spreadsheet Job Outreach</div>
          <div className="truncate">Local Storage & Supabase Sync</div>
        </div>
      )}
    </aside>
  );
}
