'use client';

import React, { useState, useMemo } from 'react';
import { Upload, X, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';
import { useMailDesk } from '@/context/MailDeskContext';
import { parseBulkContacts } from '@/lib/parser';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BulkImportModal({ isOpen, onClose }: BulkImportModalProps) {
  const { importContacts, outreachRecords, selectedDateId, dateGroups } = useMailDesk();
  const [rawText, setRawText] = useState('');

  const targetGroupId = selectedDateId === 'all' ? dateGroups[0]?.id : selectedDateId;
  const existingEmails = useMemo(
    () =>
      outreachRecords
        .filter(record => record.date_group_id === targetGroupId)
        .map(record => record.contact.email),
    [outreachRecords, targetGroupId]
  );

  // Live preview parsing as user types/pastes
  const parseResult = useMemo(() => {
    if (!rawText.trim()) return null;
    return parseBulkContacts(rawText, existingEmails);
  }, [rawText, existingEmails]);

  if (!isOpen) return null;

  const handleImport = () => {
    if (!rawText.trim()) return;
    const res = importContacts(rawText, targetGroupId);
    if (res.valid.length > 0) {
      setRawText('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Bulk Import Contact Emails</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Instructions */}
        <div className="flex items-start gap-2 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 p-3 text-xs text-blue-700 dark:text-blue-300">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            Paste addresses separated by <strong>newlines</strong>, <strong>commas</strong>, <strong>semicolons</strong>, or <strong>tabs</strong>.
            Supports spreadsheet copy-paste and <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded font-mono">"Name" &lt;email@company.com&gt;</code> syntax.
          </div>
        </div>

        {/* Textarea */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Paste email list or raw tabular data:</label>
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            rows={7}
            placeholder={`alex@stripe.com\nsam@openai.com, hr@google.com\n"David Miller" <david@linear.app>; priya@anthropic.com`}
            className="w-full rounded-md border border-input bg-background p-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Live Validation Bar */}
        {parseResult && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 text-xs">
            <div className="flex items-center gap-4 font-medium">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="h-4 w-4" />
                {parseResult.valid.length} Valid
              </span>
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                {parseResult.duplicates.length} Duplicates (skipped)
              </span>
              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                <XCircle className="h-4 w-4" />
                {parseResult.invalid.length} Invalid
              </span>
            </div>

            {/* Quick Preview of Parsed Contacts */}
            {parseResult.valid.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded border border-border bg-card p-2 space-y-1">
                {parseResult.valid.slice(0, 10).map((v, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-mono text-foreground">{v.email}</span>
                    {v.name && <span className="italic">{v.name}</span>}
                  </div>
                ))}
                {parseResult.valid.length > 10 && (
                  <div className="text-[10px] text-muted-foreground italic text-center pt-1">
                    + {parseResult.valid.length - 10} more addresses ready to import
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!parseResult || parseResult.valid.length === 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Import {parseResult ? `${parseResult.valid.length} Contacts` : 'Contacts'}
          </button>
        </div>
      </div>
    </div>
  );
}
