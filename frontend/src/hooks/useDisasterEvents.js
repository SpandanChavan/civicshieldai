import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { supabase } from '@/services/supabaseClient';
import { eventsApi } from '@/services/backendApi';
import useAppStore from '@/store/useAppStore';

let socket = null;

/**
 * Hook to fetch and subscribe to disaster events.
 * Combines REST fetch + Supabase Realtime + Socket.io for triple redundancy.
 */
export function useDisasterEvents(filters = {}) {
  const { setEvents, addEvent, setEventStats, setConnected, setLastUpdate, addNotification } = useAppStore();
  const queryClient = useQueryClient();

  // ── REST Fetch via TanStack Query ──────────────────
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['events', filters],
    queryFn: () => eventsApi.getAll({ ...filters, mode: 'diverse' }),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
    retryDelay: 3000,
    throwOnError: false,
  });


  useEffect(() => {
    if (data?.data) {
      setEvents(data.data);
      setLastUpdate(new Date());
    }
  }, [data, setEvents, setLastUpdate]);

  // ── Fetch stats ────────────────────────────────────
  const { data: statsData } = useQuery({
    queryKey: ['event-stats'],
    queryFn: () => eventsApi.getStats(),
    staleTime: 2 * 60 * 1000,
    retry: 1,
    throwOnError: false,
  });

  useEffect(() => {
    if (statsData?.data) {
      useAppStore.getState().setEventStats(statsData.data);
    }
  }, [statsData]);

  // ── Supabase Realtime subscription ────────────────
  useEffect(() => {
    const channel = supabase
      .channel('events-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, (payload) => {
        addEvent(payload.new);
        setLastUpdate(new Date());
        addNotification({
          type: 'info',
          title: 'New Event',
          message: payload.new.title,
          severity: payload.new.severity,
        });
        queryClient.invalidateQueries({ queryKey: ['event-stats'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [addEvent, setLastUpdate, addNotification, queryClient]);

  // ── Socket.io for real-time backend pushes ─────────
  useEffect(() => {
    const envUrl = import.meta.env.VITE_BACKEND_URL;
    const backendUrl = (envUrl && envUrl.trim() !== '') ? envUrl : `http://${window.location.hostname}:4000`;
    if (!socket) {
      socket = io(backendUrl, { transports: ['websocket', 'polling'] });
    }

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('events:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['event-stats'] });
    });

    return () => {
      socket?.off('events:updated');
    };
  }, [setConnected, queryClient]);

  return { isLoading, error, refetch };
}
