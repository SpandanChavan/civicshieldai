/**
 * frontend/src/components/sos/SOSButton.jsx
 *
 * The one-tap SOS button for the CitizenPortal.
 * Handles geolocation, confirmation, submission, and displays the
 * nearest safe zones + live status banner after submission.
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../services/supabaseClient';
import { sosApi } from '../../services/backendApi';
import useAppStore from '../../store/useAppStore';
import NearestSafeZones from './NearestSafeZones';
import SOSStatusBanner from './SOSStatusBanner';

export default function SOSButton() {
  const [phase, setPhase]         = useState('idle'); // idle | confirming | locating | sending | active | error
  const [errorMsg, setErrorMsg]   = useState('');
  const [message, setMessage]     = useState('');

  const { activeSos, setActiveSos, nearestZones, setNearestZones, clearActiveSos } = useAppStore();

  // ── Handle the initial SOS button click ────────────────────────────────────
  const handleSOSClick = () => {
    setPhase('confirming');
    setErrorMsg('');
  };

  // ── User cancelled the confirmation dialog ─────────────────────────────────
  const handleCancel = () => {
    setPhase('idle');
    setMessage('');
  };

  // ── User confirmed — get GPS and submit ────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    setPhase('locating');
    setErrorMsg('');

    // Step 1: Get GPS coordinates
    let latitude, longitude;
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout:            10000,  // 10 second timeout
          maximumAge:         0,      // Always fresh position
        });
      });
      latitude  = position.coords.latitude;
      longitude = position.coords.longitude;
    } catch (geoErr) {
      let msg = 'Could not get your location. Please try again.';
      if (geoErr.code === 1) msg = 'Location access denied. Please allow location in your browser settings.';
      if (geoErr.code === 3) msg = 'Location request timed out. Move to an open area and retry.';
      setErrorMsg(msg);
      setPhase('error');
      return;
    }

    // Step 2: Submit SOS to backend using the sosApi
    setPhase('sending');
    try {
      const data = await sosApi.create({
        latitude,
        longitude,
        message: message.trim() || null,
      });

      // Success — store SOS and safe zones in Zustand
      setActiveSos(data.sos);
      setNearestZones(data.nearest_safe_zones || []);
      setPhase('active');
      setMessage('');

    } catch (submitErr) {
      // 409 = already have an active SOS (we'll assume the API throws an Error object with the message)
      if (submitErr.message?.includes('already have an active SOS')) {
        setErrorMsg('You already have an active SOS. See your status below.');
        setPhase('active');
      } else {
        setErrorMsg(submitErr.message || 'Failed to send SOS. Please try again.');
        setPhase('error');
      }
    }
  }, [message, setActiveSos, setNearestZones]);

  // ── Handle citizen cancelling their own SOS ────────────────────────────────
  const handleCancelSOS = useCallback(async () => {
    if (!activeSos?.id) return;
    try {
      await sosApi.cancel(activeSos.id);
      clearActiveSos();
      setPhase('idle');
    } catch (err) {
      console.error('[SOS] Cancel failed:', err);
    }
  }, [activeSos, clearActiveSos]);

  // ── Retry after error ──────────────────────────────────────────────────────
  const handleRetry = () => {
    setPhase('idle');
    setErrorMsg('');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ marginBottom: '1.5rem' }}>

      {/* ── If SOS is active, show status banner and safe zones ── */}
      {(phase === 'active' || activeSos) && (
        <>
          <SOSStatusBanner sos={activeSos} onCancel={handleCancelSOS} />
          <NearestSafeZones zones={nearestZones} />
        </>
      )}

      {/* ── Idle state: show the SOS button ── */}
      {(phase === 'idle' && !activeSos) && (
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <button
            onClick={handleSOSClick}
            style={{
              width:           '160px',
              height:          '160px',
              borderRadius:    '50%',
              backgroundColor: '#C0392B',
              color:           '#fff',
              border:          '6px solid #922B21',
              fontSize:        '1.4rem',
              fontWeight:      '600',
              cursor:          'pointer',
              boxShadow:       '0 4px 20px rgba(192,57,43,0.45)',
              letterSpacing:   '0.05em',
              display:         'flex',
              flexDirection:   'column',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             '6px',
              margin:          '0 auto',
            }}
            aria-label="Send SOS emergency alert"
          >
            <span style={{ fontSize: '2.5rem' }}>🆘</span>
            <span>SOS</span>
          </button>
          <p style={{ marginTop: '12px', fontSize: '13px', color: '#666', textAlign: 'center' }}>
            Tap to send an emergency alert to your nearest coordinator
          </p>
        </div>
      )}

      {/* ── Confirmation dialog ── */}
      {phase === 'confirming' && (
        <div style={{
          background:   '#fff',
          border:       '2px solid #C0392B',
          borderRadius: '12px',
          padding:      '1.25rem',
          textAlign:    'center',
        }}>
          <p style={{ fontWeight: '600', fontSize: '1rem', marginBottom: '8px' }}>
            ⚠️ Confirm Emergency SOS
          </p>
          <p style={{ fontSize: '13px', color: '#555', marginBottom: '1rem' }}>
            This will alert your state coordinator, notify your emergency contacts via SMS,
            and share your live location. Only use in a real emergency.
          </p>
          <textarea
            placeholder="Optional: describe your situation (e.g. 'Flood water rising, need evacuation')"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            rows={3}
            style={{
              width:        '100%',
              padding:      '8px',
              borderRadius: '8px',
              border:       '1px solid #ccc',
              fontSize:     '14px',
              marginBottom: '12px',
              resize:       'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={handleConfirm}
              style={{
                padding:         '10px 28px',
                background:      '#C0392B',
                color:           '#fff',
                border:          'none',
                borderRadius:    '8px',
                fontSize:        '15px',
                fontWeight:      '600',
                cursor:          'pointer',
              }}
            >
              Yes, Send SOS
            </button>
            <button
              onClick={handleCancel}
              style={{
                padding:      '10px 20px',
                background:   'transparent',
                color:        '#555',
                border:       '1px solid #ccc',
                borderRadius: '8px',
                fontSize:     '15px',
                cursor:       'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Locating / Sending spinner ── */}
      {(phase === 'locating' || phase === 'sending') && (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📡</div>
          <p style={{ fontWeight: '500', color: '#ccc' }}>
            {phase === 'locating' ? 'Getting your location…' : 'Sending SOS…'}
          </p>
          <p style={{ fontSize: '13px', color: '#666' }}>Please keep this screen open.</p>
        </div>
      )}

      {/* ── Error state ── */}
      {phase === 'error' && (
        <div style={{
          background:   '#FDECEA',
          border:       '1px solid #E57373',
          borderRadius: '10px',
          padding:      '1rem',
          textAlign:    'center',
        }}>
          <p style={{ color: '#B71C1C', fontWeight: '500', marginBottom: '8px' }}>
            ❌ {errorMsg}
          </p>
          <button
            onClick={handleRetry}
            style={{
              padding:      '8px 20px',
              background:   '#C0392B',
              color:        '#fff',
              border:       'none',
              borderRadius: '8px',
              cursor:       'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      )}

    </div>
  );
}
