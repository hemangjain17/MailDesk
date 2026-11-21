'use client';

import React, { useState } from 'react';
import { useMailDesk } from '@/context/MailDeskContext';
import { EmailTemplate } from '@/types';
import { FileText, Plus, Trash2, Check, Sparkles, Copy } from 'lucide-react';
import { renderTemplate } from '@/lib/template';

export default function TemplatesPage() {
  const { templates, saveTemplate, deleteTemplate, profile } = useMailDesk();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(templates[0]?.id || '');
  const [isEditing, setIsEditing] = useState(false);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];

  const [formState, setFormState] = useState<Partial<EmailTemplate>>({
    name: selectedTemplate?.name || '',
    subject: selectedTemplate?.subject || '',
    body: selectedTemplate?.body || '',
    signature: selectedTemplate?.signature || '',
    is_default: selectedTemplate?.is_default || false,
  });

  const placeholders = [
    { label: 'Recipient Name', tag: '{{recipient_name}}' },
    { label: 'Company', tag: '{{company}}' },
    { label: 'Position', tag: '{{position}}' },
    { label: 'Sender Name', tag: '{{sender_name}}' },
    { label: 'Portfolio URL', tag: '{{portfolio_url}}' },
    { label: 'LinkedIn URL', tag: '{{linkedin_url}}' },
  ];

  const insertPlaceholder = (tag: string) => {
    setFormState(prev => ({
      ...prev,
      body: (prev.body || '') + ' ' + tag,
    }));
  };

  const handleSelectTemplate = (t: EmailTemplate) => {
    setSelectedTemplateId(t.id);
    setFormState({
      name: t.name,
      subject: t.subject,
      body: t.body,
      signature: t.signature,
      is_default: t.is_default,
    });
    setIsEditing(false);
  };

  const handleCreateNew = () => {
    const newTmpl: Partial<EmailTemplate> = {
      name: 'New Custom Template',
      subject: 'Application for {{position}} at {{company}}',
      body: 'Hi {{recipient_name}},\n\nI am reaching out regarding {{position}} at {{company}}.\n\nBest,\n{{sender_name}}',
      signature: profile.default_signature,
      is_default: false,
    };
    saveTemplate(newTmpl);
  };

  const handleSave = () => {
    if (!formState.name?.trim()) return;
    saveTemplate({
      ...formState,
      id: selectedTemplate?.id,
    });
    setIsEditing(false);
  };

  // Sample live preview with mock candidate variables
  const sampleRendered = renderTemplate(formState.body || '', {
    recipient_name: 'Satya Nadella',
    company: 'Microsoft',
    position: 'Principal Platform Engineer',
    sender_name: profile.full_name || 'Hemang Developer',
    portfolio_url: profile.portfolio_url || 'https://hemang.dev',
    linkedin_url: profile.linkedin_url || 'https://linkedin.com/in/hemang',
  });

  return (
    <div className="flex h-full bg-background select-text">
      {/* Left List of Templates */}
      <div className="w-72 md:w-80 border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-foreground text-sm">
            <FileText className="h-4 w-4 text-primary" />
            <span>Templates ({templates.length})</span>
          </div>
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="h-3 w-3" />
            <span>New</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {templates.map(t => (
            <div
              key={t.id}
              onClick={() => handleSelectTemplate(t)}
              className={`p-3.5 cursor-pointer transition-colors ${
                selectedTemplate?.id === t.id ? 'bg-primary/10 border-l-4 border-primary' : 'hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-foreground truncate">{t.name}</span>
                {t.is_default && (
                  <span className="rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-1.5 py-0.2 text-[9px] font-semibold">
                    Default
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground truncate mt-0.5">{t.subject}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Editor & Live Preview */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {selectedTemplate ? (
          <div className="max-w-4xl space-y-5">
            {/* Template Header Actions */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-base font-bold text-foreground">{formState.name}</h2>
                <div className="text-xs text-muted-foreground">
                  Template ID: <span className="font-mono">{selectedTemplate.id}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {templates.length > 1 && (
                  <button
                    onClick={() => deleteTemplate(selectedTemplate.id)}
                    className="rounded p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    title="Delete template"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={handleSave}
                  className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </div>

            {/* Template Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Template Name</label>
                <input
                  type="text"
                  value={formState.name || ''}
                  onChange={e => setFormState({ ...formState, name: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Subject Line</label>
                <input
                  type="text"
                  value={formState.subject || ''}
                  onChange={e => setFormState({ ...formState, subject: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                />
              </div>
            </div>

            {/* Placeholder Pills */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Click to insert placeholder:</label>
              <div className="flex flex-wrap gap-1.5">
                {placeholders.map(p => (
                  <button
                    key={p.tag}
                    type="button"
                    onClick={() => insertPlaceholder(p.tag)}
                    className="rounded-md border border-border bg-muted/60 px-2 py-1 text-[11px] font-mono text-foreground hover:bg-primary/10 hover:border-primary transition-colors"
                  >
                    + {p.tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Body Editor */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Email Body</label>
              <textarea
                rows={9}
                value={formState.body || ''}
                onChange={e => setFormState({ ...formState, body: e.target.value })}
                className="w-full rounded-md border border-input bg-background p-3 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
              />
            </div>

            {/* Live Rendered Preview Box */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Live Preview (interpolated with sample contact):
              </div>
              <pre className="whitespace-pre-wrap rounded-md bg-muted/30 p-4 font-sans text-xs text-foreground leading-relaxed border border-border">
                {sampleRendered.renderedText}
              </pre>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Select a template to view and edit.</div>
        )}
      </div>
    </div>
  );
}
