import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import CalendarToolbar from './CalendarToolbar';
import MonthView from './MonthView';
import WeekView from './WeekView';
import DayView from './DayView';
import CalendarSidebar from './CalendarSidebar';
import EventDialog from './EventDialog';
import EventPopover from './EventPopover';
import { useCalendarData } from './useCalendarData';

const EMPTY_EVENT_FORM = {
  entry_type: 'event',
  title: '',
  description: '',
  event_type: 'meeting',
  due_date: format(new Date(), 'yyyy-MM-dd'),
  all_day: true,
  start_time: '09:00',
  end_time: '10:00',
  color: 'blue',
  case_id: '',
  location: '',
  attendees: [],
};

const EMPTY_DEADLINE_FORM = {
  entry_type: 'deadline',
  description: '',
  deadline_type: 'custom',
  due_date: format(new Date(), 'yyyy-MM-dd'),
  reminder_date_1: '',
  reminder_date_2: '',
  is_critical: false,
  case_id: '',
  color: 'amber',
};

export default function CalendarPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // View state
  const [viewMode, setViewMode] = useState('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('event');
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(EMPTY_EVENT_FORM);

  // Popover state
  const [popoverItem, setPopoverItem] = useState(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Data
  const { items, cases, isLoading } = useCalendarData();

  // Mutations
  const createDeadline = useMutation({
    mutationFn: (data) => base44.entities.Deadline.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      setDialogOpen(false);
      toast.success(t('docketing.create'));
    },
    onError: (err) => toast.error(err.message),
  });

  const updateDeadline = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Deadline.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      setDialogOpen(false);
      setPopoverOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteDeadline = useMutation({
    mutationFn: (id) => base44.entities.Deadline.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      setPopoverOpen(false);
      setPopoverItem(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const getCaseNumber = useCallback((caseId) => {
    const c = cases.find(c => c.id === caseId);
    return c ? `${c.case_number} - ${c.title}` : '-';
  }, [cases]);

  // Handlers
  const handleNewEvent = () => {
    setEditingItem(null);
    setDialogMode('event');
    setFormData({ ...EMPTY_EVENT_FORM, due_date: format(selectedDate || new Date(), 'yyyy-MM-dd') });
    setDialogOpen(true);
  };

  const handleNewDeadline = () => {
    setEditingItem(null);
    setDialogMode('deadline');
    setFormData({ ...EMPTY_DEADLINE_FORM, due_date: format(selectedDate || new Date(), 'yyyy-MM-dd') });
    setDialogOpen(true);
  };

  const handleEventClick = (item) => {
    if (item.type === 'task') return; // Tasks are handled in Tasks page
    setPopoverItem(item);
    setPopoverOpen(true);
  };

  const handleEditFromPopover = (item) => {
    setPopoverOpen(false);
    const entity = item.originalEntity;
    const isEvent = entity.entry_type === 'event';

    setEditingItem(item);
    setDialogMode(isEvent ? 'event' : 'deadline');

    if (isEvent) {
      setFormData({
        entry_type: 'event',
        title: entity.title || entity.description || '',
        description: entity.description || '',
        event_type: entity.event_type || 'meeting',
        due_date: entity.due_date || '',
        all_day: entity.all_day !== false,
        start_time: entity.start_time || '09:00',
        end_time: entity.end_time || '10:00',
        color: entity.color || 'blue',
        case_id: entity.case_id || '',
        location: entity.location || '',
        attendees: entity.attendees || [],
      });
    } else {
      setFormData({
        entry_type: 'deadline',
        description: entity.description || '',
        deadline_type: entity.deadline_type || 'custom',
        due_date: entity.due_date || '',
        reminder_date_1: entity.reminder_date_1 || '',
        reminder_date_2: entity.reminder_date_2 || '',
        is_critical: entity.is_critical || false,
        case_id: entity.case_id || '',
        color: entity.color || 'amber',
      });
    }

    setDialogOpen(true);
  };

  const handleDeleteFromPopover = (item) => {
    if (!item?.entityId) return;
    deleteDeadline.mutate(item.entityId);
  };

  const handleSubmit = () => {
    const isEvent = dialogMode === 'event';

    let data;
    if (isEvent) {
      data = {
        entry_type: 'event',
        title: formData.title,
        description: formData.description,
        event_type: formData.event_type,
        due_date: formData.due_date,
        all_day: formData.all_day,
        start_time: formData.all_day ? null : formData.start_time,
        end_time: formData.all_day ? null : formData.end_time,
        color: formData.color,
        case_id: formData.case_id || null,
        location: formData.location || null,
        attendees: formData.attendees || [],
        status: 'pending',
      };
    } else {
      data = {
        entry_type: 'deadline',
        description: formData.description,
        deadline_type: formData.deadline_type,
        due_date: formData.due_date,
        reminder_date_1: formData.reminder_date_1 || null,
        reminder_date_2: formData.reminder_date_2 || null,
        is_critical: formData.is_critical || false,
        case_id: formData.case_id || null,
        color: formData.color || 'amber',
        status: 'pending',
      };
    }

    if (editingItem) {
      updateDeadline.mutate({ id: editingItem.entityId, data });
    } else {
      createDeadline.mutate(data);
    }
  };

  const handleDateClick = (date) => {
    setSelectedDate(date);
    if (viewMode === 'month') {
      // Stay in month view, just highlight the date
    }
  };

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setCurrentDate(date);
  };

  const handleTimeSlotClick = (date, minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    setEditingItem(null);
    setDialogMode('event');
    setFormData({
      ...EMPTY_EVENT_FORM,
      due_date: format(date, 'yyyy-MM-dd'),
      all_day: false,
      start_time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      end_time: `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    });
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <CalendarToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          onNewEvent={handleNewEvent}
          onNewDeadline={handleNewDeadline}
        />
        <div className="flex items-center justify-center py-20">
          <p className="text-slate-400 dark:text-slate-500">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CalendarToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        currentDate={currentDate}
        onDateChange={setCurrentDate}
        onNewEvent={handleNewEvent}
        onNewDeadline={handleNewDeadline}
      />

      <div className="flex gap-6">
        {/* Main calendar view */}
        <div className="flex-1 min-w-0">
          {viewMode === 'month' && (
            <MonthView
              currentDate={currentDate}
              items={items}
              selectedDate={selectedDate}
              onDateClick={handleDateClick}
            />
          )}
          {viewMode === 'week' && (
            <WeekView
              currentDate={currentDate}
              items={items}
              onTimeSlotClick={handleTimeSlotClick}
              onEventClick={handleEventClick}
            />
          )}
          {viewMode === 'day' && (
            <DayView
              currentDate={currentDate}
              items={items}
              onTimeSlotClick={handleTimeSlotClick}
              onEventClick={handleEventClick}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="w-[280px] flex-shrink-0 hidden lg:block">
          <CalendarSidebar
            currentDate={currentDate}
            selectedDate={selectedDate}
            items={items}
            onDateSelect={handleDateSelect}
            getCaseNumber={getCaseNumber}
          />
        </div>
      </div>

      {/* Event/Deadline Dialog */}
      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleSubmit}
        isEditing={!!editingItem}
        isSubmitting={createDeadline.isPending || updateDeadline.isPending}
        mode={dialogMode}
      />

      {/* Event Detail Popover */}
      <EventPopover
        item={popoverItem}
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        onEdit={handleEditFromPopover}
        onDelete={handleDeleteFromPopover}
        getCaseNumber={getCaseNumber}
      />
    </div>
  );
}
