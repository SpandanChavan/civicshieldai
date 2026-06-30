/**
 * frontend/src/components/sos/SOSAlertPanel.jsx
 *
 * Real-time SOS request panel for coordinators and admins.
 * Shows all active SOS in the coordinator's state.
 * Listens to Socket.io 'sos:new' and 'sos:status_changed' events.
 */

import { useEffect, useState } from 'react';
import useAppStore from '../../store/useAppStore';
import { sosApi } from '../../services/backendApi';
import { socket } from '../../hooks/useDisasterEvents';
import { ShieldAlert, MapPin, Check, CheckCircle2, Clock, MessageSquare, AlertTriangle } from 'lucide-react';

function getMapsLink(lat, lon) {
  return `https://maps.google.com/?q=${lat},${lon}`;
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function SOSAlertPanel() {
  const { sosRequests, setSosRequests, addIncomingSos, updateSosStatus } = useAppStore();
  const [loading, setLoading]         = useState(true);
  const [acknowledging, setAcknowledging] = useState(null); // SOS id being acknowledged
  const [confirmingResolve, setConfirmingResolve] = useState(null); // SOS id confirming resolve
  const [actionError, setActionError] = useState(null); // { id, message }

  useEffect(() => {
    sosApi.getAll({ status: 'all' })
      .then(data => {
        setSosRequests(data.sos_requests || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('[SOSAlertPanel] Load error:', err);
        setLoading(false);
      });
  }, [setSosRequests]);

  useEffect(() => {
    if (!socket) return;

    const handleNew = (payload) => {
      addIncomingSos(payload);
      try {
        new Audio('/sounds/sos-alert.mp3').play().catch(() => {});
      } catch (_) {}
    };

    const handleStatusChanged = (payload) => {
      updateSosStatus(payload.id, payload.status);
    };

    socket.on('sos:new',            handleNew);
    socket.on('sos:status_changed', handleStatusChanged);
    socket.on('sos:cancelled',      (p) => updateSosStatus(p.id, 'cancelled'));

    return () => {
      socket.off('sos:new',            handleNew);
      socket.off('sos:status_changed', handleStatusChanged);
      socket.off('sos:cancelled',      (p) => updateSosStatus(p.id, 'cancelled'));
    };
  }, [addIncomingSos, updateSosStatus]);

  const handleAcknowledge = async (sosId) => {
    setAcknowledging(sosId);
    setActionError(null);
    try {
      await sosApi.acknowledge(sosId, {});
      updateSosStatus(sosId, 'acknowledged');
    } catch (err) {
      console.error('[SOSAlertPanel] Acknowledge error:', err);
      setActionError({ id: sosId, message: 'Failed to acknowledge SOS. Please try again.' });
    } finally {
      setAcknowledging(null);
    }
  };

  const handleResolve = async (sosId) => {
    setActionError(null);
    try {
      await sosApi.resolve(sosId);
      updateSosStatus(sosId, 'resolved');
      setConfirmingResolve(null);
    } catch (err) {
      console.error('[SOSAlertPanel] Resolve error:', err);
      setActionError({ id: sosId, message: 'Failed to resolve SOS. Please try again.' });
    }
  };

  const active = sosRequests.filter(s => s.status === 'active');
  const acknowledged = sosRequests.filter(s => s.status === 'acknowledged');

  if (loading) return <p style={{ fontSize: '13px', color: '#bdc8d1' }}>Loading SOS requests...</p>;

  return (
    <div style={{
      background:   '#131b2e',
      border:       '1px solid rgba(239, 68, 68, 0.4)',
      borderRadius: '8px',
      overflow:     'hidden',
      marginBottom: '1.5rem',
      fontFamily:   "'Inter', sans-serif"
    }}>
      {/* Header */}
      <div style={{
        background: 'rgba(239, 68, 68, 0.15)',
        borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
        padding:    '14px 18px',
        display:    'flex',
        alignItems: 'center',
        gap:        '12px',
      }}>
        <div style={{ width: 32, height: 32, borderRadius: 4, background: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldAlert size={18} color="#fca5a5" />
        </div>
        <div>
          <div style={{ fontWeight: '600', fontSize: '15px', color: '#fca5a5', fontFamily: "'Space Grotesk', sans-serif" }}>
            Live SOS Requests
          </div>
          <div style={{ fontSize: '12px', color: '#bdc8d1', marginTop: 2 }}>
            {active.length} active · {acknowledged.length} acknowledged
          </div>
        </div>
        {active.length > 0 && (
          <div style={{
            marginLeft:   'auto',
            background:   '#ef4444',
            color:        '#fff',
            borderRadius: '4px',
            padding:      '4px 10px',
            fontWeight:   '700',
            fontSize:     '11px',
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}>
            {active.length} URGENT
          </div>
        )}
      </div>

      {/* SOS list */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {sosRequests.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#87929a', fontSize: '13px', padding: '24px 0', margin: 0 }}>
            No active SOS requests in your jurisdiction.
          </p>
        ) : (
          sosRequests
            .filter(s => ['active', 'acknowledged'].includes(s.status))
            .map((sos) => {
              const isActive = sos.status === 'active';
              return (
                <div
                  key={sos.id}
                  style={{
                    background:   isActive ? 'rgba(245, 158, 11, 0.08)' : 'rgba(52, 211, 153, 0.08)',
                    border:       `1px solid ${isActive ? 'rgba(245, 158, 11, 0.3)' : 'rgba(52, 211, 153, 0.3)'}`,
                    borderRadius: '8px',
                    padding:      '14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isActive ? <ShieldAlert size={14} color="#fcd34d" /> : <CheckCircle2 size={14} color="#6ee7b7" />}
                      <span style={{
                        fontWeight:   '600',
                        fontSize:     '13px',
                        color:        isActive ? '#fcd34d' : '#6ee7b7',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        {isActive ? 'ACTIVE' : 'ACKNOWLEDGED'}
                      </span>
                      <span style={{ color: '#87929a', fontSize: '12px' }}>—</span>
                      <span style={{ fontSize: '14px', color: '#dae2fd', fontWeight: 500 }}>
                        {sos.user_profiles?.full_name || 'Unknown citizen'}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#87929a', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} />
                      {timeAgo(sos.created_at)}
                    </span>
                  </div>

                  {sos.message && (
                    <div style={{ fontSize: '13px', color: '#bdc8d1', marginBottom: '12px', display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: 4 }}>
                      <MessageSquare size={14} color="#87929a" style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontStyle: 'italic' }}>"{sos.message}"</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                    <a
                      href={getMapsLink(sos.latitude, sos.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding:        '6px 12px',
                        background:     'rgba(56, 189, 248, 0.1)',
                        border:         '1px solid rgba(56, 189, 248, 0.3)',
                        color:          '#38bdf8',
                        borderRadius:   '4px',
                        fontSize:       '12px',
                        textDecoration: 'none',
                        fontWeight:     '600',
                        display:        'flex',
                        alignItems:     'center',
                        gap:            '6px'
                      }}
                    >
                      <MapPin size={12} /> View on Map
                    </a>

                    {isActive && (
                      <button
                        onClick={() => handleAcknowledge(sos.id)}
                        disabled={acknowledging === sos.id}
                        style={{
                          padding:      '6px 14px',
                          background:   '#34d399',
                          color:        '#064e3b',
                          border:       'none',
                          borderRadius: '4px',
                          fontSize:     '12px',
                          cursor:       acknowledging === sos.id ? 'not-allowed' : 'pointer',
                          fontWeight:   '600',
                          display:      'flex',
                          alignItems:   'center',
                          gap:          '6px'
                        }}
                      >
                        {acknowledging === sos.id ? 'Acknowledging...' : <><Check size={12} /> Acknowledge</>}
                      </button>
                    )}

                    {sos.status === 'acknowledged' && confirmingResolve !== sos.id && (
                      <button
                        onClick={() => { setConfirmingResolve(sos.id); setActionError(null); }}
                        style={{
                          padding:      '6px 14px',
                          background:   'rgba(255, 255, 255, 0.1)',
                          color:        '#dae2fd',
                          border:       '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '4px',
                          fontSize:     '12px',
                          cursor:       'pointer',
                          fontWeight:   '600',
                          display:      'flex',
                          alignItems:   'center',
                          gap:          '6px'
                        }}
                      >
                        <CheckCircle2 size={12} /> Mark Resolved
                      </button>
                    )}

                    {sos.status === 'acknowledged' && confirmingResolve === sos.id && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleResolve(sos.id)}
                          style={{
                            padding:      '6px 14px',
                            background:   '#ef4444',
                            color:        '#fff',
                            border:       'none',
                            borderRadius: '4px',
                            fontSize:     '12px',
                            cursor:       'pointer',
                            fontWeight:   '600',
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmingResolve(null)}
                          style={{
                            padding:      '6px 14px',
                            background:   'transparent',
                            color:        '#bdc8d1',
                            border:       '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '4px',
                            fontSize:     '12px',
                            cursor:       'pointer',
                            fontWeight:   '600',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {actionError?.id === sos.id && (
                    <div style={{ marginTop: '12px', fontSize: '12px', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertTriangle size={14} />
                      {actionError.message}
                    </div>
                  )}
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}
