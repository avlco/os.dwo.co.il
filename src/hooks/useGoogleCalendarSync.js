import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useGoogleCalendarSync() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const intervalRef = useRef(null);

  // Check if Google integration is active
  const { data: isGoogleConnected = false } = useQuery({
    queryKey: ['google-connected'],
    queryFn: async () => {
      try {
        const connections = await base44.entities.IntegrationConnection.filter({
          provider: 'google',
          is_active: true,
        });
        return connections && connections.length > 0;
      } catch {
        return false;
      }
    },
    staleTime: 1000 * 60 * 5,
  });

  // Push: Create event in Google Calendar (supports events, deadlines, and tasks)
  const syncCreate = useCallback(async (entity, formData) => {
    if (!isGoogleConnected) return;

    try {
      const isEvent = formData.entry_type === 'event';
      const isDeadline = formData.entry_type === 'deadline';
      const isTask = !isEvent && !isDeadline;

      // Determine title
      const title = isEvent
        ? (formData.title || formData.description)
        : isDeadline
          ? formData.description
          : formData.title;

      if (!title) return;

      // Determine timing
      const isAllDay = isEvent ? formData.all_day : true;
      let startDate, durationMinutes;

      if (!isAllDay && formData.start_time) {
        startDate = new Date(`${formData.due_date}T${formData.start_time}:00`);
        const endDate = new Date(`${formData.due_date}T${formData.end_time || formData.start_time}:00`);
        durationMinutes = Math.max(15, (endDate - startDate) / 60000);
      } else {
        startDate = new Date(`${formData.due_date}T09:00:00`);
        durationMinutes = isAllDay ? 1440 : 60; // full day or 1 hour
      }

      // Build attendees
      const attendees = [];
      const clientId = formData.client_id || formData.metadata?.client_id;
      const employeeId = formData.employee_id || formData.metadata?.employee_id;
      if (clientId) attendees.push('client');
      if (employeeId) attendees.push('lawyer');

      const result = await base44.functions.invoke('createCalendarEvent', {
        title,
        description: isEvent ? (formData.metadata?.event_description || formData.description || '') : (formData.description || ''),
        start_date: startDate.toISOString(),
        duration_minutes: durationMinutes,
        case_id: formData.case_id,
        client_id: clientId,
        create_meet_link: formData.create_meet_link || formData.metadata?.create_meet_link || false,
        attendees,
        all_day: isAllDay,
      });

      const resultData = result?.data || result;
      if (resultData?.google_event_id) {
        // Store google_event_id in the entity metadata
        const EntityType = isTask
          ? base44.entities.Task
          : base44.entities.Deadline;

        await EntityType.update(entity.id, {
          metadata: {
            ...(entity.metadata || {}),
            google_event_id: resultData.google_event_id,
            html_link: resultData.htmlLink,
            meet_link: resultData.meetLink,
          },
        });
      }
      return resultData;
    } catch (err) {
      console.error('[GCalSync] Create failed:', err);
    }
  }, [isGoogleConnected]);

  // Push: Update event in Google Calendar
  const syncUpdate = useCallback(async (entity, formData) => {
    if (!isGoogleConnected) return;
    const googleEventId = entity.metadata?.google_event_id;
    if (!googleEventId) return;

    try {
      const isEvent = formData?.entry_type === 'event';
      const title = isEvent
        ? (formData.title || formData.description)
        : (formData?.description || formData?.title || entity.description);

      const isAllDay = isEvent ? formData.all_day : true;
      let startDate = null;
      let durationMinutes = 60;

      if (!isAllDay && formData?.start_time) {
        startDate = new Date(`${formData.due_date}T${formData.start_time}:00`);
        const endDate = new Date(`${formData.due_date}T${formData.end_time || formData.start_time}:00`);
        durationMinutes = Math.max(15, (endDate - startDate) / 60000);
      } else if (formData?.due_date) {
        startDate = new Date(`${formData.due_date}T09:00:00`);
        durationMinutes = isAllDay ? 1440 : 60;
      }

      const attendees = [];
      const clientId = formData?.client_id || formData?.metadata?.client_id;
      const employeeId = formData?.employee_id || formData?.metadata?.employee_id;
      if (clientId) attendees.push('client');
      if (employeeId) attendees.push('lawyer');

      await base44.functions.invoke('updateCalendarEvent', {
        google_event_id: googleEventId,
        title,
        description: isEvent ? (formData?.metadata?.event_description || '') : (formData?.description || entity.description || ''),
        start_date: startDate ? startDate.toISOString() : undefined,
        duration_minutes: durationMinutes,
        case_id: formData?.case_id || entity.case_id,
        client_id: clientId,
        attendees,
        create_meet_link: formData?.create_meet_link || formData?.metadata?.create_meet_link || false,
        all_day: isAllDay,
      });
    } catch (err) {
      console.error('[GCalSync] Update failed:', err);
    }
  }, [isGoogleConnected]);

  // Push: Delete event from Google Calendar
  const syncDelete = useCallback(async (entity) => {
    if (!isGoogleConnected) return;
    const googleEventId = entity.metadata?.google_event_id;
    if (!googleEventId) return;

    try {
      await base44.functions.invoke('deleteCalendarEvent', {
        google_event_id: googleEventId,
      });
    } catch (err) {
      console.error('[GCalSync] Delete failed:', err);
    }
  }, [isGoogleConnected]);

  // Pull: Sync from Google Calendar
  const pullSync = useCallback(async (showToast = false) => {
    if (!isGoogleConnected || isSyncingRef.current) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const result = await base44.functions.invoke('syncGoogleCalendar', {});
      const resultData = result?.data || result;

      // Invalidate queries to refresh calendar display
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });

      if (showToast && resultData) {
        const { created = 0, updated = 0, deleted = 0 } = resultData;
        if (created > 0 || updated > 0 || deleted > 0) {
          toast.success(t('docketing.sync_success'));
        } else {
          toast.success(t('docketing.sync_success'));
        }
      }

      return resultData;
    } catch (err) {
      console.error('[GCalSync] Pull sync failed:', err);
      if (showToast) {
        toast.error(t('docketing.sync_error'));
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [isGoogleConnected, queryClient, t]);

  // Use ref to avoid stale closure in useEffect
  const pullSyncRef = useRef(pullSync);
  pullSyncRef.current = pullSync;

  // Auto-pull on mount and every 5 minutes
  useEffect(() => {
    if (!isGoogleConnected) return;

    // Initial sync after a short delay
    const initialTimeout = setTimeout(() => {
      pullSyncRef.current(false);
    }, 2000);

    // Set up interval
    intervalRef.current = setInterval(() => {
      pullSyncRef.current(false);
    }, SYNC_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isGoogleConnected]);

  return {
    isGoogleConnected,
    isSyncing,
    syncCreate,
    syncUpdate,
    syncDelete,
    pullSync,
  };
}
