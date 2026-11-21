'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, CheckCircle2, AlertCircle, RefreshCw, CheckCheck, ExternalLink } from 'lucide-react';
import { useMailDesk } from '@/context/MailDeskContext';
import { formatDateTime } from '@/lib/utils';

export function TopBar() {
  const pathname = usePathname();
  const { emailAccount, notifications, markNotificationRead, markAllNotificationsRead, toggleGmailConnection } =
    useMailDesk();

  const [showNotifications, setShowNotifications] = useState(false);

  const getPageTitle = (path: string) => {
    switch (path) {
      case '/dashboard':
        return 'Dashboard Overview';
      case '/contacts':
        return 'Job Outreach Spreadsheet';
      case '/scheduled':
        return 'Scheduled Delivery Queue';
      case '/sent':
        return 'Sent Messages';
      case '/replies':
        return 'Replies & Conversation Threads';
      case '/followups':
        return 'Follow-up Reminders';
      case '/templates':
        return 'Email Templates & Signatures';
      case '/settings':
        return 'Account & Integration Settings';
      default:
        return 'MailDesk';
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-foreground tracking-tight">{getPageTitle(pathname)}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Gmail Status Indicator */}
        <div className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              emailAccount.connection_status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
            }`}
          />
          <span className="font-medium text-foreground">{emailAccount.email_address}</span>
          <span className="text-muted-foreground hidden sm:inline">
            ({emailAccount.connection_status === 'connected' ? 'Gmail Active' : 'Disconnected'})
          </span>
          {emailAccount.connection_status === 'connected' ? (
            <button
              onClick={toggleGmailConnection}
              className="ml-1 text-muted-foreground hover:text-foreground font-medium text-[11px]"
              title="Disconnect Gmail"
            >
              Disconnect
            </button>
          ) : (
            <a
              href="/api/auth/google"
              className="ml-1 text-primary hover:underline font-bold text-[11px]"
              title="Connect via Google OAuth"
            >
              Connect
            </a>
          )}
        </div>

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Popover */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-lg border border-border bg-card p-3 shadow-xl z-50 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-border pb-2 mb-2">
                <span className="text-sm font-semibold text-foreground">Notifications ({unreadCount} new)</span>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllNotificationsRead}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <CheckCheck className="h-3 w-3" /> Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto space-y-2">
                {notifications.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">No notifications yet.</div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => markNotificationRead(n.id)}
                      className={`cursor-pointer rounded-md p-2.5 text-xs transition-colors border ${
                        n.is_read
                          ? 'border-transparent bg-muted/20 text-muted-foreground'
                          : 'border-blue-200 bg-blue-50/60 dark:bg-blue-950/40 text-foreground font-medium'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="font-semibold text-xs">{n.title}</span>
                        <span className="text-[10px] text-muted-foreground">{formatDateTime(n.created_at)}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed line-clamp-2">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
