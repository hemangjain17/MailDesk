'use client';

import React from 'react';
import { Mail, X, Check, Paperclip, AlertTriangle } from 'lucide-react';
import { OutreachRecord } from '@/types';
import { renderEmailBodyTemplate, renderTemplate } from '@/lib/template';
import { useMailDesk } from '@/context/MailDeskContext';
import { normalizeTemplateHtml, sanitizeEmailHtml } from '@/lib/email-html';

interface EmailPreviewModalProps {
  record: OutreachRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EmailPreviewModal({ record, isOpen, onClose }: EmailPreviewModalProps) {
  const { profile, templates } = useMailDesk();

  if (!isOpen || !record) return null;

  const template = record.template || templates[0];

  const renderedSubj = renderTemplate(record.subject_override || template.subject, {
    recipient_name: record.contact.name || '',
    company: record.company_override || record.contact.company || '',
    position: record.position_override || record.contact.position || '',
    sender_name: profile.full_name || '',
    portfolio_url: profile.portfolio_url || '',
    linkedin_url: profile.linkedin_url || '',
    job_link: record.job_link || '',
  });

  const renderedBody = renderEmailBodyTemplate(record.body_override || template.body, {
    recipient_name: record.contact.name || '',
    company: record.company_override || record.contact.company || '',
    position: record.position_override || record.contact.position || '',
    sender_name: profile.full_name || '',
    portfolio_url: profile.portfolio_url || '',
    linkedin_url: profile.linkedin_url || '',
    job_link: record.job_link || '',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Email Preview</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Unresolved placeholder warning */}
        {(renderedSubj.hasUnresolvedPlaceholders || renderedBody.hasUnresolvedPlaceholders) && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-200 border border-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <div>Contains unresolved placeholders: please ensure Company or Position is filled before sending.</div>
          </div>
        )}

        <div className="space-y-3 text-xs">
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
            <div>
              <span className="font-semibold text-muted-foreground">To: </span>
              <span className="text-foreground font-medium">
                {record.contact.name ? `${record.contact.name} <${record.contact.email}>` : record.contact.email}
              </span>
            </div>
            <div>
              <span className="font-semibold text-muted-foreground">Company: </span>
              <span className="text-foreground">{record.company_override || record.contact.company || '—'}</span>
            </div>
            <div>
              <span className="font-semibold text-muted-foreground">Position: </span>
              <span className="text-foreground">{record.position_override || record.contact.position || '—'}</span>
            </div>
            <div>
              <span className="font-semibold text-muted-foreground">Subject: </span>
              <span className="font-bold text-foreground">{renderedSubj.renderedText}</span>
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">Message Body:</label>
            <div
              className="email-rich-content rounded-md border border-border bg-background p-4 font-sans text-xs text-foreground leading-relaxed"
              dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(normalizeTemplateHtml(renderedBody.renderedText)) }}
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5" />
            <span>Attachment: Resume_FullStack_Hemang.pdf (Default Resume)</span>
          </div>
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <button
            onClick={onClose}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}
