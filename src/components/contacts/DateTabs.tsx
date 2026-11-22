'use client';

import React, { useState } from 'react';
import { Calendar, Plus, Layers } from 'lucide-react';
import { useMailDesk } from '@/context/MailDeskContext';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export function DateTabs() {
  const { dateGroups, selectedDateId, setSelectedDateId, addDateGroup, outreachRecords } = useMailDesk();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newDateVal, setNewDateVal] = useState(format(new Date(), 'yyyy-MM-dd'));

  const handleCreateDate = () => {
    if (!newDateVal) return;
    addDateGroup(newDateVal);
    setShowDatePicker(false);
  };

  // Compute live count for each date tab
  const getCountForGroup = (groupId: string) => {
    return outreachRecords.filter(r => r.date_group_id === groupId).length;
  };

  const totalAllCount = new Set(
    outreachRecords.map(record => record.contact.email.trim().toLowerCase()).filter(Boolean)
  ).size;

  return (
    <div className="flex items-center gap-1.5 border-b border-border bg-card/60 px-4 py-2 overflow-x-auto text-xs select-none">
      <div className="flex items-center gap-1 text-muted-foreground mr-2 font-medium">
        <Calendar className="h-3.5 w-3.5" />
        <span>Dates:</span>
      </div>

      {/* All Dates Tab */}
      <button
        onClick={() => setSelectedDateId('all')}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all',
          selectedDateId === 'all'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <Layers className="h-3 w-3" />
        <span>All Dates</span>
        <span
          className={cn(
            'rounded-full px-1.5 py-0.2 text-[10px]',
            selectedDateId === 'all' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background text-muted-foreground'
          )}
        >
          {totalAllCount}
        </span>
      </button>

      {/* Specific Date Tabs */}
      {dateGroups.map(dg => {
        const count = getCountForGroup(dg.id);
        const isSelected = selectedDateId === dg.id;

        return (
          <button
            key={dg.id}
            onClick={() => setSelectedDateId(dg.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all whitespace-nowrap',
              isSelected
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <span>{dg.label || dg.group_date}</span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.2 text-[10px]',
                isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background text-muted-foreground'
              )}
            >
              {count}
            </span>
          </button>
        );
      })}

      {/* Add New Date Button / Picker */}
      <div className="relative">
        {!showDatePicker ? (
          <button
            onClick={() => setShowDatePicker(true)}
            className="flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            title="Create organizational date tab"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Date</span>
          </button>
        ) : (
          <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1 shadow-md">
            <input
              type="date"
              value={newDateVal}
              onChange={e => setNewDateVal(e.target.value)}
              className="rounded border border-input bg-background px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleCreateDate}
              className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground font-medium hover:bg-primary/90"
            >
              Add
            </button>
            <button
              onClick={() => setShowDatePicker(false)}
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
