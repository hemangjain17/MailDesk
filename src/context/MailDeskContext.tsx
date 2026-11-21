'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  Contact,
  DateGroup,
  EmailAccount,
  EmailMessage,
  EmailTemplate,
  FollowupReminder,
  JobStatus,
  NotificationItem,
  OutreachRecord,
  OutreachStatus,
  ScheduledEmail,
  UserProfile,
} from '@/types';
import {
  initialContacts,
  initialDateGroups,
  initialEmailAccount,
  initialFollowups,
  initialMessages,
  initialNotifications,
  initialOutreachRecords,
  initialProfile,
  initialScheduledEmails,
  initialTemplates,
} from '@/lib/mock-data';
import { parseBulkContacts, ParseResult } from '@/lib/parser';
import { renderTemplate } from '@/lib/template';
import { addDays, format } from 'date-fns';
import { toast } from 'sonner';

interface MailDeskContextType {
  profile: UserProfile;
  emailAccount: EmailAccount;
  dateGroups: DateGroup[];
  selectedDateId: string;
  setSelectedDateId: (id: string) => void;
  contacts: Contact[];
  outreachRecords: OutreachRecord[];
  templates: EmailTemplate[];
  scheduledEmails: ScheduledEmail[];
  messages: EmailMessage[];
  followups: FollowupReminder[];
  notifications: NotificationItem[];
  addDateGroup: (dateStr: string, label?: string) => string;
  importContacts: (raw: string, targetDateGroupId?: string) => ParseResult;
  addSingleRow: (targetDateGroupId?: string) => void;
  updateOutreachRecord: (id: string, updates: Partial<OutreachRecord>) => void;
  updateContact: (id: string, updates: Partial<Contact>) => void;
  batchUpdateRecords: (ids: string[], updates: Partial<OutreachRecord>) => void;
  deleteOutreachRecords: (ids: string[]) => void;
  duplicateOutreachRecord: (id: string) => void;
  scheduleOutreachRecords: (params: {
    recordIds: string[];
    templateId: string;
    scheduledAt: string;
    mode: 'same_time' | 'sequential';
    intervalMinutes: number;
    followupDays?: number | null;
    attachments?: Array<{ filename: string; size_bytes?: number }>;
  }) => Promise<void>;
  sendNowRecords: (recordIds: string[], options?: { followupDays?: number | null }) => Promise<void>;
  processDueEmails: (forceAll?: boolean) => Promise<{ sent: number; failed: number }>;
  cancelScheduledJob: (jobId: string) => void;
  saveTemplate: (template: Partial<EmailTemplate>) => void;
  deleteTemplate: (id: string) => void;
  snoozeFollowup: (reminderId: string, days: number) => void;
  completeFollowup: (reminderId: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  toggleGmailConnection: () => void;
  connectRealAccount: (email: string, name?: string, userId?: string) => void;
  disconnectGmail: () => void;
  resetToDemoData: () => void;
}

const MailDeskContext = createContext<MailDeskContextType | undefined>(undefined);

const STORAGE_KEY = 'maildesk_state_v1';

export function MailDeskProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [emailAccount, setEmailAccount] = useState<EmailAccount>(initialEmailAccount);
  const [dateGroups, setDateGroups] = useState<DateGroup[]>(initialDateGroups);
  const [selectedDateId, setSelectedDateId] = useState<string>('dg_today');
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [outreachRecords, setOutreachRecords] = useState<OutreachRecord[]>(initialOutreachRecords);
  const [templates, setTemplates] = useState<EmailTemplate[]>(initialTemplates);
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>(initialScheduledEmails);
  const [messages, setMessages] = useState<EmailMessage[]>(initialMessages);
  const [followups, setFollowups] = useState<FollowupReminder[]>(initialFollowups);
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on client mount & reconcile statuses
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.profile) setProfile(parsed.profile);
        if (parsed.emailAccount) setEmailAccount(parsed.emailAccount);
        if (parsed.dateGroups) setDateGroups(parsed.dateGroups);
        if (parsed.contacts) setContacts(parsed.contacts);
        if (parsed.templates) setTemplates(parsed.templates);
        if (parsed.messages) setMessages(parsed.messages);
        if (parsed.followups) setFollowups(parsed.followups);
        if (parsed.notifications) setNotifications(parsed.notifications);
        if (parsed.selectedDateId) setSelectedDateId(parsed.selectedDateId);

        // Status Reconciliation: if a record has sent_at, it must NOT be 'Scheduled'
        const rawRecords: OutreachRecord[] = parsed.outreachRecords || [];
        const reconciledRecords = rawRecords.map(r => {
          if (r.sent_at && r.current_status === 'Scheduled') {
            return { ...r, current_status: 'Sent' as OutreachStatus };
          }
          return r;
        });
        setOutreachRecords(reconciledRecords);

        // Status Reconciliation: if a scheduled email's record is already Sent, mark job as 'sent'
        const sentRecordIds = new Set(
          reconciledRecords.filter(r => r.current_status === 'Sent' || r.sent_at).map(r => r.id)
        );
        const rawJobs: ScheduledEmail[] = parsed.scheduledEmails || [];
        const reconciledJobs = rawJobs.map(j => {
          if (sentRecordIds.has(j.outreach_record_id) && j.status === 'pending') {
            return { ...j, status: 'sent' as JobStatus };
          }
          return j;
        });
        setScheduledEmails(reconciledJobs);
      }
    } catch (e) {
      console.warn('Failed to load stored MailDesk state', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save changes to localStorage
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          profile,
          emailAccount,
          dateGroups,
          selectedDateId,
          contacts,
          outreachRecords,
          templates,
          scheduledEmails,
          messages,
          followups,
          notifications,
        })
      );
    } catch (e) {
      console.warn('Failed to save MailDesk state', e);
    }
  }, [
    isLoaded,
    profile,
    emailAccount,
    dateGroups,
    selectedDateId,
    contacts,
    outreachRecords,
    templates,
    scheduledEmails,
    messages,
    followups,
    notifications,
  ]);

  // Client-side follow-up checker — dynamically flags overdue outreach
  useEffect(() => {
    if (!isLoaded) return;

    const checkFollowups = () => {
      const now = Date.now();

      outreachRecords.forEach(rec => {
        if (rec.current_status !== 'Sent' || rec.last_reply_at) return;
        if (!rec.sent_at) return;

        const sentDate = new Date(rec.sent_at).getTime();
        const daysElapsed = (now - sentDate) / (1000 * 3600 * 24);
        const followupDaysVal = rec.followup_days || profile.default_followup_days || 5;

        if (daysElapsed >= followupDaysVal) {
          const existingNotif = notifications.find(
            n => n.type === 'followup_due' && n.related_record_id === rec.id && !n.is_read
          );

          if (!existingNotif) {
            const contactName = rec.contact.name || rec.contact.email;

            setOutreachRecords(prev =>
              prev.map(r =>
                r.id === rec.id
                  ? { ...r, current_status: 'Follow-up Due' as OutreachStatus, updated_at: new Date().toISOString() }
                  : r
              )
            );

            setNotifications(prev => [
              {
                id: `notif_followup_${rec.id}_${Date.now()}`,
                user_id: profile.id,
                type: 'followup_due' as const,
                title: `Follow-up Due: ${contactName}`,
                message: `No reply received after ${Math.floor(daysElapsed)} days from ${contactName}. Consider sending a follow-up.`,
                related_record_id: rec.id,
                is_read: false,
                created_at: new Date().toISOString(),
              },
              ...prev,
            ]);

            toast.warning(`Follow-up due for ${contactName}`, {
              description: `No reply received after ${Math.floor(daysElapsed)} days`,
            });
          }
        }
      });
    };

    checkFollowups();
    const interval = setInterval(checkFollowups, 60000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  const addDateGroup = (dateStr: string, label?: string): string => {
    const existing = dateGroups.find(dg => dg.group_date === dateStr);
    if (existing) {
      setSelectedDateId(existing.id);
      return existing.id;
    }

    const formattedLabel = label || format(new Date(dateStr), 'd MMM yyyy');
    const newGroup: DateGroup = {
      id: `dg_${Date.now()}`,
      user_id: profile.id,
      group_date: dateStr,
      label: formattedLabel,
      created_at: new Date().toISOString(),
      count: 0,
    };

    setDateGroups(prev => [newGroup, ...prev]);
    setSelectedDateId(newGroup.id);
    toast.success(`Date tab added: ${formattedLabel}`);
    return newGroup.id;
  };

  const importContacts = (raw: string, targetDateGroupId?: string): ParseResult => {
    const existingEmails = contacts.map(c => c.email);
    const parsed = parseBulkContacts(raw, existingEmails);

    if (parsed.valid.length === 0) {
      toast.error('No valid new email addresses found.');
      return parsed;
    }

    const dateGroupId = targetDateGroupId || selectedDateId || dateGroups[0]?.id || 'dg_today';
    const defaultTemplate = templates.find(t => t.is_default) || templates[0];

    const newContacts: Contact[] = [];
    const newOutreach: OutreachRecord[] = [];

    for (const item of parsed.valid) {
      const contactId = `cnt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const newContact: Contact = {
        id: contactId,
        user_id: profile.id,
        name: item.name || null,
        email: item.email,
        company: item.company || null,
        position: item.position || null,
        notes: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const outreachId = `out_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const newRecord: OutreachRecord = {
        id: outreachId,
        user_id: profile.id,
        contact_id: contactId,
        date_group_id: dateGroupId,
        template_id: defaultTemplate?.id || null,
        company_override: null,
        position_override: null,
        subject_override: null,
        body_override: null,
        current_status: 'Draft',
        followup_days: profile.default_followup_days || 5,
        scheduled_send_at: null,
        sent_at: null,
        last_reply_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        contact: newContact,
        template: defaultTemplate,
      };

      newContacts.push(newContact);
      newOutreach.push(newRecord);
    }

    setContacts(prev => [...newContacts, ...prev]);
    setOutreachRecords(prev => [...newOutreach, ...prev]);

    // Recalculate tab counts
    setDateGroups(prev =>
      prev.map(dg => {
        if (dg.id === dateGroupId) {
          return { ...dg, count: (dg.count || 0) + newOutreach.length };
        }
        return dg;
      })
    );

    toast.success(`Imported ${parsed.valid.length} contact rows as Draft.`);
    return parsed;
  };

  const addSingleRow = (targetDateGroupId?: string) => {
    const dateGroupId = targetDateGroupId || selectedDateId || dateGroups[0]?.id || 'dg_today';
    const defaultTemplate = templates.find(t => t.is_default) || templates[0];

    const contactId = `cnt_${Date.now()}`;
    const newContact: Contact = {
      id: contactId,
      user_id: profile.id,
      name: '',
      email: '',
      company: '',
      position: '',
      notes: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const newRecord: OutreachRecord = {
      id: `out_${Date.now()}`,
      user_id: profile.id,
      contact_id: contactId,
      date_group_id: dateGroupId,
      template_id: defaultTemplate?.id || null,
      company_override: null,
      position_override: null,
      subject_override: null,
      body_override: null,
      current_status: 'Draft',
      followup_days: profile.default_followup_days || 5,
      scheduled_send_at: null,
      sent_at: null,
      last_reply_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      contact: newContact,
      template: defaultTemplate,
    };

    setContacts(prev => [newContact, ...prev]);
    setOutreachRecords(prev => [newRecord, ...prev]);
    toast.info('Added new editable row.');
  };

  const updateOutreachRecord = (id: string, updates: Partial<OutreachRecord>) => {
    setOutreachRecords(prev =>
      prev.map(r => {
        if (r.id === id) {
          return { ...r, ...updates, updated_at: new Date().toISOString() };
        }
        return r;
      })
    );
  };

  const updateContact = (contactId: string, updates: Partial<Contact>) => {
    setContacts(prev =>
      prev.map(c => {
        if (c.id === contactId) {
          return { ...c, ...updates, updated_at: new Date().toISOString() };
        }
        return c;
      })
    );

    // Also update embedded contact in outreachRecords
    setOutreachRecords(prev =>
      prev.map(r => {
        if (r.contact_id === contactId) {
          return {
            ...r,
            contact: { ...r.contact, ...updates },
            updated_at: new Date().toISOString(),
          };
        }
        return r;
      })
    );
  };

  const batchUpdateRecords = (ids: string[], updates: Partial<OutreachRecord>) => {
    const idSet = new Set(ids);
    setOutreachRecords(prev =>
      prev.map(r => {
        if (idSet.has(r.id)) {
          return { ...r, ...updates, updated_at: new Date().toISOString() };
        }
        return r;
      })
    );
    toast.success(`Updated ${ids.length} rows.`);
  };

  const deleteOutreachRecords = (ids: string[]) => {
    const idSet = new Set(ids);
    setOutreachRecords(prev => prev.filter(r => !idSet.has(r.id)));
    toast.success(`Deleted ${ids.length} row(s).`);
  };

  const duplicateOutreachRecord = (id: string) => {
    const target = outreachRecords.find(r => r.id === id);
    if (!target) return;

    const dupContactId = `cnt_${Date.now()}`;
    const dupContact: Contact = {
      ...target.contact,
      id: dupContactId,
      created_at: new Date().toISOString(),
    };

    const dupRecord: OutreachRecord = {
      ...target,
      id: `out_${Date.now()}`,
      contact_id: dupContactId,
      contact: dupContact,
      current_status: 'Draft',
      scheduled_send_at: null,
      sent_at: null,
      last_reply_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setContacts(prev => [dupContact, ...prev]);
    setOutreachRecords(prev => [dupRecord, ...prev]);
    toast.success('Row duplicated as Draft.');
  };

  const scheduleOutreachRecords = async ({
    recordIds,
    templateId,
    scheduledAt,
    mode,
    intervalMinutes,
    followupDays,
    attachments = [],
  }: {
    recordIds: string[];
    templateId: string;
    scheduledAt: string;
    mode: 'same_time' | 'sequential';
    intervalMinutes: number;
    followupDays?: number | null;
    attachments?: Array<{ filename: string; size_bytes?: number }>;
  }) => {
    const chosenTemplate = templates.find(t => t.id === templateId) || templates[0];
    const baseDate = new Date(scheduledAt);
    const newJobs: ScheduledEmail[] = [];
    const newFollowups: FollowupReminder[] = [];
    const updatedRecordIds = new Set<string>();

    recordIds.forEach((recId, index) => {
      const rec = outreachRecords.find(r => r.id === recId);
      if (!rec) return;

      const sendTime =
        mode === 'sequential'
          ? new Date(baseDate.getTime() + index * intervalMinutes * 60000).toISOString()
          : baseDate.toISOString();

      const renderedSubj = renderTemplate(rec.subject_override || chosenTemplate.subject, {
        recipient_name: rec.contact.name || '',
        company: rec.company_override || rec.contact.company || '',
        position: rec.position_override || rec.contact.position || '',
        sender_name: profile.full_name || '',
        portfolio_url: profile.portfolio_url || '',
        linkedin_url: profile.linkedin_url || '',
      });

      const renderedBody = renderTemplate(rec.body_override || chosenTemplate.body, {
        recipient_name: rec.contact.name || '',
        company: rec.company_override || rec.contact.company || '',
        position: rec.position_override || rec.contact.position || '',
        sender_name: profile.full_name || '',
        portfolio_url: profile.portfolio_url || '',
        linkedin_url: profile.linkedin_url || '',
      });

      const jobId = `job_${Date.now()}_${index}`;
      const newJob: ScheduledEmail = {
        id: jobId,
        user_id: profile.id,
        outreach_record_id: rec.id,
        email_account_id: emailAccount.id,
        approved_subject: renderedSubj.renderedText,
        approved_body: renderedBody.renderedText,
        approved_attachments: attachments,
        scheduled_at: sendTime,
        status: 'pending',
        attempt_count: 0,
        last_error: null,
        idempotency_key: `idemp_${rec.id}_${Date.now()}_${index}`,
        locked_until: null,
        sent_message_id: null,
        created_at: new Date().toISOString(),
        outreach_record: rec,
      };

      newJobs.push(newJob);
      updatedRecordIds.add(rec.id);

      if (followupDays) {
        newFollowups.push({
          id: `fol_${Date.now()}_${rec.id}`,
          user_id: profile.id,
          outreach_record_id: rec.id,
          due_at: addDays(new Date(sendTime), followupDays).toISOString(),
          status: 'pending',
          reminded_at: null,
          completed_at: null,
          created_at: new Date().toISOString(),
          outreach_record: rec,
        });
      }
    });

    setScheduledEmails(prev => [...newJobs, ...prev]);
    if (newFollowups.length > 0) {
      setFollowups(prev => [...newFollowups, ...prev]);
    }

    // Persist durable scheduled jobs to Supabase Cloud
    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobs: newJobs.map(j => ({
            outreachRecordId: j.outreach_record_id,
            to: j.outreach_record?.contact.email || '',
            recipientName: j.outreach_record?.contact.name || '',
            company: j.outreach_record?.company_override || j.outreach_record?.contact.company || '',
            position: j.outreach_record?.position_override || j.outreach_record?.contact.position || '',
            subject: j.approved_subject,
            body: j.approved_body,
            scheduledAt: j.scheduled_at,
          })),
        }),
      });
    } catch (schedErr) {
      console.warn('Failed to persist to /api/schedule:', schedErr);
    }

    setOutreachRecords(prev =>
      prev.map(r => {
        if (updatedRecordIds.has(r.id)) {
          const matchJob = newJobs.find(j => j.outreach_record_id === r.id);
          return {
            ...r,
            current_status: 'Scheduled',
            template_id: templateId,
            template: chosenTemplate,
            followup_days: followupDays !== undefined ? (followupDays || 5) : r.followup_days,
            scheduled_send_at: matchJob?.scheduled_at || scheduledAt,
            updated_at: new Date().toISOString(),
          };
        }
        return r;
      })
    );

    toast.success(
      followupDays
        ? `Scheduled ${newJobs.length} email(s) with ${followupDays}-day follow-up reminder.`
        : `Successfully scheduled ${newJobs.length} email(s).`
    );
  };

  const sendNowRecords = async (recordIds: string[], options?: { followupDays?: number | null }) => {
    const defaultTemplate = templates[0];
    const newMessages: EmailMessage[] = [];
    const newNotifications: NotificationItem[] = [];
    const newFollowups: FollowupReminder[] = [];

    let sentCount = 0;
    let failedCount = 0;

    for (const recId of recordIds) {
      const r = outreachRecords.find(item => item.id === recId);
      if (!r) continue;

      const subj = renderTemplate(r.subject_override || defaultTemplate.subject, {
        recipient_name: r.contact.name || '',
        company: r.company_override || r.contact.company || '',
        position: r.position_override || r.contact.position || '',
        sender_name: profile.full_name || '',
      }).renderedText;

      const body = renderTemplate(r.body_override || defaultTemplate.body, {
        recipient_name: r.contact.name || '',
        company: r.company_override || r.contact.company || '',
        position: r.position_override || r.contact.position || '',
        sender_name: profile.full_name || '',
      }).renderedText;

      // Validate email format before sending
      if (!r.contact.email || !r.contact.email.includes('@') || !r.contact.email.includes('.')) {
        failedCount++;
        const errMsg = 'Email address not found / Invalid recipient';
        setOutreachRecords(prev =>
          prev.map(row => (row.id === r.id ? { ...row, current_status: 'Failed', updated_at: new Date().toISOString() } : row))
        );
        newNotifications.push({
          id: `notif_fail_${Date.now()}_${r.id}`,
          user_id: profile.id,
          type: 'send_failed',
          title: `Delivery Failed: ${r.contact.email || 'Missing email'}`,
          message: `Cannot send: recipient email address not found or invalid.`,
          related_record_id: r.id,
          is_read: false,
          created_at: new Date().toISOString(),
        });
        toast.error(`Invalid email for ${r.contact.name || 'row'}: email not found`);
        continue;
      }

      try {
        const sendRes = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: r.contact.email,
            subject: subj,
            textBody: body,
            outreachRecordId: r.id,
          }),
        });

        const resData = await sendRes.json();
        if (!sendRes.ok) {
          throw new Error(resData.error || 'Failed to send via Gmail API');
        }

        sentCount++;
        const sentIso = new Date().toISOString();
        const msgId = `msg_out_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        newMessages.push({
          id: msgId,
          user_id: profile.id,
          outreach_record_id: r.id,
          email_account_id: emailAccount.id,
          direction: 'outgoing',
          sender_email: emailAccount.email_address,
          recipient_email: r.contact.email,
          subject: subj,
          body_html: `<p>${body.replace(/\n/g, '<br/>')}</p>`,
          body_text: body,
          gmail_message_id: resData.gmailMessageId || `gm_${Date.now()}`,
          gmail_thread_id: resData.gmailThreadId || `th_${Date.now()}`,
          internet_message_id: `<${Date.now()}@mail.gmail.com>`,
          sent_at: sentIso,
          received_at: null,
          created_at: sentIso,
        });

        newNotifications.push({
          id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          user_id: profile.id,
          type: 'email_sent',
          title: `Sent: ${r.contact.name || r.contact.email}`,
          message: `Outreach email delivered via Gmail API to ${r.contact.email}`,
          related_record_id: r.id,
          is_read: false,
          created_at: sentIso,
        });

        // Update outreach record to Sent
        setOutreachRecords(prev =>
          prev.map(row =>
            row.id === r.id
              ? {
                  ...row,
                  current_status: 'Sent',
                  sent_at: sentIso,
                  followup_days: options?.followupDays !== undefined ? (options.followupDays || 5) : row.followup_days,
                  updated_at: sentIso,
                }
              : row
          )
        );

        // Update any matching scheduled email job to 'sent'
        setScheduledEmails(prev =>
          prev.map(j =>
            j.outreach_record_id === r.id
              ? { ...j, status: 'sent', sent_message_id: msgId, last_error: null }
              : j
          )
        );

        // Setup follow-up reminder if requested
        const effectiveFollowupDays = options?.followupDays ?? r.followup_days;
        if (effectiveFollowupDays) {
          newFollowups.push({
            id: `fol_${Date.now()}_${r.id}`,
            user_id: profile.id,
            outreach_record_id: r.id,
            due_at: addDays(new Date(), effectiveFollowupDays).toISOString(),
            status: 'pending',
            reminded_at: null,
            completed_at: null,
            created_at: sentIso,
            outreach_record: r,
          });
        }
      } catch (err: any) {
        failedCount++;
        setOutreachRecords(prev =>
          prev.map(row => (row.id === r.id ? { ...row, current_status: 'Failed', updated_at: new Date().toISOString() } : row))
        );
        setScheduledEmails(prev =>
          prev.map(j =>
            j.outreach_record_id === r.id
              ? { ...j, status: 'failed', last_error: err.message }
              : j
          )
        );
        newNotifications.push({
          id: `notif_err_${Date.now()}_${r.id}`,
          user_id: profile.id,
          type: 'send_failed',
          title: `Send Failed: ${r.contact.email}`,
          message: `Error sending to ${r.contact.email}: ${err.message}`,
          related_record_id: r.id,
          is_read: false,
          created_at: new Date().toISOString(),
        });
        toast.error(`Failed to send to ${r.contact.email}: ${err.message}`);
      }
    }

    if (newMessages.length > 0) {
      setMessages(prev => [...newMessages, ...prev]);
      setNotifications(prev => [...newNotifications, ...prev]);
      toast.success(
        options?.followupDays
          ? `Sent ${sentCount} email(s) via Gmail API! Follow-up reminder active in ${options.followupDays} days.`
          : `Sent ${sentCount} email(s) via Gmail API!`
      );
    }
    if (newFollowups.length > 0) {
      setFollowups(prev => [...newFollowups, ...prev]);
    }
  };

  const processDueEmails = async (forceAll: boolean = false): Promise<{ sent: number; failed: number }> => {
    const now = Date.now();
    const pending = scheduledEmails.filter(
      j => j.status === 'pending' && (forceAll || new Date(j.scheduled_at).getTime() <= now)
    );

    if (pending.length === 0) {
      try {
        await fetch('/api/cron/send-scheduled', { method: 'POST' });
      } catch {}
      return { sent: 0, failed: 0 };
    }

    let sentCount = 0;
    let failedCount = 0;
    const updatedJobs: ScheduledEmail[] = [];
    const newMessages: EmailMessage[] = [];
    const newNotifications: NotificationItem[] = [];
    const newFollowups: FollowupReminder[] = [];

    for (const job of pending) {
      const rec = outreachRecords.find(r => r.id === job.outreach_record_id);
      const recipientEmail = rec?.contact.email || job.outreach_record?.contact.email;

      // Missing or invalid email check
      if (!recipientEmail || !recipientEmail.includes('@') || !recipientEmail.includes('.')) {
        failedCount++;
        const errorMsg = !recipientEmail ? 'Recipient email address not found' : `Invalid email: "${recipientEmail}"`;
        updatedJobs.push({
          ...job,
          status: 'failed',
          last_error: errorMsg,
        });

        if (rec) {
          setOutreachRecords(prev =>
            prev.map(r => (r.id === rec.id ? { ...r, current_status: 'Failed' as OutreachStatus, updated_at: new Date().toISOString() } : r))
          );
        }

        newNotifications.push({
          id: `notif_fail_${Date.now()}_${job.id}`,
          user_id: profile.id,
          type: 'send_failed',
          title: `Delivery Failed: ${recipientEmail || 'Unknown'}`,
          message: `Could not deliver scheduled email: ${errorMsg}`,
          related_record_id: job.outreach_record_id,
          is_read: false,
          created_at: new Date().toISOString(),
        });
        continue;
      }

      try {
        const sendRes = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: recipientEmail,
            subject: job.approved_subject,
            textBody: job.approved_body,
            outreachRecordId: job.outreach_record_id,
          }),
        });

        const resData = await sendRes.json();
        if (!sendRes.ok) {
          throw new Error(resData.error || 'Failed to deliver message via Gmail API');
        }

        sentCount++;
        const sentMsgId = resData.gmailMessageId || `gm_${Date.now()}`;
        const sentIso = new Date().toISOString();
        updatedJobs.push({
          ...job,
          status: 'sent',
          sent_message_id: sentMsgId,
          last_error: null,
        });

        if (rec) {
          setOutreachRecords(prev =>
            prev.map(r => (r.id === rec.id ? { ...r, current_status: 'Sent' as OutreachStatus, sent_at: sentIso, updated_at: sentIso } : r))
          );

          if (rec.followup_days) {
            newFollowups.push({
              id: `fol_${Date.now()}_${rec.id}`,
              user_id: profile.id,
              outreach_record_id: rec.id,
              due_at: addDays(new Date(), rec.followup_days).toISOString(),
              status: 'pending',
              reminded_at: null,
              completed_at: null,
              created_at: sentIso,
              outreach_record: rec,
            });
          }
        }

        newMessages.push({
          id: `msg_sched_${Date.now()}_${job.id}`,
          user_id: profile.id,
          outreach_record_id: job.outreach_record_id,
          email_account_id: emailAccount.id,
          direction: 'outgoing',
          sender_email: emailAccount.email_address,
          recipient_email: recipientEmail,
          subject: job.approved_subject,
          body_html: `<p>${job.approved_body.replace(/\n/g, '<br/>')}</p>`,
          body_text: job.approved_body,
          gmail_message_id: sentMsgId,
          gmail_thread_id: resData.gmailThreadId || `th_${Date.now()}`,
          internet_message_id: `<${Date.now()}@mail.gmail.com>`,
          sent_at: sentIso,
          received_at: null,
          created_at: sentIso,
        });

        newNotifications.push({
          id: `notif_sched_sent_${Date.now()}_${job.id}`,
          user_id: profile.id,
          type: 'email_sent',
          title: `Sent: ${rec?.contact.name || recipientEmail}`,
          message: `Scheduled email delivered via Gmail API to ${recipientEmail}`,
          related_record_id: job.outreach_record_id,
          is_read: false,
          created_at: sentIso,
        });
      } catch (err: any) {
        failedCount++;
        updatedJobs.push({
          ...job,
          status: 'failed',
          last_error: err.message || 'Delivery error',
        });

        if (rec) {
          setOutreachRecords(prev =>
            prev.map(r => (r.id === rec.id ? { ...r, current_status: 'Failed' as OutreachStatus, updated_at: new Date().toISOString() } : r))
          );
        }

        newNotifications.push({
          id: `notif_err_${Date.now()}_${job.id}`,
          user_id: profile.id,
          type: 'send_failed',
          title: `Delivery Failed: ${recipientEmail}`,
          message: `Scheduled delivery to ${recipientEmail} failed: ${err.message}`,
          related_record_id: job.outreach_record_id,
          is_read: false,
          created_at: new Date().toISOString(),
        });
      }
    }

    if (updatedJobs.length > 0) {
      const jobMap = new Map(updatedJobs.map(j => [j.id, j]));
      setScheduledEmails(prev => prev.map(j => jobMap.get(j.id) || j));
    }

    if (newMessages.length > 0) {
      setMessages(prev => [...newMessages, ...prev]);
    }

    if (newNotifications.length > 0) {
      setNotifications(prev => [...newNotifications, ...prev]);
    }

    if (newFollowups.length > 0) {
      setFollowups(prev => [...newFollowups, ...prev]);
    }

    return { sent: sentCount, failed: failedCount };
  };

  // Periodically check and trigger due scheduled emails in background
  useEffect(() => {
    if (!isLoaded) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const hasDue = scheduledEmails.some(
        j => j.status === 'pending' && new Date(j.scheduled_at).getTime() <= now
      );
      if (hasDue) {
        processDueEmails(false);
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [isLoaded, scheduledEmails]);

  const cancelScheduledJob = (jobId: string) => {
    const job = scheduledEmails.find(j => j.id === jobId);
    if (!job) return;

    setScheduledEmails(prev => prev.filter(j => j.id !== jobId));
    setOutreachRecords(prev =>
      prev.map(r => {
        if (r.id === job.outreach_record_id) {
          return {
            ...r,
            current_status: 'Draft',
            scheduled_send_at: null,
            updated_at: new Date().toISOString(),
          };
        }
        return r;
      })
    );
    toast.info('Cancelled scheduled email.');
  };

  const saveTemplate = (templateData: Partial<EmailTemplate>) => {
    if (templateData.id) {
      setTemplates(prev =>
        prev.map(t => (t.id === templateData.id ? { ...t, ...templateData, updated_at: new Date().toISOString() } : t))
      );
      toast.success('Template updated.');
    } else {
      const newTemplate: EmailTemplate = {
        id: `tmpl_${Date.now()}`,
        user_id: profile.id,
        name: templateData.name || 'Untitled Template',
        subject: templateData.subject || '',
        body: templateData.body || '',
        signature: templateData.signature || '',
        is_default: templateData.is_default || false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setTemplates(prev => [...prev, newTemplate]);
      toast.success('New template created.');
    }
  };

  const deleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast.success('Template deleted.');
  };

  const snoozeFollowup = (reminderId: string, days: number) => {
    setFollowups(prev =>
      prev.map(f => {
        if (f.id === reminderId) {
          const newDue = addDays(new Date(), days).toISOString();
          return { ...f, due_at: newDue, status: 'snoozed' };
        }
        return f;
      })
    );
    toast.success(`Follow-up snoozed for ${days} days.`);
  };

  const completeFollowup = (reminderId: string) => {
    setFollowups(prev =>
      prev.map(f => {
        if (f.id === reminderId) {
          return { ...f, status: 'completed', completed_at: new Date().toISOString() };
        }
        return f;
      })
    );
    toast.success('Follow-up marked as completed.');
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    toast.success('All notifications marked read.');
  };

  const updateProfile = (updates: Partial<UserProfile>) => {
    setProfile(prev => ({ ...prev, ...updates }));
    toast.success('Profile settings saved.');
  };

  const toggleGmailConnection = () => {
    setEmailAccount(prev => {
      const nextStatus = prev.connection_status === 'connected' ? 'disconnected' : 'connected';
      toast[nextStatus === 'connected' ? 'success' : 'info'](
        nextStatus === 'connected' ? 'Connected to Gmail' : 'Disconnected from Gmail'
      );
      return {
        ...prev,
        connection_status: nextStatus,
        last_sync_at: nextStatus === 'connected' ? new Date().toISOString() : prev.last_sync_at,
      };
    });
  };

  const connectRealAccount = useCallback((email: string, name?: string, userId?: string) => {
    // If already connected to this email, do not re-run state initialization
    if (emailAccount.connection_status === 'connected' && emailAccount.email_address === email) {
      return;
    }

    const realUserId = userId || `usr_${Date.now()}`;
    const displayName = name || email.split('@')[0];

    const newAccount: EmailAccount = {
      id: `acc_${Date.now()}`,
      user_id: realUserId,
      provider: 'gmail',
      email_address: email,
      connection_status: 'connected',
      last_sync_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const newProfile: UserProfile = {
      id: realUserId,
      full_name: displayName,
      timezone: profile.timezone || 'Asia/Kolkata',
      default_followup_days: profile.default_followup_days || 5,
      default_signature: `Best regards,\n${displayName}\nEmail: ${email}`,
      portfolio_url: profile.portfolio_url || '',
      linkedin_url: profile.linkedin_url || '',
    };

    // Clean start from scratch for real connected outreach:
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayLabel = format(new Date(), 'd MMM yyyy');
    const cleanDateGroup: DateGroup = {
      id: 'dg_today',
      user_id: realUserId,
      group_date: todayStr,
      label: todayLabel,
      created_at: new Date().toISOString(),
      count: 0,
    };

    setEmailAccount(newAccount);
    setProfile(newProfile);
    setDateGroups([cleanDateGroup]);
    setSelectedDateId('dg_today');
    setContacts([]);
    setOutreachRecords([]);
    setScheduledEmails([]);
    setMessages([]);
    setFollowups([]);
    setNotifications([
      {
        id: `notif_${Date.now()}`,
        user_id: realUserId,
        type: 'batch_completed',
        title: 'Gmail Connected',
        message: `Connected to ${email}. Ready to add your real outreach contacts!`,
        is_read: false,
        created_at: new Date().toISOString(),
        related_record_id: null,
      },
    ]);

    toast.success(`Connected as ${email}. Demo data cleared!`);
  }, [emailAccount.connection_status, emailAccount.email_address, profile.timezone, profile.default_followup_days, profile.portfolio_url, profile.linkedin_url]);

  const disconnectGmail = () => {
    setEmailAccount(prev => ({
      ...prev,
      connection_status: 'disconnected',
    }));
    toast.info('Disconnected from Gmail.');
  };

  const resetToDemoData = () => {
    setProfile(initialProfile);
    setEmailAccount(initialEmailAccount);
    setDateGroups(initialDateGroups);
    setSelectedDateId('dg_today');
    setContacts(initialContacts);
    setOutreachRecords(initialOutreachRecords);
    setTemplates(initialTemplates);
    setScheduledEmails(initialScheduledEmails);
    setMessages(initialMessages);
    setFollowups(initialFollowups);
    setNotifications(initialNotifications);
    toast.info('Reloaded demo data.');
  };

  return (
    <MailDeskContext.Provider
      value={{
        profile,
        emailAccount,
        dateGroups,
        selectedDateId,
        setSelectedDateId,
        contacts,
        outreachRecords,
        templates,
        scheduledEmails,
        messages,
        followups,
        notifications,
        addDateGroup,
        importContacts,
        addSingleRow,
        updateOutreachRecord,
        updateContact,
        batchUpdateRecords,
        deleteOutreachRecords,
        duplicateOutreachRecord,
        scheduleOutreachRecords,
        sendNowRecords,
        processDueEmails,
        cancelScheduledJob,
        saveTemplate,
        deleteTemplate,
        snoozeFollowup,
        completeFollowup,
        markNotificationRead,
        markAllNotificationsRead,
        updateProfile,
        toggleGmailConnection,
        connectRealAccount,
        disconnectGmail,
        resetToDemoData,
      }}
    >
      {children}
    </MailDeskContext.Provider>
  );
}

export function useMailDesk() {
  const context = useContext(MailDeskContext);
  if (!context) {
    throw new Error('useMailDesk must be used within a MailDeskProvider');
  }
  return context;
}
