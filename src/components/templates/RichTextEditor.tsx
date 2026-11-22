'use client';

import React, { useEffect, useRef } from 'react';
import { Bold, Italic, Link, List, ListOrdered, RemoveFormatting, Underline } from 'lucide-react';
import { normalizeTemplateHtml, sanitizeEmailHtml } from '@/lib/email-html';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const buttonClass =
  'rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary';

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    const normalized = normalizeTemplateHtml(value);
    if (editor && editor.innerHTML !== normalized) editor.innerHTML = normalized;
  }, [value]);

  const emitChange = () => {
    if (editorRef.current) onChange(sanitizeEmailHtml(editorRef.current.innerHTML));
  };

  const runCommand = (command: string, commandValue?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    emitChange();
  };

  const addLink = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      window.alert('Select the text you want to turn into a link first.');
      return;
    }
    const enteredUrl = window.prompt('Enter a URL (https://...) or a placeholder such as {{portfolio_url}} or {{job_link}}:');
    if (!enteredUrl) return;
    const url = /^(https?:\/\/|mailto:|\{\{)/i.test(enteredUrl) ? enteredUrl : `https://${enteredUrl}`;
    runCommand('createLink', url);
  };

  return (
    <div className="overflow-hidden rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-primary">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 px-2 py-1.5">
        <button type="button" className={buttonClass} onMouseDown={e => e.preventDefault()} onClick={() => runCommand('bold')} title="Bold">
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={buttonClass} onMouseDown={e => e.preventDefault()} onClick={() => runCommand('italic')} title="Italic">
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={buttonClass} onMouseDown={e => e.preventDefault()} onClick={() => runCommand('underline')} title="Underline">
          <Underline className="h-3.5 w-3.5" />
        </button>
        <span className="mx-1 h-5 w-px bg-border" />
        <button type="button" className={buttonClass} onMouseDown={e => e.preventDefault()} onClick={() => runCommand('insertUnorderedList')} title="Bulleted list">
          <List className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={buttonClass} onMouseDown={e => e.preventDefault()} onClick={() => runCommand('insertOrderedList')} title="Numbered list">
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={buttonClass} onMouseDown={e => e.preventDefault()} onClick={addLink} title="Add clickable link">
          <Link className="h-3.5 w-3.5" />
        </button>
        <span className="mx-1 h-5 w-px bg-border" />
        <button type="button" className={buttonClass} onMouseDown={e => e.preventDefault()} onClick={() => runCommand('removeFormat')} title="Clear formatting">
          <RemoveFormatting className="h-3.5 w-3.5" />
        </button>
        <span className="ml-2 text-[10px] text-muted-foreground">Select text, then apply formatting</span>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Email body"
        onInput={emitChange}
        onBlur={emitChange}
        className="email-rich-content min-h-[220px] p-3 text-xs text-foreground focus:outline-none leading-relaxed"
      />
    </div>
  );
}
