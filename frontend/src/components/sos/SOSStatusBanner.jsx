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
import { Radio, CheckCircle2, CheckCircle, XCircle, Clock } from 'lucide-react';

const STATUS_CONFIG = {
  active: {
    icon:        Radio,
    label:       'SOS Sent — Waiting for coordinator',
    bg:          'rgba(245, 158, 11, 0.1)',
    border:      'rgba(245, 158, 11, 0.4)',
    color:       '#fcd34d',
    description: 'Your SOS has been sent. A coordinator in your area has been notified.',
  },
  acknowledged: {
    icon:        CheckCircle2,
    label:       'Help is Coming',
    bg:          'rgba(52, 211, 153, 0.1)',
    border:      'rgba(52, 211, 153, 0.4)',
    color:       '#6ee7b7',
    description: 'A coordinator has acknowledged your SOS and is dispatching help.',
  },
  resolved: {
    icon:        CheckCircle,
    label:       'SOS Resolved',
    bg:          'rgba(56, 189, 248, 0.1)',
    border:      'rgba(56, 189, 248, 0.4)',
    color:       '#7dd3fc',
    description: 'Your SOS has been marked as resolved. Stay safe.',
  },
  cancelled: {
    icon:        XCircle,
    label:       'SOS Cancelled',
    bg:          'rgba(255, 255, 255, 0.05)',
    border:      'rgba(255, 255, 255, 0.2)',
    color:       '#bdc8d1',
    description: 'Your SOS was cancelled.',
  },
};

export default function SOSStatusBanner({ sos, onCancel }) {
  const [localSos, setLocalSos]   = useState(sos);
  const [etaInfo, setEtaInfo]     = useState(null);

  useEffect(() => {
    setLocalSos(sos);
  }, [sos]);

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

  if (!localSos) return null;

  const config  = STATUS_CONFIG[localSos.status] || STATUS_CONFIG.active;
  const canCancel = localSos.status === 'active';
  const isResolved = ['resolved', 'cancelled'].includes(localSos.status);
  const StatusIcon = config.icon;

  return (
    <div style={{
      background:   config.bg,
      border:       `1px solid ${config.border}`,
      borderRadius: '8px',
      padding:      '16px',
      marginBottom: '16px',
      fontFamily:   "'Inter', sans-serif"
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <StatusIcon size={20} color={config.color} />
        <span style={{ fontWeight: '600', fontSize: '15px', color: config.color, fontFamily: "'Space Grotesk', sans-serif" }}>
          {config.label}
        </span>
      </div>

      <p style={{ fontSize: '13px', color: '#dae2fd', marginBottom: '8px' }}>
        {config.description}
      </p>

      {etaInfo && (
        <p style={{ fontSize: '13px', fontWeight: '600', color: config.color, marginBottom: '8px' }}>
          ⏱ {etaInfo}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '11px', color: '#bdc8d1' }}>
        <Clock size={12} />
        SOS sent at: {new Date(localSos.created_at).toLocaleTimeString('en-IN')}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        {canCancel && (
          <button
            onClick={onCancel}
            style={{
              padding:      '8px 16px',
              background:   'transparent',
              border:       '1px solid rgba(255,255,255,0.2)',
              borderRadius: '4px',
              fontSize:     '12px',
              fontWeight:   '600',
              color:        '#bdc8d1',
              cursor:       'pointer',
            }}
          >
            Cancel SOS (False Alarm)
          </button>
        )}
        {isResolved && (
          <button
            onClick={onCancel}
            style={{
              padding:      '8px 16px',
              background:   'rgba(255,255,255,0.1)',
              border:       '1px solid rgba(255,255,255,0.2)',
              borderRadius: '4px',
              fontSize:     '12px',
              fontWeight:   '600',
              color:        '#dae2fd',
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
