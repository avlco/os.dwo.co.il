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

  // Push: Create event in Google Calendar
  const syncCreate = useCallback(async (deadlineEntity, formData) => {
    if (!isGoogleConnected) return;
    if (deadlineEntity.entry_type !== 'event') return;
    if (formData.all_day) return; // Skip all-day events for now

    try {
      const startDate = new Date(`${formData.due_date}T${formData.start_time || '09:00'}:00`);
      const endDate = new Date(`${formData.due_date}T${formData.end_time || '10:00'}:00`);
      const durationMinutes = Math.max(15, (endDate - startDate) / 60000);

      const attendees = [];
      if (formData.client_id) attendees.push('client');
      if (formData.employee_id) attendees.push('lawyer');

      const result = await base44.functions.invoke('createCalendarEvent', {
        title: formData.title,
        description: formData.description,
        start_date: startDate.toISOString(),
        duration_minutes: durationMinutes,
        case_id: formData.case_id,
        client_id: formData.client_id,
        create_meet_link: formData.create_meet_link || false,
        attendees,
      });

      const resultData = result?.data || result;
      if (resultData?.google_event_id) {
        // Store google_event_id in the Deadline entity metadata
        await base44.entities.Deadline.update(deadlineEntity.id, {
          metadata: {
            ...(deadlineEntity.metadata || {}),
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
  const syncUpdate = useCallback(async (deadlineEntity, formData) => {
    if (!isGoogleConnected) return;
    const googleEventId = deadlineEntity.metadata?.google_event_id;
    if (!googleEventId) return;

    try {
      const startDate = formData && !formData.all_day
        ? new Date(`${formData.due_date}T${formData.start_time || '09:00'}:00`)
        : null;
      const endDate = formData && !formData.all_day
        ? new Date(`${formData.due_date}T${formData.end_time || '10:00'}:00`)
        : null;
      const durationMinutes = startDate && endDate
        ? Math.max(15, (endDate - startDate) / 60000)
        : 60;

      const attendees = [];
      if (formData?.client_id) attendees.push('client');
      if (formData?.employee_id) attendees.push('lawyer');

      await base44.functions.invoke('updateCalendarEvent', {
        google_event_id: googleEventId,
        title: formData?.title || deadlineEntity.title,
        description: formData?.description || deadlineEntity.description,
        start_date: startDate ? startDate.toISOString() : undefined,
        duration_minutes: durationMinutes,
        case_id: formData?.case_id || deadlineEntity.case_id,
        client_id: formData?.client_id || deadlineEntity.client_id,
        attendees,
        create_meet_link: formData?.create_meet_link || false,
      });
    } catch (err) {
      console.error('[GCalSync] Update failed:', err);
    }
  }, [isGoogleConnected]);

  // Push: Delete event from Google Calendar
  const syncDelete = useCallback(async (deadlineEntity) => {
    if (!isGoogleConnected) return;
    const googleEventId = deadlineEntity.metadata?.google_event_id;
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
    if (!isGoogleConnected || isSyncing) return;

    setIsSyncing(true);
    try {
      const result = await base44.functions.invoke('syncGoogleCalendar', {});
      const resultData = result?.data || result;

      // Invalidate queries to refresh calendar display
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });

      if (showToast && resultData) {
        const { created = 0, updated = 0, deleted = 0 } = resultData;
        if (created > 0 || updated > 0 || deleted > 0) {
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
      setIsSyncing(false);
    }
  }, [isGoogleConnected, isSyncing, queryClient, t]);

  // Auto-pull on mount and every 5 minutes
  useEffect(() => {
    if (!isGoogleConnected) return;

    // Initial sync
    pullSync(false);

    // Set up interval
    intervalRef.current = setInterval(() => {
      pullSync(false);
    }, SYNC_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isGoogleConnected]); // Only re-run when connection status changes

  return {
    isGoogleConnected,
    isSyncing,
    syncCreate,
    syncUpdate,
    syncDelete,
    pullSync,
  };
}
