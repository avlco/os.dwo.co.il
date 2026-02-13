import { useEffect, useRef, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = 'lastMailSyncGlobal';

export function useMailSync() {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const intervalRef = useRef(null);

  // Check if Google integration is active (mail sync requires Google connection)
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

  const syncMail = useCallback(async () => {
    if (!isGoogleConnected || isSyncingRef.current) return;

    // Check if enough time has passed since last sync
    const lastSync = localStorage.getItem(STORAGE_KEY);
    if (lastSync) {
      const elapsed = Date.now() - parseInt(lastSync);
      if (elapsed < SYNC_INTERVAL_MS - 10000) return; // Allow 10s tolerance
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      console.log('[MailSync] Background sync starting...');
      const result = await base44.functions.invoke('processIncomingMail', {});
      const data = result?.data || result;
      const synced = data?.synced || 0;

      localStorage.setItem(STORAGE_KEY, Date.now().toString());

      if (synced > 0) {
        console.log(`[MailSync] Background sync: ${synced} new mails`);
        // Invalidate mail-related queries
        queryClient.invalidateQueries({ queryKey: ['mails'] });
        queryClient.invalidateQueries({ queryKey: ['mail-list'] });
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      }
    } catch (err) {
      console.error('[MailSync] Background sync failed:', err.message);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [isGoogleConnected, queryClient]);

  const syncMailRef = useRef(syncMail);
  syncMailRef.current = syncMail;

  useEffect(() => {
    if (!isGoogleConnected) return;

    // Initial sync after 5 seconds (give the app time to load)
    const initialTimeout = setTimeout(() => {
      syncMailRef.current();
    }, 5000);

    // Periodic sync
    intervalRef.current = setInterval(() => {
      syncMailRef.current();
    }, SYNC_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isGoogleConnected]);

  return { isSyncing, isGoogleConnected };
}
