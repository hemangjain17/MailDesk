'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import {
  Contact,
  DateGroup,
  EmailAccount,
  EmailMessage,
  EmailTemplate,
  FollowupReminder,
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
import { normalizeJobLink, renderEmailBodyTemplate, renderTemplate } from '@/lib/template';
import { htmlToPlainText, normalizeTemplateHtml, sanitizeEmailHtml } from '@/lib/email-html';
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
    jobLinks?: Record<string, string>;
    attachments?: Array<{ filename: string; size_bytes?: number }>;
  }) => Promise<void>;
  sendNowRecords: (
    recordIds: string[],
    options?: {
      followupDays?: number | null;
      templateId?: string;
      isFollowup?: boolean;
      jobLinks?: Record<string, string>;
    }
  ) => Promise<{ sent: number; failed: number }>;
  processDueEmails: (forceAll?: boolean) => Promise<{ sent: number; failed: number }>;
  cancelScheduledJob: (jobId: string) => Promise<void>;
  saveTemplate: (template: Partial<EmailTemplate>) => void;
  deleteTemplate: (id: string) => void;
  snoozeFollowup: (reminderId: string, days: number) => void;
  completeFollowup: (reminderId: string) => void;
  createNextFollowup: (reminderId: string, days?: number) => Promise<void>;
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
  const dateGroupsRef = useRef<DateGroup[]>(initialDateGroups);

  useEffect(() => {
    dateGroupsRef.current = dateGroups;
  }, [dateGroups]);

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

        const rawJobs: ScheduledEmail[] = parsed.scheduledEmails || [];
        // A queued delivery is independent from an immediate send on the same outreach row.
        // Only the queue worker or an explicit cancellation may change its status.
        // Recover future jobs that older builds incorrectly marked sent after a Send Now action.
        const reconciledJobs = rawJobs.map(job =>
          job.status === 'sent' && new Date(job.scheduled_at).getTime() > Date.now()
            ? { ...job, status: 'pending' as const, sent_message_id: null, last_error: null }
            : job
        );
        setScheduledEmails(reconciledJobs);
      }
    } catch (e) {
      console.warn('Failed to load stored MailDesk state', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Reconcile cloud-created reminders (including reminders created while this
  // browser was closed) into the local UI. The endpoint intentionally returns
  // only the most recent ten days.
  useEffect(() => {
    if (!isLoaded || emailAccount.connection_status !== 'connected') return;

    let cancelled = false;
    const loadCloudFollowups = async () => {
      try {
        const response = await fetch('/api/followups', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load cloud follow-ups');
        if (cancelled) return;

        const cloudFollowups: FollowupReminder[] = result.followups || [];
        setFollowups(previous => {
          const merged = new Map(previous.map(item => [item.id, item]));
          cloudFollowups.forEach(item => merged.set(item.id, item));
          return Array.from(merged.values());
        });
        const cloudOutreach = cloudFollowups
          .map(item => item.outreach_record)
          .filter((item): item is OutreachRecord => Boolean(item));
        setOutreachRecords(previous => {
          const merged = new Map(previous.map(item => [item.id, item]));
          cloudOutreach.forEach(item => merged.set(item.id, item));
          return Array.from(merged.values());
        });
      } catch (error) {
        console.warn('Cloud follow-up reconciliation failed:', error);
      }
    };

    loadCloudFollowups();
    const interval = setInterval(loadCloudFollowups, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isLoaded, emailAccount.connection_status]);

  // Supabase is the authoritative queue. Polling it keeps AWS-sent/cancelled
  // jobs accurate in the UI without allowing the browser to execute the queue.
  useEffect(() => {
    if (!isLoaded || emailAccount.connection_status !== 'connected') return;

    let cancelled = false;
    const loadCloudSchedule = async () => {
      try {
        const response = await fetch('/api/schedule', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load cloud schedule');
        if (cancelled) return;
        const cloudJobs: ScheduledEmail[] = result.jobs || [];
        setScheduledEmails(previous => {
          const localOnly = previous.filter(job => !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(job.id));
          return [...cloudJobs, ...localOnly];
        });
      } catch (error) {
        console.warn('Cloud schedule reconciliation failed:', error);
      }
    };

    loadCloudSchedule();
    const interval = setInterval(loadCloudSchedule, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isLoaded, emailAccount.connection_status]);

  // Keep All Contacts focused on today's tab. At midnight, create/select the new
  // day without removing any previous date groups or their outreach records.
  useEffect(() => {
    if (!isLoaded) return;

    let rolloverTimer: ReturnType<typeof setTimeout> | undefined;

    const selectTodayAndScheduleNextRollover = () => {
      const now = new Date();
      const today = format(now, 'yyyy-MM-dd');
      const existingToday = dateGroupsRef.current.find(group => group.group_date === today);

      if (existingToday) {
        setSelectedDateId(existingToday.id);
      } else {
        const todayGroup: DateGroup = {
          id: `dg_${Date.now()}`,
          user_id: profile.id,
          group_date: today,
          label: format(now, 'd MMM yyyy'),
          created_at: now.toISOString(),
          count: 0,
        };
        dateGroupsRef.current = [todayGroup, ...dateGroupsRef.current];
        setDateGroups(previous => [todayGroup, ...previous]);
        setSelectedDateId(todayGroup.id);
      }

      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 1, 0);
      rolloverTimer = setTimeout(
        selectTodayAndScheduleNextRollover,
        nextMidnight.getTime() - now.getTime()
      );
    };

    selectTodayAndScheduleNextRollover();
    return () => {
      if (rolloverTimer) clearTimeout(rolloverTimer);
    };
  }, [isLoaded, profile.id]);

  // Save changes to localStorage
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const statePayload = JSON.stringify({
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
      });

      localStorage.setItem(STORAGE_KEY, statePayload);

      // If connected to a real email account, preserve contacts, schedule, and history under their specific email key
      if (emailAccount.email_address && emailAccount.connection_status === 'connected') {
        const cleanEmail = emailAccount.email_address.toLowerCase().trim();
        localStorage.setItem(`maildesk_account_${cleanEmail}`, statePayload);
      }
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
    const dateGroupId =
      targetDateGroupId ||
      (selectedDateId === 'all' ? dateGroups[0]?.id : selectedDateId) ||
      dateGroups[0]?.id ||
      'dg_today';
    const existingEmails = outreachRecords
      .filter(record => record.date_group_id === dateGroupId)
      .map(record => record.contact.email);
    const parsed = parseBulkContacts(raw, existingEmails);

    if (parsed.valid.length === 0) {
      toast.error('No valid new email addresses found.');
      return parsed;
    }

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
        job_link: null,
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
    const dateGroupId =
      targetDateGroupId ||
      (selectedDateId === 'all' ? dateGroups[0]?.id : selectedDateId) ||
      dateGroups[0]?.id ||
      'dg_today';
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
      job_link: null,
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
    jobLinks = {},
    attachments = [],
  }: {
    recordIds: string[];
    templateId: string;
    scheduledAt: string;
    mode: 'same_time' | 'sequential';
    intervalMinutes: number;
    followupDays?: number | null;
    jobLinks?: Record<string, string>;
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
      const effectiveJobLink = normalizeJobLink(jobLinks[rec.id] ?? rec.job_link ?? '');

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
        job_link: effectiveJobLink,
      });

      const renderedBody = renderEmailBodyTemplate(rec.body_override || chosenTemplate.body, {
        recipient_name: rec.contact.name || '',
        company: rec.company_override || rec.contact.company || '',
        position: rec.position_override || rec.contact.position || '',
        sender_name: profile.full_name || '',
        portfolio_url: profile.portfolio_url || '',
        linkedin_url: profile.linkedin_url || '',
        job_link: effectiveJobLink,
      });

      const jobId = `job_${Date.now()}_${index}`;
      const newJob: ScheduledEmail = {
        id: jobId,
        user_id: profile.id,
        outreach_record_id: rec.id,
        email_account_id: emailAccount.id,
        approved_subject: renderedSubj.renderedText,
        approved_body: sanitizeEmailHtml(normalizeTemplateHtml(renderedBody.renderedText)),
        approved_attachments: attachments,
        scheduled_at: sendTime,
        status: 'pending',
        attempt_count: 0,
        last_error: null,
        idempotency_key: `idemp_${rec.id}_${Date.now()}_${index}`,
        locked_until: null,
        sent_message_id: null,
        created_at: new Date().toISOString(),
        outreach_record: { ...rec, job_link: effectiveJobLink },
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
      const scheduleResponse = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobs: newJobs.map(j => ({
            outreachRecordId: j.outreach_record_id,
            to: j.outreach_record?.contact.email || '',
            recipientName: j.outreach_record?.contact.name || '',
            company: j.outreach_record?.company_override || j.outreach_record?.contact.company || '',
            position: j.outreach_record?.position_override || j.outreach_record?.contact.position || '',
            jobLink: j.outreach_record?.job_link || '',
            subject: j.approved_subject,
            body: j.approved_body,
            scheduledAt: j.scheduled_at,
            followupDays: followupDays || 5,
          })),
        }),
      });
      const scheduleResult = await scheduleResponse.json();
      if (!scheduleResponse.ok || scheduleResult.scheduledCount !== newJobs.length) {
        throw new Error(scheduleResult.error || 'Not every scheduled email was saved to the cloud queue');
      }
      setScheduledEmails(previous =>
        previous.map(localJob => {
          const index = newJobs.findIndex(created => created.id === localJob.id);
          const persistedJob = scheduleResult.jobs?.[index];
          return persistedJob ? { ...localJob, id: persistedJob.id } : localJob;
        })
      );
    } catch (schedErr) {
      console.warn('Failed to persist to /api/schedule:', schedErr);
      setScheduledEmails(previous => previous.filter(job => !newJobs.some(created => created.id === job.id)));
      setFollowups(previous => previous.filter(item => !newFollowups.some(created => created.id === item.id)));
      toast.error(`Scheduling failed: ${schedErr instanceof Error ? schedErr.message : 'cloud persistence failed'}`);
      return;
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
            job_link: matchJob?.outreach_record?.job_link || r.job_link || null,
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

  const sendNowRecords = async (
    recordIds: string[],
    options?: {
      followupDays?: number | null;
      templateId?: string;
      isFollowup?: boolean;
      jobLinks?: Record<string, string>;
    }
  ) => {
    const defaultTemplate = templates.find(template => template.id === options?.templateId) || templates[0];
    const newMessages: EmailMessage[] = [];
    const newNotifications: NotificationItem[] = [];
    const newFollowups: FollowupReminder[] = [];

    let sentCount = 0;
    let failedCount = 0;
    const successfulFollowupRecordIds = new Set<string>();

    if (options?.jobLinks) {
      setOutreachRecords(previous =>
        previous.map(record =>
          Object.prototype.hasOwnProperty.call(options.jobLinks, record.id)
            ? { ...record, job_link: normalizeJobLink(options.jobLinks?.[record.id] || '') || null }
            : record
        )
      );
    }

    for (const recId of recordIds) {
      const r = outreachRecords.find(item => item.id === recId);
      if (!r) continue;
      const effectiveJobLink = normalizeJobLink(options?.jobLinks?.[r.id] ?? r.job_link ?? '');
      const chosenTemplate = options?.isFollowup
        ? defaultTemplate
        : templates.find(template => template.id === r.template_id) || r.template || defaultTemplate;

      const subjectSource = options?.isFollowup
        ? chosenTemplate.subject
        : r.subject_override || chosenTemplate.subject;
      const bodySource = options?.isFollowup
        ? chosenTemplate.body
        : r.body_override || chosenTemplate.body;

      const subj = renderTemplate(subjectSource, {
        recipient_name: r.contact.name || '',
        company: r.company_override || r.contact.company || '',
        position: r.position_override || r.contact.position || '',
        sender_name: profile.full_name || '',
        job_link: effectiveJobLink,
      }).renderedText;

      const body = renderEmailBodyTemplate(bodySource, {
        recipient_name: r.contact.name || '',
        company: r.company_override || r.contact.company || '',
        position: r.position_override || r.contact.position || '',
        sender_name: profile.full_name || '',
        portfolio_url: profile.portfolio_url || '',
        linkedin_url: profile.linkedin_url || '',
        job_link: effectiveJobLink,
      }).renderedText;
      const bodyHtml = sanitizeEmailHtml(normalizeTemplateHtml(body));
      const bodyText = htmlToPlainText(bodyHtml);
      const originalMessage = options?.isFollowup
        ? messages
            .filter(message => message.outreach_record_id === r.id && message.direction === 'outgoing')
            .sort(
              (a, b) =>
                new Date(a.sent_at || a.created_at).getTime() -
                new Date(b.sent_at || b.created_at).getTime()
            )[0]
        : undefined;

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
            textBody: bodyText,
            htmlBody: bodyHtml,
            outreachRecordId: r.id,
            replyToOriginal: options?.isFollowup === true,
            replyToMessageId: originalMessage?.gmail_message_id || undefined,
            replyToThreadId: originalMessage?.gmail_thread_id || undefined,
            originalSubject: originalMessage?.subject || undefined,
            templateId: chosenTemplate.id,
            templateName: chosenTemplate.name,
            recipientName: r.contact.name || '',
            company: r.company_override || r.contact.company || '',
            position: r.position_override || r.contact.position || '',
            jobLink: effectiveJobLink,
            followupDays: options?.isFollowup ? null : options?.followupDays ?? r.followup_days,
          }),
        });

        const resData = await sendRes.json();
        if (!sendRes.ok) {
          throw new Error(resData.error || 'Failed to send via Gmail API');
        }

        sentCount++;
        if (options?.isFollowup) successfulFollowupRecordIds.add(r.id);
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
          subject: resData.subject || subj,
          body_html: bodyHtml,
          body_text: bodyText,
          gmail_message_id: resData.gmailMessageId || `gm_${Date.now()}`,
          gmail_thread_id: resData.gmailThreadId || `th_${Date.now()}`,
          internet_message_id: resData.internetMessageId || `<${Date.now()}@mail.gmail.com>`,
          client_outreach_id: r.id,
          client_template_id: chosenTemplate.id,
          template_name: chosenTemplate.name,
          sent_at: sentIso,
          received_at: null,
          created_at: sentIso,
        });

        if (resData.sentAsNewMessage) {
          toast.warning(`Follow-up sent as a new email to ${r.contact.email}`, {
            description: resData.threadFallbackReason || 'The original Gmail thread was unavailable.',
          });
        }

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

        // Preserve the original dated row and also reflect the delivery in the
        // date tab matching the actual sent date.
        const sentDay = format(new Date(sentIso), 'yyyy-MM-dd');
        let sentDateGroup = dateGroupsRef.current.find(group => group.group_date === sentDay);
        if (!sentDateGroup) {
          sentDateGroup = {
            id: `dg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            user_id: profile.id,
            group_date: sentDay,
            label: format(new Date(sentIso), 'd MMM yyyy'),
            created_at: sentIso,
            count: 0,
          };
          dateGroupsRef.current = [sentDateGroup, ...dateGroupsRef.current];
          setDateGroups(previous => [sentDateGroup!, ...previous]);
        }

        const sentGroupId = sentDateGroup.id;
        setOutreachRecords(previous => {
          const normalizedEmail = r.contact.email.trim().toLowerCase();
          const recordOnSentDate = previous.find(
            row =>
              row.date_group_id === sentGroupId &&
              row.contact.email.trim().toLowerCase() === normalizedEmail
          );
          const applySentState = (row: OutreachRecord): OutreachRecord => ({
            ...row,
            current_status: 'Sent',
            sent_at: sentIso,
            template_id: chosenTemplate.id,
            template: chosenTemplate,
            job_link: effectiveJobLink || row.job_link || null,
            followup_days: options?.isFollowup
              ? row.followup_days
              : options?.followupDays !== undefined
                ? (options.followupDays || 5)
                : row.followup_days,
            updated_at: sentIso,
          });

          const updated = previous.map(row =>
            row.id === r.id || (recordOnSentDate && row.id === recordOnSentDate.id)
              ? applySentState(row)
              : row
          );

          if (r.date_group_id === sentGroupId || recordOnSentDate) return updated;

          const sentDateCopy: OutreachRecord = applySentState({
            ...r,
            id: `out_sent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            date_group_id: sentGroupId,
            scheduled_send_at: null,
            created_at: sentIso,
          });
          return [sentDateCopy, ...updated];
        });

        // Setup follow-up reminder if requested
        const effectiveFollowupDays = options?.isFollowup
          ? null
          : options?.followupDays !== undefined
            ? options.followupDays
            : r.followup_days;
        if (effectiveFollowupDays) {
          const cloudReminder = resData.followupReminder;
          newFollowups.push(
            cloudReminder
              ? {
                  ...cloudReminder,
                  outreach_record: {
                    ...r,
                    id: resData.outreachRecordId || r.id,
                  },
                }
              : {
                  id: `fol_${Date.now()}_${r.id}`,
                  user_id: profile.id,
                  outreach_record_id: r.id,
                  due_at: addDays(new Date(), effectiveFollowupDays).toISOString(),
                  status: 'pending',
                  reminded_at: null,
                  completed_at: null,
                  created_at: sentIso,
                  outreach_record: r,
                  sequence_number: 1,
                }
          );
        }
      } catch (err: any) {
        failedCount++;
        setOutreachRecords(prev =>
          prev.map(row => (row.id === r.id ? { ...row, current_status: 'Failed', updated_at: new Date().toISOString() } : row))
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
    if (successfulFollowupRecordIds.size > 0) {
      const completedAt = new Date().toISOString();
      const persistedReminderIds = followups
        .filter(
          reminder =>
            successfulFollowupRecordIds.has(reminder.outreach_record_id) &&
            reminder.status !== 'completed' &&
            /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(reminder.id)
        )
        .map(reminder => reminder.id);
      setFollowups(prev =>
        prev.map(reminder =>
          successfulFollowupRecordIds.has(reminder.outreach_record_id) && reminder.status !== 'completed'
            ? { ...reminder, status: 'completed', completed_at: completedAt }
            : reminder
        )
      );
      persistedReminderIds.forEach(reminderId => {
        void fetch('/api/followups', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reminderId, status: 'completed' }),
        });
      });
    }
    return { sent: sentCount, failed: failedCount };
  };

  const processDueEmails = async (forceAll: boolean = false): Promise<{ sent: number; failed: number }> => {
    const now = Date.now();
    const pending = scheduledEmails.filter(
      j => j.status === 'pending' && (forceAll || new Date(j.scheduled_at).getTime() <= now)
    );

    if (pending.length === 0) {
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
      const jobTemplate = rec?.template || templates.find(template => template.id === rec?.template_id) || templates[0];

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
        const bodyHtml = sanitizeEmailHtml(normalizeTemplateHtml(job.approved_body));
        const bodyText = htmlToPlainText(bodyHtml);
        const sendRes = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: recipientEmail,
            subject: job.approved_subject,
            textBody: bodyText,
            htmlBody: bodyHtml,
            outreachRecordId: job.outreach_record_id,
            templateId: jobTemplate?.id,
            templateName: jobTemplate?.name,
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
          const sentDay = format(new Date(sentIso), 'yyyy-MM-dd');
          let sentDateGroup = dateGroupsRef.current.find(group => group.group_date === sentDay);
          if (!sentDateGroup) {
            sentDateGroup = {
              id: `dg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              user_id: profile.id,
              group_date: sentDay,
              label: format(new Date(sentIso), 'd MMM yyyy'),
              created_at: sentIso,
              count: 0,
            };
            dateGroupsRef.current = [sentDateGroup, ...dateGroupsRef.current];
            setDateGroups(previous => [sentDateGroup!, ...previous]);
          }
          const sentGroupId = sentDateGroup.id;
          setOutreachRecords(previous => {
            const normalizedEmail = rec.contact.email.trim().toLowerCase();
            const recordOnSentDate = previous.find(
              row => row.date_group_id === sentGroupId && row.contact.email.trim().toLowerCase() === normalizedEmail
            );
            const markSent = (row: OutreachRecord): OutreachRecord => ({
              ...row,
              current_status: 'Sent',
              sent_at: sentIso,
              template_id: jobTemplate?.id || row.template_id,
              template: jobTemplate || row.template,
              updated_at: sentIso,
            });
            const updated = previous.map(row =>
              row.id === rec.id || (recordOnSentDate && row.id === recordOnSentDate.id) ? markSent(row) : row
            );
            if (rec.date_group_id === sentGroupId || recordOnSentDate) return updated;
            return [
              markSent({
                ...rec,
                id: `out_sent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                date_group_id: sentGroupId,
                scheduled_send_at: null,
                created_at: sentIso,
              }),
              ...updated,
            ];
          });

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
          body_html: bodyHtml,
          body_text: bodyText,
          gmail_message_id: sentMsgId,
          gmail_thread_id: resData.gmailThreadId || `th_${Date.now()}`,
          internet_message_id: `<${Date.now()}@mail.gmail.com>`,
          client_outreach_id: job.outreach_record_id,
          client_template_id: jobTemplate?.id || null,
          template_name: jobTemplate?.name || null,
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

  const cancelScheduledJob = async (jobId: string) => {
    const job = scheduledEmails.find(j => j.id === jobId);
    if (!job) return;

    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(jobId)) {
      try {
        const response = await fetch(`/api/schedule?id=${encodeURIComponent(jobId)}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Cloud queue deletion failed');
      } catch (error) {
        toast.error(`Could not cancel scheduled email: ${error instanceof Error ? error.message : 'unknown error'}`);
        return;
      }
    }

    setScheduledEmails(prev => prev.filter(j => j.id !== jobId));
    setFollowups(prev => prev.filter(reminder => reminder.outreach_record_id !== job.outreach_record_id));
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
    toast.info('Scheduled email and its follow-up reminders were deleted.');
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
    const newDue = addDays(new Date(), days).toISOString();
    setFollowups(prev =>
      prev.map(f => {
        if (f.id === reminderId) {
          return { ...f, due_at: newDue, status: 'snoozed' };
        }
        return f;
      })
    );
    toast.success(`Follow-up snoozed for ${days} days.`);
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(reminderId)) {
      void fetch('/api/followups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminderId, status: 'snoozed', dueAt: newDue }),
      });
    }
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
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(reminderId)) {
      void fetch('/api/followups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminderId, status: 'completed' }),
      });
    }
  };

  const createNextFollowup = async (reminderId: string, days = 3) => {
    const parent = followups.find(item => item.id === reminderId);
    if (!parent) return;

    try {
      if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(reminderId)) {
        const response = await fetch('/api/followups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reminderId, days }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not create the next follow-up');
        setFollowups(previous => [result.followup, ...previous]);
      } else {
        const next: FollowupReminder = {
          ...parent,
          id: `fol_next_${Date.now()}`,
          due_at: addDays(new Date(), days).toISOString(),
          status: 'pending',
          reminded_at: null,
          completed_at: null,
          created_at: new Date().toISOString(),
          parent_reminder_id: parent.id,
          sequence_number: (parent.sequence_number || 1) + 1,
        };
        setFollowups(previous => [next, ...previous]);
      }
      toast.success(`Follow-up #${(parent.sequence_number || 1) + 1} created for ${days} days from now.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the next follow-up');
    }
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
    const cleanEmail = email.toLowerCase().trim();
    const accountKey = `maildesk_account_${cleanEmail}`;

    // If already connected to this email, do not re-run state initialization
    if (emailAccount.connection_status === 'connected' && emailAccount.email_address?.toLowerCase().trim() === cleanEmail) {
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

    // Check if we have saved data for this specific email account
    const savedAccountData = typeof window !== 'undefined' ? localStorage.getItem(accountKey) : null;
    if (savedAccountData) {
      try {
        const parsed = JSON.parse(savedAccountData);
        setEmailAccount(newAccount);
        if (parsed.profile) setProfile(parsed.profile);
        if (parsed.dateGroups && parsed.dateGroups.length > 0) setDateGroups(parsed.dateGroups);
        if (parsed.selectedDateId) setSelectedDateId(parsed.selectedDateId);
        if (parsed.contacts) setContacts(parsed.contacts);
        if (parsed.templates) setTemplates(parsed.templates);
        if (parsed.messages) setMessages(parsed.messages);
        if (parsed.followups) setFollowups(parsed.followups);
        if (parsed.notifications) setNotifications(parsed.notifications);

        if (parsed.outreachRecords) {
          const rawRecords: OutreachRecord[] = parsed.outreachRecords;
          const reconciledRecords = rawRecords.map(r => {
            if (r.sent_at && r.current_status === 'Scheduled') {
              return { ...r, current_status: 'Sent' as OutreachStatus };
            }
            return r;
          });
          setOutreachRecords(reconciledRecords);
        }

        if (parsed.scheduledEmails) {
          setScheduledEmails(parsed.scheduledEmails);
        }

        toast.success(`Welcome back, ${email}! Restored your contacts, schedule, and sent history.`);
        return;
      } catch (e) {
        console.warn('Failed to parse saved account state', e);
      }
    }

    // Fresh start only if this email has never been used before
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

    toast.success(`Connected as ${email}. Fresh outreach workspace initialized!`);
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
        createNextFollowup,
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
