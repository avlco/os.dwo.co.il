import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameDay, isWithinInterval, addDays } from 'date-fns';

// Color system for calendar items
export const ITEM_COLORS = {
  red:    { bg: 'bg-rose-100 dark:bg-rose-900/30',    text: 'text-rose-700 dark:text-rose-300',    dot: 'bg-rose-500',    border: 'border-rose-300 dark:border-rose-700',    light: 'bg-rose-50 dark:bg-rose-900/20' },
  amber:  { bg: 'bg-amber-100 dark:bg-amber-900/30',  text: 'text-amber-700 dark:text-amber-300',  dot: 'bg-amber-500',  border: 'border-amber-300 dark:border-amber-700',  light: 'bg-amber-50 dark:bg-amber-900/20' },
  blue:   { bg: 'bg-blue-100 dark:bg-blue-900/30',    text: 'text-blue-700 dark:text-blue-300',    dot: 'bg-blue-500',    border: 'border-blue-300 dark:border-blue-700',    light: 'bg-blue-50 dark:bg-blue-900/20' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500', border: 'border-purple-300 dark:border-purple-700', light: 'bg-purple-50 dark:bg-purple-900/20' },
  green:  { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500', border: 'border-emerald-300 dark:border-emerald-700', light: 'bg-emerald-50 dark:bg-emerald-900/20' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500', border: 'border-orange-300 dark:border-orange-700', light: 'bg-orange-50 dark:bg-orange-900/20' },
};

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

function normalizeDeadline(d) {
  const isEvent = d.entry_type === 'event';
  const allDay = isEvent ? (d.all_day !== false) : true;
  const startDate = new Date(d.due_date + 'T00:00:00');

  let startMinutes = null;
  let endMinutes = null;
  if (!allDay && d.start_time) {
    startMinutes = parseTimeToMinutes(d.start_time);
    endMinutes = d.end_time ? parseTimeToMinutes(d.end_time) : (startMinutes + 60);
  }

  let color = d.color || (isEvent ? 'blue' : (d.is_critical ? 'red' : 'amber'));

  return {
    id: `deadline-${d.id}`,
    entityId: d.id,
    type: isEvent ? 'event' : 'deadline',
    title: isEvent ? (d.metadata?.title || d.title || d.description) : d.description,
    description: isEvent ? d.description : '',
    start: startDate,
    startMinutes,
    endMinutes,
    allDay,
    color,
    caseId: d.case_id,
    status: d.status,
    attendees: d.attendees || [],
    location: d.location || '',
    eventType: d.event_type || d.deadline_type,
    metadata: d.metadata || {},
    originalEntity: d,
  };
}

function normalizeTask(t) {
  if (!t.due_date) return null;
  if (t.status === 'completed' || t.status === 'cancelled') return null;

  return {
    id: `task-${t.id}`,
    entityId: t.id,
    type: 'task',
    title: t.title,
    description: t.description || '',
    start: new Date(t.due_date + 'T00:00:00'),
    startMinutes: null,
    endMinutes: null,
    allDay: true,
    color: 'green',
    caseId: t.case_id,
    status: t.status,
    priority: t.priority,
    assignedTo: t.assigned_to || [],
    originalEntity: t,
  };
}

export function useCalendarData() {
  const { data: deadlines = [], isLoading: deadlinesLoading } = useQuery({
    queryKey: ['deadlines'],
    queryFn: () => base44.entities.Deadline.list('-due_date', 500),
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-created_date', 500),
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
  });

  const items = useMemo(() => {
    const normalized = [];

    for (const d of deadlines) {
      if (d.due_date) {
        normalized.push(normalizeDeadline(d));
      }
    }

    for (const t of tasks) {
      const item = normalizeTask(t);
      if (item) normalized.push(item);
    }

    return normalized;
  }, [deadlines, tasks]);

  const isLoading = deadlinesLoading || tasksLoading;

  return { items, cases, deadlines, tasks, isLoading };
}

// Get items for a specific date
export function getItemsForDate(items, date) {
  return items.filter(item => isSameDay(item.start, date));
}

// Get items for a date range (used by week/day views)
export function getItemsForRange(items, startDate, endDate) {
  return items.filter(item =>
    isWithinInterval(item.start, { start: startDate, end: endDate })
  );
}

// Get the grid of days for a month view
export function getMonthGrid(date) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = [];
  let current = gridStart;
  while (current <= gridEnd) {
    days.push(new Date(current));
    current = addDays(current, 1);
  }
  return days;
}
