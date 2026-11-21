'use client';

import React, { useState, useMemo } from 'react';
import { DateTabs } from '@/components/contacts/DateTabs';
import { SpreadsheetTable } from '@/components/contacts/SpreadsheetTable';
import { BulkImportModal } from '@/components/contacts/BulkImportModal';
import { ScheduleModal } from '@/components/contacts/ScheduleModal';
import { EmailPreviewModal } from '@/components/contacts/EmailPreviewModal';
import { useMailDesk } from '@/context/MailDeskContext';
import { OutreachRecord, OutreachStatus } from '@/types';
import { Plus, Upload, Search, Filter } from 'lucide-react';

export default function ContactsPage() {
  const { outreachRecords, selectedDateId, addSingleRow } = useMailDesk();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [scheduleModalState, setScheduleModalState] = useState<{
    isOpen: boolean;
    recordIds: string[];
  }>({ isOpen: false, recordIds: [] });

  const [previewRecord, setPreviewRecord] = useState<OutreachRecord | null>(null);

  // Filter records by Date Tab, Search query, and Status
  const filteredRecords = useMemo(() => {
    return outreachRecords.filter(rec => {
      // Date tab filter
      if (selectedDateId !== 'all' && rec.date_group_id !== selectedDateId) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'all' && rec.current_status !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = rec.contact.name?.toLowerCase().includes(q);
        const emailMatch = rec.contact.email.toLowerCase().includes(q);
        const companyMatch = (rec.company_override || rec.contact.company || '').toLowerCase().includes(q);
        const positionMatch = (rec.position_override || rec.contact.position || '').toLowerCase().includes(q);
        const notesMatch = rec.contact.notes.toLowerCase().includes(q);
        return nameMatch || emailMatch || companyMatch || positionMatch || notesMatch;
      }

      return true;
    });
  }, [outreachRecords, selectedDateId, statusFilter, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-background select-none">
      {/* 1. Date Tabs */}
      <DateTabs />

      {/* 2. Controls Bar (Search, Status Filter, Action Buttons) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          {/* Search Box */}
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search name, email, company, position..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Sent">Sent</option>
              <option value="Replied">Replied</option>
              <option value="Follow-up Due">Follow-up Due</option>
              <option value="Failed">Failed</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => addSingleRow(selectedDateId === 'all' ? undefined : selectedDateId)}
            className="flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5 text-primary" />
            <span>New Row</span>
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Add Emails</span>
          </button>
        </div>
      </div>

      {/* 3. Main Spreadsheet Table */}
      <SpreadsheetTable
        records={filteredRecords}
        onOpenSchedule={recordIds => setScheduleModalState({ isOpen: true, recordIds })}
        onOpenPreview={rec => setPreviewRecord(rec)}
      />

      {/* Modals */}
      <BulkImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      <ScheduleModal
        isOpen={scheduleModalState.isOpen}
        selectedRecordIds={scheduleModalState.recordIds}
        onClose={() => setScheduleModalState({ isOpen: false, recordIds: [] })}
      />

      <EmailPreviewModal
        isOpen={!!previewRecord}
        record={previewRecord}
        onClose={() => setPreviewRecord(null)}
      />
    </div>
  );
}
