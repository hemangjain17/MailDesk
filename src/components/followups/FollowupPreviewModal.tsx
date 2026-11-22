'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Link as LinkIcon, Mail, Send, X } from 'lucide-react';
import { useMailDesk } from '@/context/MailDeskContext';
import { renderEmailBodyTemplate, renderTemplate } from '@/lib/template';
import { normalizeTemplateHtml, sanitizeEmailHtml } from '@/lib/email-html';

interface FollowupPreviewModalProps {
  isOpen: boolean;
  recordIds: string[];
  templateId: string;
  onClose: () => void;
  onSent: () => void;
}

export function FollowupPreviewModal({
  isOpen,
  recordIds,
  templateId,
  onClose,
  onSent,
}: FollowupPreviewModalProps) {
  const { outreachRecords, templates, messages, profile, sendNowRecords } = useMailDesk();
  const [previewIndex, setPreviewIndex] = useState(0);
  const [jobLinks, setJobLinks] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState(false);

  const selectedRecords = useMemo(
    () => outreachRecords.filter(record => recordIds.includes(record.id)),
    [outreachRecords, recordIds]
  );
  const template = templates.find(item => item.id === templateId) || templates[0];

  useEffect(() => {
    if (!isOpen) return;
    setJobLinks(
      Object.fromEntries(selectedRecords.map(record => [record.id, record.job_link || '']))
    );
    setPreviewIndex(0);
  }, [isOpen, recordIds.join('|')]);

  const previews = useMemo(() => {
    if (!template) return [];
    return selectedRecords.map(record => {
      const variables = {
        recipient_name: record.contact.name || '',
        company: record.company_override || record.contact.company || '',
        position: record.position_override || record.contact.position || '',
        sender_name: profile.full_name || '',
        portfolio_url: profile.portfolio_url || '',
        linkedin_url: profile.linkedin_url || '',
        job_link: jobLinks[record.id] ?? record.job_link ?? '',
      };
      const templateSubject = renderTemplate(template.subject, variables);
      const body = renderEmailBodyTemplate(template.body, variables);
      const originalMessage = messages
        .filter(message => message.outreach_record_id === record.id && message.direction === 'outgoing')
        .sort(
          (a, b) =>
            new Date(a.sent_at || a.created_at).getTime() -
            new Date(b.sent_at || b.created_at).getTime()
        )[0];
      const originalSubject = originalMessage?.subject;
      const subject = originalSubject
        ? /^re:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`
        : templateSubject.renderedText;

      return {
        record,
        subject,
        body: body.renderedText,
        hasMissing: templateSubject.hasUnresolvedPlaceholders || body.hasUnresolvedPlaceholders,
      };
    });
  }, [selectedRecords, template, profile, jobLinks, messages]);

  if (!isOpen || !template) return null;

  const templateUsesJobLink = /\{\{job_link\}\}/.test(`${template.subject} ${template.body}`);
  const missingJobLinkCount = templateUsesJobLink
    ? selectedRecords.filter(record => !(jobLinks[record.id] || '').trim()).length
    : 0;
  const currentPreview = previews[previewIndex];

  const handleSend = async () => {
    if (missingJobLinkCount > 0 || recordIds.length === 0) return;
    setIsSending(true);
    try {
      const result = await sendNowRecords(recordIds, {
        templateId,
        isFollowup: true,
        followupDays: null,
        jobLinks,
      });
      if (result.sent > 0) {
        onSent();
        onClose();
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Mail className="h-5 w-5 text-primary" />
              Preview Follow-ups ({recordIds.length})
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Review every recipient and provide their individual job link before replying.
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto py-4 pr-1">
          <section className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <LinkIcon className="h-3.5 w-3.5 text-primary" />
              Individual job links
            </div>
            <div className="grid gap-2">
              {selectedRecords.map(record => (
                <label key={record.id} className="grid gap-1 sm:grid-cols-[190px_1fr] sm:items-center">
                  <span className="truncate text-[11px] font-medium text-foreground" title={record.contact.email}>
                    {record.contact.name || record.contact.email}
                  </span>
                  <input
                    type="url"
                    value={jobLinks[record.id] || ''}
                    onChange={event =>
                      setJobLinks(previous => ({ ...previous, [record.id]: event.target.value }))
                    }
                    placeholder="https://company.com/jobs/role"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
              ))}
            </div>
          </section>

          {missingJobLinkCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Add a job link for {missingJobLinkCount} recipient{missingJobLinkCount > 1 ? 's' : ''} because this template uses &#123;&#123;job_link&#125;&#125;.
            </div>
          )}

          {missingJobLinkCount === 0 && previews.some(preview => preview.hasMissing) && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              One or more previews still contain unresolved template placeholders. Complete the missing contact fields before sending.
            </div>
          )}

          {currentPreview && (
            <section className="space-y-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="text-xs">
                  <strong>Preview {previewIndex + 1} of {previews.length}:</strong>{' '}
                  <span className="text-muted-foreground">
                    {currentPreview.record.contact.name
                      ? `${currentPreview.record.contact.name} <${currentPreview.record.contact.email}>`
                      : currentPreview.record.contact.email}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button disabled={previewIndex === 0} onClick={() => setPreviewIndex(value => value - 1)} className="rounded p-1 hover:bg-muted disabled:opacity-30">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button disabled={previewIndex === previews.length - 1} onClick={() => setPreviewIndex(value => value + 1)} className="rounded p-1 hover:bg-muted disabled:opacity-30">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="text-xs">
                <span className="font-medium text-muted-foreground">Subject: </span>
                <span className="font-semibold text-foreground">{currentPreview.subject}</span>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Rendered Message Body:</span>
                <div
                  className="email-rich-content rounded border border-border bg-muted/30 p-4 text-xs leading-relaxed text-foreground"
                  dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(normalizeTemplateHtml(currentPreview.body)) }}
                />
              </div>
            </section>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || missingJobLinkCount > 0 || previews.some(preview => preview.hasMissing)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {isSending ? 'Sending...' : `Reply with ${recordIds.length} Follow-up${recordIds.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
