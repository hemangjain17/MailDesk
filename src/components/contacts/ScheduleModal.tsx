'use client';

import React, { useState, useMemo } from 'react';
import { Calendar, Clock, Sparkles, Check, AlertCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMailDesk } from '@/context/MailDeskContext';
import { renderEmailBodyTemplate, renderTemplate } from '@/lib/template';
import { format, addDays } from 'date-fns';
import { normalizeTemplateHtml, sanitizeEmailHtml } from '@/lib/email-html';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRecordIds: string[];
}

export function ScheduleModal({ isOpen, onClose, selectedRecordIds }: ScheduleModalProps) {
  const {
    outreachRecords,
    templates,
    emailAccount,
    profile,
    scheduleOutreachRecords,
  } = useMailDesk();

  const [chosenTemplateId, setChosenTemplateId] = useState<string>(
    templates.find(t => t.is_default)?.id || templates[0]?.id || ''
  );

  // Default to tomorrow at 10:30 AM
  const tomorrow = addDays(new Date(), 1);
  const [scheduledDate, setScheduledDate] = useState<string>(format(tomorrow, 'yyyy-MM-dd'));
  const [scheduledTime, setScheduledTime] = useState<string>('10:30');
  const [schedulingMode, setSchedulingMode] = useState<'same_time' | 'sequential'>('sequential');
  const [intervalMinutes, setIntervalMinutes] = useState<number>(2);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [enableFollowup, setEnableFollowup] = useState(true);
  const [followupDays, setFollowupDays] = useState(profile.default_followup_days || 5);

  const selectedRecords = useMemo(() => {
    return outreachRecords.filter(r => selectedRecordIds.includes(r.id));
  }, [outreachRecords, selectedRecordIds]);

  const chosenTemplate = useMemo(() => {
    return templates.find(t => t.id === chosenTemplateId) || templates[0];
  }, [templates, chosenTemplateId]);

  // Generate previews for all selected records
  const renderedPreviews = useMemo(() => {
    if (!chosenTemplate) return [];
    return selectedRecords.map(rec => {
      const subj = renderTemplate(rec.subject_override || chosenTemplate.subject, {
        recipient_name: rec.contact.name || '',
        company: rec.company_override || rec.contact.company || '',
        position: rec.position_override || rec.contact.position || '',
        sender_name: profile.full_name || '',
        portfolio_url: profile.portfolio_url || '',
        linkedin_url: profile.linkedin_url || '',
        job_link: rec.job_link || '',
      });

      const body = renderEmailBodyTemplate(rec.body_override || chosenTemplate.body, {
        recipient_name: rec.contact.name || '',
        company: rec.company_override || rec.contact.company || '',
        position: rec.position_override || rec.contact.position || '',
        sender_name: profile.full_name || '',
        portfolio_url: profile.portfolio_url || '',
        linkedin_url: profile.linkedin_url || '',
        job_link: rec.job_link || '',
      });

      const hasMissing = subj.hasUnresolvedPlaceholders || body.hasUnresolvedPlaceholders;
      const missingList = [...subj.missingVariables, ...body.missingVariables];

      return {
        record: rec,
        subject: subj.renderedText,
        body: body.renderedText,
        hasMissing,
        missingList,
      };
    });
  }, [selectedRecords, chosenTemplate, profile]);

  const totalMissingPlaceholders = renderedPreviews.filter(p => p.hasMissing).length;

  if (!isOpen) return null;

  const handleConfirmSchedule = async () => {
    const combinedTimestamp = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();

    await scheduleOutreachRecords({
      recordIds: selectedRecordIds,
      templateId: chosenTemplateId,
      scheduledAt: combinedTimestamp,
      mode: schedulingMode,
      intervalMinutes,
      followupDays: enableFollowup ? followupDays : null,
      attachments: [{ filename: 'Resume_Engineering.pdf', size_bytes: 145000 }],
    });

    onClose();
  };

  const currentPreview = renderedPreviews[previewIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Schedule Email ({selectedRecordIds.length} Recipient{selectedRecordIds.length > 1 ? 's' : ''})
            </h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto pr-1 flex-1">
          {/* Senders & Template Config Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Sending Gmail Account</label>
              <input
                type="text"
                disabled
                value={`${emailAccount.email_address} (Connected)`}
                className="w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-xs text-foreground cursor-not-allowed font-medium"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Email Template</label>
              <select
                value={chosenTemplateId}
                onChange={e => setChosenTemplateId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.is_default ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Send Date & Time ({profile.timezone})</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  className="w-1/2 rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground"
                />
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  className="w-1/2 rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Scheduling Delivery Mode</label>
              <div className="flex gap-2">
                <select
                  value={schedulingMode}
                  onChange={e => setSchedulingMode(e.target.value as any)}
                  className="w-1/2 rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground"
                >
                  <option value="sequential">Sequential Interval</option>
                  <option value="same_time">Same Timestamp</option>
                </select>
                {schedulingMode === 'sequential' && (
                  <div className="w-1/2 flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={intervalMinutes}
                      onChange={e => setIntervalMinutes(Number(e.target.value))}
                      className="w-16 rounded-md border border-input bg-background px-2 py-2 text-xs text-foreground"
                    />
                    <span className="text-[11px] text-muted-foreground">min gap</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Follow-up Reminder Toggle */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enableFollowup}
                onChange={e => setEnableFollowup(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary cursor-pointer"
              />
              <span className="text-xs font-medium text-foreground">Enable follow-up reminders</span>
            </label>
            {enableFollowup && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-xs text-muted-foreground">Remind after</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={followupDays}
                  onChange={e => setFollowupDays(Number(e.target.value))}
                  className="w-14 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-center"
                />
                <span className="text-xs text-muted-foreground">business days (if no reply received)</span>
              </div>
            )}
          </div>

          {/* Validation Warning Banner if unreplaced placeholders exist */}
          {totalMissingPlaceholders > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <strong>Warning:</strong> {totalMissingPlaceholders} contact(s) have missing fields (e.g. position, company) resulting in unresolved placeholders like <code className="bg-amber-200 dark:bg-amber-900 px-1 py-0.5 rounded font-mono">&#123;&#123;position&#125;&#125;</code>. You can review or edit rows before sending.
              </div>
            </div>
          )}

          {/* Personalized Preview Carousel */}
          {currentPreview && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="text-xs">
                  <span className="font-semibold text-foreground">
                    Preview {previewIndex + 1} of {renderedPreviews.length}:
                  </span>{' '}
                  <span className="text-muted-foreground font-mono">
                    {currentPreview.record.contact.name || currentPreview.record.contact.email}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    disabled={previewIndex === 0}
                    onClick={() => setPreviewIndex(prev => prev - 1)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    disabled={previewIndex === renderedPreviews.length - 1}
                    onClick={() => setPreviewIndex(prev => prev + 1)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="font-medium text-muted-foreground">Subject: </span>
                  <span className="font-semibold text-foreground">{currentPreview.subject}</span>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground block mb-1">Rendered Message Body:</span>
                  <div
                    className="email-rich-content rounded bg-muted/40 p-3 font-sans text-xs text-foreground border border-border leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(normalizeTemplateHtml(currentPreview.body)) }}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Attached resume: <span className="font-medium text-foreground">Resume_Engineering.pdf (145 KB)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-border pt-4 shrink-0">
          <div className="text-xs text-muted-foreground">
            Durable background worker will send via Gmail API at chosen time.
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSchedule}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
            >
              Confirm & Schedule {selectedRecordIds.length} Email{selectedRecordIds.length > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
