/**
 * frontend/src/components/sos/SOSStatusBanner.jsx
 *
 * Shows the live status of the citizen's active SOS.
 * Listens for Socket.io events: sos:acknowledged, sos:resolved.
 *
 * Props:
 *   sos:      The SOS object { id, status, created_at, ... }
 *   onCancel: Function to call when citizen cancels the SOS
 */

import { useEffect, useState } from 'react';
import useAppStore from '../../store/useAppStore';
import { socket } from '../../hooks/useDisasterEvents';

// Map status to display config
const STATUS_CONFIG = {
  active: {
    icon:        '📡',
    label:       'SOS Sent — Waiting for coordinator',
    bg:          '#FFF3E0',
    border:      '#FFA726',
    color:       '#E65100',
    description: 'Your SOS has been sent. A coordinator in your area has been notified.',
  },
  acknowledged: {
    icon:        '✅',
    label:       'Help is Coming',
    bg:          '#E8F5E9',
    border:      '#66BB6A',
    color:       '#1B5E20',
    description: 'A coordinator has acknowledged your SOS and is dispatching help.',
  },
  resolved: {
    icon:        '🎉',
    label:       'SOS Resolved',
    bg:          '#E3F2FD',
    border:      '#42A5F5',
    color:       '#0D47A1',
    description: 'Your SOS has been marked as resolved. Stay safe.',
  },
  cancelled: {
    icon:        '❌',
    label:       'SOS Cancelled',
    bg:          '#F5F5F5',
    border:      '#BDBDBD',
    color:       '#424242',
    description: 'Your SOS was cancelled.',
  },
};

export default function SOSStatusBanner({ sos, onCancel }) {
  const [localSos, setLocalSos]   = useState(sos);
  const [etaInfo, setEtaInfo]     = useState(null);
  // Re-sync local state if the prop changes (e.g. on mount/refresh)
  useEffect(() => {
    setLocalSos(sos);
  }, [sos]);

  // ── Listen to Socket.io for real-time status updates ──────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleAcknowledged = (payload) => {
      if (payload.id !== localSos.id) return;
      setLocalSos(prev => ({ ...prev, status: 'acknowledged', acknowledged_at: payload.acknowledged_at }));
      if (payload.eta_minutes) {
        setEtaInfo(`Estimated arrival: ~${payload.eta_minutes} min`);
      }
      if (payload.note) {
        setEtaInfo(prev => `${prev || ''} · "${payload.note}"`);
      }
      useAppStore.getState().setActiveSos({ ...localSos, status: 'acknowledged' });
    };

    const handleResolved = (payload) => {
      if (payload.id !== localSos.id) return;
      setLocalSos(prev => ({ ...prev, status: 'resolved' }));
      useAppStore.getState().setActiveSos({ ...localSos, status: 'resolved' });
    };

    socket.on('sos:acknowledged', handleAcknowledged);
    socket.on('sos:resolved',     handleResolved);

    return () => {
      socket.off('sos:acknowledged', handleAcknowledged);
      socket.off('sos:resolved',     handleResolved);
    };
  }, [localSos, sos]);

  const config  = STATUS_CONFIG[localSos.status] || STATUS_CONFIG.active;
  const canCancel = localSos.status === 'active';
  const isResolved = ['resolved', 'cancelled'].includes(localSos.status);

  return (
    <div style={{
      background:   config.bg,
      border:       `2px solid ${config.border}`,
      borderRadius: '12px',
      padding:      '16px',
      marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span style={{ fontSize: '1.8rem' }}>{config.icon}</span>
        <span style={{ fontWeight: '700', fontSize: '16px', color: config.color }}>
          {config.label}
        </span>
      </div>

      <p style={{ fontSize: '13px', color: '#555', marginBottom: '8px' }}>
        {config.description}
      </p>

      {etaInfo && (
        <p style={{ fontSize: '13px', fontWeight: '600', color: config.color, marginBottom: '8px' }}>
          ⏱ {etaInfo}
        </p>
      )}

      <p style={{ fontSize: '11px', color: '#888' }}>
        SOS sent at: {new Date(localSos.created_at).toLocaleTimeString('en-IN')}
      </p>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        {canCancel && (
          <button
            onClick={onCancel}
            style={{
              padding:      '7px 16px',
              background:   'transparent',
              border:       '1px solid #999',
              borderRadius: '8px',
              fontSize:     '13px',
              color:        '#555',
              cursor:       'pointer',
            }}
          >
            Cancel SOS (False Alarm)
          </button>
        )}
        {isResolved && (
          <button
            onClick={onCancel}  // clears the activeSos from store
            style={{
              padding:      '7px 16px',
              background:   config.border,
              border:       'none',
              borderRadius: '8px',
              fontSize:     '13px',
              color:        '#fff',
              cursor:       'pointer',
            }}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
