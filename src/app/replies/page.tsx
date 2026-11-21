'use client';

import React, { useState, useEffect } from 'react';
import { useMailDesk } from '@/context/MailDeskContext';
import { formatDateTime } from '@/lib/utils';
import { Inbox, Mail, Send, Reply, RefreshCw, CheckCircle, ExternalLink, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface ThreadItem {
  threadId: string;
  contact: {
    name?: string;
    email: string;
    company?: string;
    position?: string;
  };
  lastMessageAt: string;
  latestSnippet: string;
  hasReply: boolean;
  messages: Array<{
    id: string;
    direction: 'outgoing' | 'incoming';
    sender_email: string;
    recipient_email: string;
    subject: string;
    body_text: string | null;
    sent_at: string | null;
    received_at: string | null;
    created_at: string;
  }>;
}

export default function RepliesPage() {
  const { emailAccount } = useMailDesk();
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Fetch threads from Supabase Cloud
  const fetchThreads = async () => {
    try {
      const res = await fetch('/api/replies');
      const data = await res.json();
      if (data.threads) {
        setThreads(data.threads);
        if (data.threads.length > 0 && !selectedThreadId) {
          setSelectedThreadId(data.threads[0].threadId);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch replies:', e);
    }
  };

  // Sync from Gmail API
  const handleSyncFromGmail = async () => {
    setIsSyncing(true);
    toast.info('Scanning Gmail for new replies and responses...');
    try {
      const res = await fetch('/api/cron/sync-gmail', { method: 'POST' });
      const data = await res.json();
      if (data.summary) {
        toast.success(
          `Sync complete: scanned ${data.summary.threadsScanned} threads, detected ${data.summary.repliesDetected} replies!`
        );
      }
      await fetchThreads();
    } catch (e: any) {
      toast.error(`Sync error: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchThreads();
    // Auto-sync once on mount if connected
    if (emailAccount.connection_status === 'connected') {
      handleSyncFromGmail();
    }
  }, []);

  const selectedThread = threads.find(t => t.threadId === selectedThreadId) || threads[0];

  const handleSendFollowupReply = async () => {
    if (!replyText.trim() || !selectedThread) return;
    setIsSendingReply(true);

    try {
      const lastMsg = selectedThread.messages[selectedThread.messages.length - 1];
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedThread.contact.email,
          subject: lastMsg?.subject?.startsWith('Re:') ? lastMsg.subject : `Re: ${lastMsg?.subject || 'Outreach'}`,
          textBody: replyText,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to send reply');
      }

      toast.success(`Reply sent via Gmail to ${selectedThread.contact.email}!`);
      setReplyText('');
      await fetchThreads();
    } catch (err: any) {
      toast.error(`Failed to send reply: ${err.message}`);
    } finally {
      setIsSendingReply(false);
    }
  };

  return (
    <div className="flex h-full select-text bg-background">
      {/* Left Panel: Conversation List */}
      <div className="w-80 md:w-96 border-r border-border flex flex-col bg-card shrink-0">
        <div className="p-3.5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-foreground text-sm">
            <Inbox className="h-4 w-4 text-primary" />
            <span>Replies / Inbox ({threads.length})</span>
          </div>

          <button
            onClick={handleSyncFromGmail}
            disabled={isSyncing}
            className="flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted/80 disabled:opacity-50 transition-colors"
            title="Scan Gmail for new replies"
          >
            <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin text-primary' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {threads.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
              <Inbox className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <div>No replies found in your inbox.</div>
              <button
                onClick={handleSyncFromGmail}
                className="text-xs text-primary font-semibold hover:underline"
              >
                Sync with Gmail Now
              </button>
            </div>
          ) : (
            threads.map(t => {
              const isSelected = selectedThread?.threadId === t.threadId;

              return (
                <div
                  key={t.threadId}
                  onClick={() => setSelectedThreadId(t.threadId)}
                  className={`p-3.5 cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary/10 border-l-4 border-primary' : 'hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="font-semibold text-xs text-foreground truncate">
                      {t.contact.name || t.contact.email}
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatDateTime(t.lastMessageAt)}
                    </span>
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground truncate mb-1">
                    {t.contact.company || 'Direct'} — {t.contact.position || 'Application'}
                  </div>
                  <div className="text-[11px] text-muted-foreground line-clamp-2">
                    {t.latestSnippet || 'New reply from contact'}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Panel: Conversation Thread & Message Viewer */}
      <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
        {selectedThread ? (
          <div className="flex-1 flex flex-col h-full">
            {/* Thread Header */}
            <div className="p-4 border-b border-border bg-card flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  {selectedThread.contact.name || selectedThread.contact.email}
                </h2>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  <span className="font-mono">{selectedThread.contact.email}</span>
                  <span>•</span>
                  <span>{selectedThread.contact.company || 'Direct'}</span>
                  <span>•</span>
                  <span>{selectedThread.contact.position || 'Outreach'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2.5 py-1 text-xs font-semibold flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Replied
                </span>
              </div>
            </div>

            {/* Messages Timeline */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {selectedThread.messages.map((msg, index) => {
                const isIncoming = msg.direction === 'incoming';

                return (
                  <div
                    key={msg.id || index}
                    className={`flex flex-col ${isIncoming ? 'items-start' : 'items-end'}`}
                  >
                    <div className="text-[10px] text-muted-foreground mb-1 px-1">
                      {isIncoming ? (msg.sender_email || selectedThread.contact.email) : 'You (Gmail)'} •{' '}
                      {formatDateTime(msg.received_at || msg.sent_at || msg.created_at)}
                    </div>
                    <div
                      className={`max-w-xl rounded-xl p-4 text-xs leading-relaxed border shadow-sm ${
                        isIncoming
                          ? 'bg-card border-border text-foreground'
                          : 'bg-primary text-primary-foreground border-primary'
                      }`}
                    >
                      <div className="font-semibold mb-2 border-b border-current/20 pb-1">
                        {msg.subject}
                      </div>
                      <div className="whitespace-pre-wrap">{msg.body_text}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Reply Composer */}
            <div className="p-4 border-t border-border bg-card shrink-0 space-y-2">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Reply className="h-3.5 w-3.5 text-primary" />
                Reply to {selectedThread.contact.name || selectedThread.contact.email}:
              </label>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                rows={3}
                placeholder="Write your response... (e.g. Thanks! Are you free for a call this Thursday?)"
                className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleSendFollowupReply}
                  disabled={!replyText.trim() || isSendingReply}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Send className="h-3 w-3" />
                  <span>{isSendingReply ? 'Sending...' : 'Send Reply via Gmail'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground space-y-2">
            <Inbox className="h-10 w-10 text-muted-foreground/30" />
            <div>No conversations selected. Click "Sync" above to pull your Gmail replies.</div>
          </div>
        )}
      </div>
    </div>
  );
}
