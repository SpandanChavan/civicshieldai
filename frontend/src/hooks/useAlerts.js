import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/supabaseClient';
import { alertsApi } from '@/services/backendApi';
import useAppStore from '@/store/useAppStore';

// Guard: only one realtime channel per page load
let alertsChannel = null;

/**
 * Hook for alert management — list, create, delete, realtime subscription.
 */
export function useAlerts(params = {}) {
  const { setAlerts, addAlert, addNotification } = useAppStore();
  const queryClient = useQueryClient();

  // ── Fetch alerts ───────────────────────────────────
  const { data, isLoading, error } = useQuery({
    queryKey: ['alerts', params],
    queryFn: () => alertsApi.getAll(params),
    staleTime: 30 * 1000,
    retry: 1,
    retryDelay: 3000,
    throwOnError: false,
  });

  useEffect(() => {
    if (data?.data) setAlerts(data.data);
  }, [data, setAlerts]);

  // ── Realtime: new sent alerts ──────────────────────
  useEffect(() => {
    if (alertsChannel) return; // already subscribed
    alertsChannel = supabase
      .channel('alerts-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (payload) => {
        if (payload.new.status === 'sent') {
          addAlert(payload.new);
          addNotification({
            type: 'alert',
            title: `🚨 ${payload.new.title}`,
            severity: payload.new.severity,
            message: payload.new.body,
          });
        }
        queryClient.invalidateQueries({ queryKey: ['alerts'] });
      })
      .subscribe();

    return () => {
      // Only clean up when the last subscriber unmounts (tracked via module-level ref)
      supabase.removeChannel(alertsChannel);
      alertsChannel = null;
    };
  }, [addAlert, addNotification, queryClient]);

  // ── Create alert mutation ──────────────────────────
  const createMutation = useMutation({
    mutationFn: (alertData) => alertsApi.create(alertData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  // ── Delete alert mutation ──────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id) => alertsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  return {
    isLoading,
    error,
    createAlert: createMutation.mutate,
    isCreating: createMutation.isPending,
    deleteAlert: deleteMutation.mutate,
  };
}
