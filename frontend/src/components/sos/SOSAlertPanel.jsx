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

  // ── Load initial list of active SOS ─────────────────────────────────────
  useEffect(() => {
    sosApi.list('active')
      .then(data => {
        setSosRequests(data.sos_requests || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('[SOSAlertPanel] Load error:', err);
        setLoading(false);
      });
  }, [setSosRequests]);

  // ── Listen for real-time SOS events ──────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleNew = (payload) => {
      addIncomingSos(payload);
      // Play a notification sound if browser supports it
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

  // ── Acknowledge a SOS ─────────────────────────────────────────────────────
  const handleAcknowledge = async (sosId) => {
    setAcknowledging(sosId);
    try {
      await sosApi.acknowledge(sosId, null, null);
      updateSosStatus(sosId, 'acknowledged');
    } catch (err) {
      console.error('[SOSAlertPanel] Acknowledge error:', err);
      alert('Failed to acknowledge SOS. Please try again.');
    } finally {
      setAcknowledging(null);
    }
  };

  // ── Resolve a SOS ─────────────────────────────────────────────────────────
  const handleResolve = async (sosId) => {
    if (!window.confirm('Mark this SOS as resolved?')) return;
    try {
      await sosApi.resolve(sosId);
      updateSosStatus(sosId, 'resolved');
    } catch (err) {
      console.error('[SOSAlertPanel] Resolve error:', err);
      alert('Failed to resolve SOS. Please try again.');
    }
  };

  const active = sosRequests.filter(s => s.status === 'active');
  const acknowledged = sosRequests.filter(s => s.status === 'acknowledged');

  if (loading) return <p style={{ fontSize: '14px', color: '#888' }}>Loading SOS requests…</p>;

  return (
    <div style={{
      background:   '#fff',
      border:       '2px solid #E53935',
      borderRadius: '12px',
      overflow:     'hidden',
      marginBottom: '1.5rem',
    }}>
      {/* Header */}
      <div style={{
        background: '#E53935',
        color:      '#fff',
        padding:    '12px 16px',
        display:    'flex',
        alignItems: 'center',
        gap:        '10px',
      }}>
        <span style={{ fontSize: '1.4rem' }}>🆘</span>
        <div>
          <div style={{ fontWeight: '700', fontSize: '15px' }}>
            Live SOS Requests
          </div>
          <div style={{ fontSize: '12px', opacity: 0.9 }}>
            {active.length} active · {acknowledged.length} acknowledged
          </div>
        </div>
        {active.length > 0 && (
          <div style={{
            marginLeft:   'auto',
            background:   '#fff',
            color:        '#E53935',
            borderRadius: '20px',
            padding:      '3px 12px',
            fontWeight:   '700',
            fontSize:     '13px',
          }}>
            {active.length} URGENT
          </div>
        )}
      </div>

      {/* SOS list */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {sosRequests.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#888', fontSize: '14px', padding: '20px 0' }}>
            ✅ No active SOS requests in your area.
          </p>
        ) : (
          sosRequests
            .filter(s => ['active', 'acknowledged'].includes(s.status))
            .map((sos) => (
              <div
                key={sos.id}
                style={{
                  background:   sos.status === 'active' ? '#FFF3E0' : '#E8F5E9',
                  border:       `1px solid ${sos.status === 'active' ? '#FFA726' : '#66BB6A'}`,
                  borderRadius: '10px',
                  padding:      '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{
                    fontWeight:   '600',
                    fontSize:     '14px',
                    color:        sos.status === 'active' ? '#E65100' : '#1B5E20',
                  }}>
                    {sos.status === 'active' ? '🆘 ACTIVE' : '✅ ACKNOWLEDGED'}
                    {' — '}
                    {sos.user_profiles?.full_name || 'Unknown citizen'}
                  </span>
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    {timeAgo(sos.created_at)}
                  </span>
                </div>

                {sos.message && (
                  <p style={{ fontSize: '13px', color: '#333', marginBottom: '6px' }}>
                    💬 "{sos.message}"
                  </p>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                  <a
                    href={getMapsLink(sos.latitude, sos.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding:        '6px 14px',
                      background:     '#1565C0',
                      color:          '#fff',
                      borderRadius:   '8px',
                      fontSize:       '12px',
                      textDecoration: 'none',
                      fontWeight:     '500',
                    }}
                  >
                    📍 View on Map
                  </a>

                  {sos.status === 'active' && (
                    <button
                      onClick={() => handleAcknowledge(sos.id)}
                      disabled={acknowledging === sos.id}
                      style={{
                        padding:      '6px 14px',
                        background:   '#43A047',
                        color:        '#fff',
                        border:       'none',
                        borderRadius: '8px',
                        fontSize:     '12px',
                        cursor:       acknowledging === sos.id ? 'not-allowed' : 'pointer',
                        fontWeight:   '500',
                      }}
                    >
                      {acknowledging === sos.id ? 'Acknowledging…' : '✓ Acknowledge'}
                    </button>
                  )}

                  {sos.status === 'acknowledged' && (
                    <button
                      onClick={() => handleResolve(sos.id)}
                      style={{
                        padding:      '6px 14px',
                        background:   '#5E35B1',
                        color:        '#fff',
                        border:       'none',
                        borderRadius: '8px',
                        fontSize:     '12px',
                        cursor:       'pointer',
                        fontWeight:   '500',
                      }}
                    >
                      ✔ Mark Resolved
                    </button>
                  )}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
