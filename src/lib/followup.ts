import { addDays, isWeekend } from 'date-fns';

/**
 * Calculates follow-up due date based on starting date and days.
 * If useBusinessDays is true, skips Saturday and Sunday.
 */
export function calculateFollowupDueDate(
  startDate: Date = new Date(),
  days: number = 5,
  useBusinessDays: boolean = true
): Date {
  let currentDate = new Date(startDate);

  if (!useBusinessDays) {
    return addDays(currentDate, days);
  }

  let added = 0;
  while (added < days) {
    currentDate = addDays(currentDate, 1);
    if (!isWeekend(currentDate)) {
      added++;
    }
  }

  return currentDate;
}

/**
 * Checks whether an outreach record is overdue for follow-up.
 */
export function isFollowupOverdue(dueDate: Date | string): boolean {
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  return new Date().getTime() > due.getTime();
}
