'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  OutreachRecord,
  OutreachStatus,
} from '@/types';
import { useMailDesk } from '@/context/MailDeskContext';
import { formatDateTime } from '@/lib/utils';
import {
  MoreVertical,
  Clock,
  Send,
  Trash2,
  Copy,
  Eye,
  CheckCircle,
  Calendar,
  AlertCircle,
  FileEdit,
  FolderInput,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

interface SpreadsheetTableProps {
  records: OutreachRecord[];
  onOpenSchedule: (recordIds: string[]) => void;
  onOpenPreview: (record: OutreachRecord) => void;
}

export function SpreadsheetTable({
  records,
  onOpenSchedule,
  onOpenPreview,
}: SpreadsheetTableProps) {
  const {
    updateOutreachRecord,
    updateContact,
    batchUpdateRecords,
    deleteOutreachRecords,
    duplicateOutreachRecord,
    sendNowRecords,
    templates,
    dateGroups,
  } = useMailDesk();

  // Selection states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // Send Now Confirmation Modal State (asks for follow-up reminders)
  const [sendConfirm, setSendConfirm] = useState<{
    isOpen: boolean;
    recordIds: string[];
    enableFollowup: boolean;
    followupDays: number;
  } | null>(null);

  // In-place Cell Editing State
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    field: string;
    value: string;
  } | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    targetRecordIds: string[];
    primaryRecord: OutreachRecord;
  } | null>(null);

  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Row selection handler supporting Shift-click
  const handleRowSelect = (recordId: string, index: number, event: React.MouseEvent) => {
    if (event.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const rangeIds = records.slice(start, end + 1).map(r => r.id);
      setSelectedIds(prev => Array.from(new Set([...prev, ...rangeIds])));
    } else {
      setSelectedIds(prev =>
        prev.includes(recordId) ? prev.filter(id => id !== recordId) : [...prev, recordId]
      );
      setLastClickedIndex(index);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(records.map(r => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  // Right-click Context Menu
  const handleContextMenu = (e: React.MouseEvent, record: OutreachRecord) => {
    e.preventDefault();
    e.stopPropagation();

    // If right clicked row is part of existing selection, target all selected.
    // If not, target only this row and select it.
    let targetIds: string[];
    if (selectedIds.includes(record.id)) {
      targetIds = selectedIds;
    } else {
      targetIds = [record.id];
      setSelectedIds([record.id]);
    }

    setContextMenu({
      visible: true,
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 340),
      targetRecordIds: targetIds,
      primaryRecord: record,
    });
  };

  // Cell Edit Actions
  const handleCellBlur = () => {
    if (!editingCell) return;
    const { rowId, field, value } = editingCell;
    const rec = records.find(r => r.id === rowId);
    if (rec) {
      if (field === 'name' || field === 'email') {
        updateContact(rec.contact_id, { [field]: value });
      } else if (field === 'company') {
        updateOutreachRecord(rowId, { company_override: value });
        updateContact(rec.contact_id, { company: value });
      } else if (field === 'position') {
        updateOutreachRecord(rowId, { position_override: value });
        updateContact(rec.contact_id, { position: value });
      } else if (field === 'subject') {
        updateOutreachRecord(rowId, { subject_override: value });
      } else if (field === 'notes') {
        updateContact(rec.contact_id, { notes: value });
      }
    }
    setEditingCell(null);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCellBlur();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  // Badge Color Styles
  const getStatusBadge = (status: OutreachStatus) => {
    switch (status) {
      case 'Draft':
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300';
      case 'Scheduled':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-300';
      case 'Sending':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-300 animate-pulse';
      case 'Sent':
        return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 border-cyan-300';
      case 'Replied':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300';
      case 'Follow-up Due':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-300';
      case 'Failed':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-300';
      case 'Closed':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 border-gray-300';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden select-text">
      {/* Table Container */}
      <div className="flex-1 overflow-auto border-t border-border">
        <table className="w-full border-collapse text-left text-xs">
          {/* Sticky Header */}
          <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur-sm border-b border-border text-muted-foreground font-semibold">
            <tr>
              <th className="w-10 min-w-[40px] px-3 py-2 sticky left-0 z-30 bg-card border-r border-border shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                <input
                  type="checkbox"
                  checked={records.length > 0 && selectedIds.length === records.length}
                  onChange={handleSelectAll}
                  className="rounded border-input text-primary focus:ring-primary cursor-pointer"
                />
              </th>
              <th className="min-w-[120px] px-3 py-2 border-r border-border">Recipient Name</th>
              <th className="min-w-[150px] px-3 py-2 border-r border-border">Email Address</th>
              <th className="min-w-[100px] px-3 py-2 border-r border-border">Company</th>
              <th className="min-w-[110px] px-3 py-2 border-r border-border">Position</th>
              <th className="min-w-[130px] px-3 py-2 border-r border-border">Template</th>
              <th className="min-w-[160px] px-3 py-2 border-r border-border">Subject</th>
              <th className="min-w-[90px] px-3 py-2 border-r border-border">Status</th>
              <th className="min-w-[115px] px-3 py-2 border-r border-border">Scheduled For</th>
              <th className="min-w-[115px] px-3 py-2 border-r border-border">Sent At</th>
              <th className="min-w-[95px] px-3 py-2 border-r border-border">Last Reply</th>
              <th className="min-w-[100px] px-3 py-2 border-r border-border">Notes</th>
              <th className="w-10 min-w-[40px] px-2 py-2 text-center">Actions</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-border bg-card">
            {records.length === 0 ? (
              <tr>
                <td colSpan={13} className="py-12 text-center text-sm text-muted-foreground">
                  No outreach records in this view. Click <strong>Add Emails</strong> or <strong>+ New Row</strong> to start.
                </td>
              </tr>
            ) : (
              records.map((rec, index) => {
                const isSelected = selectedIds.includes(rec.id);

                return (
                  <tr
                    key={rec.id}
                    onContextMenu={e => handleContextMenu(e, rec)}
                    className={`group transition-colors cursor-default ${
                      isSelected
                        ? 'bg-blue-50/60 dark:bg-blue-950/40'
                        : 'hover:bg-muted/40'
                    }`}
                  >
                    {/* Select Checkbox */}
                    <td
                      onClick={e => e.stopPropagation()}
                      className={`w-10 min-w-[40px] px-3 py-1.5 sticky left-0 z-10 border-r border-border shadow-[2px_0_4px_rgba(0,0,0,0.04)] ${
                        isSelected ? 'bg-blue-50/90 dark:bg-blue-950/90' : 'bg-card group-hover:bg-muted/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => handleRowSelect(rec.id, index, e as any)}
                        className="rounded border-input text-primary focus:ring-primary cursor-pointer"
                      />
                    </td>

                    {/* Name */}
                    <td
                      onDoubleClick={() =>
                        setEditingCell({ rowId: rec.id, field: 'name', value: rec.contact.name || '' })
                      }
                      className="px-3 py-1.5 border-r border-border text-foreground font-medium truncate max-w-[160px]"
                    >
                      {editingCell?.rowId === rec.id && editingCell.field === 'name' ? (
                        <input
                          autoFocus
                          value={editingCell.value}
                          onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
                          onBlur={handleCellBlur}
                          onKeyDown={handleCellKeyDown}
                          className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
                        />
                      ) : (
                        rec.contact.name || <span className="text-muted-foreground/50 italic">Add name</span>
                      )}
                    </td>

                    {/* Email */}
                    <td
                      onDoubleClick={() =>
                        setEditingCell({ rowId: rec.id, field: 'email', value: rec.contact.email })
                      }
                      className="px-3 py-1.5 border-r border-border font-mono text-[11px] text-foreground truncate max-w-[200px]"
                    >
                      {editingCell?.rowId === rec.id && editingCell.field === 'email' ? (
                        <input
                          autoFocus
                          value={editingCell.value}
                          onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
                          onBlur={handleCellBlur}
                          onKeyDown={handleCellKeyDown}
                          className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
                        />
                      ) : (
                        rec.contact.email
                      )}
                    </td>

                    {/* Company */}
                    <td
                      onDoubleClick={() =>
                        setEditingCell({
                          rowId: rec.id,
                          field: 'company',
                          value: rec.company_override || rec.contact.company || '',
                        })
                      }
                      className="px-3 py-1.5 border-r border-border text-foreground truncate max-w-[140px]"
                    >
                      {editingCell?.rowId === rec.id && editingCell.field === 'company' ? (
                        <input
                          autoFocus
                          value={editingCell.value}
                          onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
                          onBlur={handleCellBlur}
                          onKeyDown={handleCellKeyDown}
                          className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
                        />
                      ) : (
                        rec.company_override || rec.contact.company || (
                          <span className="text-muted-foreground/50 italic">Set company</span>
                        )
                      )}
                    </td>

                    {/* Position */}
                    <td
                      onDoubleClick={() =>
                        setEditingCell({
                          rowId: rec.id,
                          field: 'position',
                          value: rec.position_override || rec.contact.position || '',
                        })
                      }
                      className="px-3 py-1.5 border-r border-border text-foreground truncate max-w-[160px]"
                    >
                      {editingCell?.rowId === rec.id && editingCell.field === 'position' ? (
                        <input
                          autoFocus
                          value={editingCell.value}
                          onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
                          onBlur={handleCellBlur}
                          onKeyDown={handleCellKeyDown}
                          className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
                        />
                      ) : (
                        rec.position_override || rec.contact.position || (
                          <span className="text-muted-foreground/50 italic">Set position</span>
                        )
                      )}
                    </td>

                    {/* Template Dropdown */}
                    <td className="px-2 py-1 border-r border-border">
                      <select
                        value={rec.template_id || ''}
                        onChange={e => {
                          const chosenTmpl = templates.find(t => t.id === e.target.value);
                          updateOutreachRecord(rec.id, {
                            template_id: e.target.value,
                            template: chosenTmpl,
                          });
                        }}
                        className="w-full truncate rounded border border-transparent hover:border-input bg-transparent px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                      >
                        {templates.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Subject */}
                    <td
                      onDoubleClick={() =>
                        setEditingCell({
                          rowId: rec.id,
                          field: 'subject',
                          value: rec.subject_override || rec.template?.subject || '',
                        })
                      }
                      className="px-3 py-1.5 border-r border-border text-foreground truncate max-w-[220px]"
                    >
                      {editingCell?.rowId === rec.id && editingCell.field === 'subject' ? (
                        <input
                          autoFocus
                          value={editingCell.value}
                          onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
                          onBlur={handleCellBlur}
                          onKeyDown={handleCellKeyDown}
                          className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
                        />
                      ) : (
                        rec.subject_override || rec.template?.subject || '—'
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="px-3 py-1.5 border-r border-border">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${getStatusBadge(
                          rec.current_status
                        )}`}
                      >
                        {rec.current_status}
                      </span>
                    </td>

                    {/* Scheduled For */}
                    <td className="px-3 py-1.5 border-r border-border text-muted-foreground text-[11px] truncate">
                      {formatDateTime(rec.scheduled_send_at)}
                    </td>

                    {/* Sent At */}
                    <td className="px-3 py-1.5 border-r border-border text-muted-foreground text-[11px] truncate">
                      {formatDateTime(rec.sent_at)}
                    </td>

                    {/* Last Reply */}
                    <td className="px-3 py-1.5 border-r border-border text-[11px] truncate">
                      {rec.last_reply_at ? (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatDateTime(rec.last_reply_at)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Notes */}
                    <td
                      onDoubleClick={() =>
                        setEditingCell({ rowId: rec.id, field: 'notes', value: rec.contact.notes || '' })
                      }
                      className="px-3 py-1.5 border-r border-border text-muted-foreground truncate max-w-[180px]"
                    >
                      {editingCell?.rowId === rec.id && editingCell.field === 'notes' ? (
                        <input
                          autoFocus
                          value={editingCell.value}
                          onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
                          onBlur={handleCellBlur}
                          onKeyDown={handleCellKeyDown}
                          className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
                        />
                      ) : (
                        rec.contact.notes || <span className="text-muted-foreground/30 italic">—</span>
                      )}
                    </td>

                    {/* Actions button */}
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={e => handleContextMenu(e, rec)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Fixed Action Toolbar for Multi-Row Selection */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-border bg-card/95 backdrop-blur-md px-4 py-2 shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
            {selectedIds.length} Selected
          </span>

          <div className="h-4 w-[1px] bg-border mx-1" />

          <button
            onClick={() => onOpenSchedule(selectedIds)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            <Clock className="h-3.5 w-3.5" />
            Schedule
          </button>

          <button
            onClick={() =>
              setSendConfirm({
                isOpen: true,
                recordIds: selectedIds,
                enableFollowup: true,
                followupDays: 5,
              })
            }
            className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            Send Now
          </button>

          <button
            onClick={() => deleteOutreachRecords(selectedIds)}
            className="flex items-center gap-1 rounded-full p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            title="Delete selected rows"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => setSelectedIds([])}
            className="text-xs text-muted-foreground hover:underline ml-1"
          >
            Clear
          </button>
        </div>
      )}

      {/* Right-Click Context Menu Popup */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 w-56 rounded-lg border border-border bg-card p-1 text-xs shadow-2xl animate-in fade-in zoom-in-95"
        >
          <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground border-b border-border mb-1">
            Actions for {contextMenu.targetRecordIds.length} Row{contextMenu.targetRecordIds.length > 1 ? 's' : ''}
          </div>

          <button
            onClick={() => {
              onOpenSchedule(contextMenu.targetRecordIds);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-foreground hover:bg-primary/10 hover:text-primary transition-colors text-left"
          >
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>Schedule Email...</span>
          </button>

          <button
            onClick={() => {
              setSendConfirm({
                isOpen: true,
                recordIds: contextMenu.targetRecordIds,
                enableFollowup: true,
                followupDays: 5,
              });
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-foreground hover:bg-primary/10 hover:text-primary transition-colors text-left"
          >
            <Send className="h-3.5 w-3.5 text-blue-500" />
            <span>Send Now (Gmail)</span>
          </button>

          <button
            onClick={() => {
              onOpenPreview(contextMenu.primaryRecord);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-foreground hover:bg-muted transition-colors text-left"
          >
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            <span>View Email Preview</span>
          </button>

          <div className="h-[1px] bg-border my-1" />

          {/* Change Template submenu / action */}
          <button
            onClick={() => {
              const tmpl = prompt('Enter Template ID or select in table:');
              if (tmpl) {
                batchUpdateRecords(contextMenu.targetRecordIds, { template_id: tmpl });
              }
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-foreground hover:bg-muted transition-colors text-left"
          >
            <FileEdit className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Change Email Template</span>
          </button>

          <button
            onClick={() => {
              const pos = prompt('Apply new Position to selected rows:');
              if (pos) {
                batchUpdateRecords(contextMenu.targetRecordIds, { position_override: pos });
              }
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-foreground hover:bg-muted transition-colors text-left"
          >
            <FileEdit className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Change Position</span>
          </button>

          <button
            onClick={() => {
              const comp = prompt('Apply new Company to selected rows:');
              if (comp) {
                batchUpdateRecords(contextMenu.targetRecordIds, { company_override: comp });
              }
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-foreground hover:bg-muted transition-colors text-left"
          >
            <FileEdit className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Change Company</span>
          </button>

          <button
            onClick={() => {
              batchUpdateRecords(contextMenu.targetRecordIds, { current_status: 'Sent' });
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-foreground hover:bg-muted transition-colors text-left"
          >
            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
            <span>Mark as Contacted</span>
          </button>

          {/* Move to Date Tab */}
          <button
            onClick={() => {
              const chosenDateGroup = dateGroups[0]?.id;
              if (chosenDateGroup) {
                batchUpdateRecords(contextMenu.targetRecordIds, { date_group_id: chosenDateGroup });
                toast.success('Moved to date tab.');
              }
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-foreground hover:bg-muted transition-colors text-left"
          >
            <FolderInput className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Move to Date Tab</span>
          </button>

          <button
            onClick={() => {
              duplicateOutreachRecord(contextMenu.primaryRecord.id);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-foreground hover:bg-muted transition-colors text-left"
          >
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Duplicate Row</span>
          </button>

          <div className="h-[1px] bg-border my-1" />

          <button
            onClick={() => {
              deleteOutreachRecords(contextMenu.targetRecordIds);
              setSelectedIds([]);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors text-left font-medium"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete Selected Rows</span>
          </button>
        </div>
      )}

      {/* Send Now Confirmation Modal (asks for dynamic follow-ups) */}
      {sendConfirm && sendConfirm.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Send {sendConfirm.recordIds.length} Outreach Email{sendConfirm.recordIds.length > 1 ? 's' : ''} Now?
                </h3>
              </div>
              <button
                onClick={() => setSendConfirm(null)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              These messages will be rendered from their assigned templates and sent immediately via your connected Gmail API account.
            </p>

            {/* Dynamic Follow-up Prompt */}
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendConfirm.enableFollowup}
                  onChange={e => setSendConfirm({ ...sendConfirm, enableFollowup: e.target.checked })}
                  className="rounded border-input text-primary focus:ring-primary cursor-pointer"
                />
                <span className="text-xs font-medium text-foreground">Enable dynamic follow-up reminders</span>
              </label>
              {sendConfirm.enableFollowup && (
                <div className="flex items-center gap-2 pl-6">
                  <span className="text-xs text-muted-foreground">Remind after</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={sendConfirm.followupDays}
                    onChange={e => setSendConfirm({ ...sendConfirm, followupDays: Number(e.target.value) })}
                    className="w-14 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-center font-semibold"
                  />
                  <span className="text-xs text-muted-foreground">business days (if no reply)</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => setSendConfirm(null)}
                className="rounded-md border border-border px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const ids = sendConfirm.recordIds;
                  const days = sendConfirm.enableFollowup ? sendConfirm.followupDays : null;
                  setSendConfirm(null);
                  await sendNowRecords(ids, { followupDays: days });
                  setSelectedIds([]);
                }}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Confirm & Send via Gmail</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
