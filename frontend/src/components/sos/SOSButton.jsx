/**
 * frontend/src/components/sos/SOSButton.jsx
 *
 * The one-tap SOS button for the CitizenPortal.
 * Handles geolocation, submission, and displays the
 * nearest safe zones + live status banner after submission.
 */

import { useState, useCallback } from 'react';
import { sosApi } from '../../services/backendApi';
import useAppStore from '../../store/useAppStore';
import NearestSafeZones from './NearestSafeZones';
import SOSStatusBanner from './SOSStatusBanner';
import { ShieldAlert, AlertTriangle, Loader2, RefreshCcw } from 'lucide-react';

export default function SOSButton() {
  const [phase, setPhase]         = useState('idle'); // idle | locating | sending | active | error
  const [errorMsg, setErrorMsg]   = useState('');

  const { activeSos, setActiveSos, nearestZones, setNearestZones, clearActiveSos } = useAppStore();

  const handleSOSClick = useCallback(async () => {
    setPhase('locating');
    setErrorMsg('');

    let latitude, longitude;
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout:            10000,
          maximumAge:         0,
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

    setPhase('sending');
    try {
      const data = await sosApi.create({
        latitude,
        longitude,
      });

      setActiveSos(data.sos);
      setNearestZones(data.nearest_safe_zones || []);
      setPhase('active');
    } catch (submitErr) {
      if (submitErr.message?.includes('already have an active SOS')) {
        setErrorMsg('You already have an active SOS. See your status below.');
        setPhase('active');
      } else {
        setErrorMsg(submitErr.message || 'Failed to send SOS. Please try again.');
        setPhase('error');
      }
    }
  }, [setActiveSos, setNearestZones]);

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

  const handleRetry = () => {
    setPhase('idle');
    setErrorMsg('');
  };

  return (
    <div style={{ marginBottom: '1.5rem', fontFamily: "'Inter', sans-serif" }}>

      {(phase === 'active' || activeSos) && (
        <>
          <SOSStatusBanner sos={activeSos} onCancel={handleCancelSOS} />
          <NearestSafeZones zones={nearestZones} />
        </>
      )}

      {(phase === 'idle' && !activeSos) && (
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <button
            onClick={handleSOSClick}
            style={{
              width:           '160px',
              height:          '160px',
              borderRadius:    '50%',
              background:      'radial-gradient(circle at center, #7f1d1d, #450a0a)',
              color:           '#fca5a5',
              border:          '6px solid #ef4444',
              fontSize:        '1.2rem',
              fontWeight:      '700',
              cursor:          'pointer',
              boxShadow:       '0 0 40px rgba(239, 68, 68, 0.4)',
              letterSpacing:   '0.05em',
              display:         'flex',
              flexDirection:   'column',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             '10px',
              margin:          '0 auto',
              fontFamily:      "'Space Grotesk', sans-serif"
            }}
            aria-label="Send SOS emergency alert"
          >
            <ShieldAlert size={48} strokeWidth={2.5} color="#fca5a5" />
            <span>SOS</span>
          </button>
          <p style={{ marginTop: '16px', fontSize: '12px', color: '#bdc8d1', textAlign: 'center' }}>
            Tap to send an emergency alert to your nearest coordinator
          </p>
        </div>
      )}

      {(phase === 'locating' || phase === 'sending') && (
        <div style={{ textAlign: 'center', padding: '32px 0', background: '#131b2e', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <Loader2 size={32} color="#38bdf8" style={{ animation: 'spin 2s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ fontWeight: '600', color: '#dae2fd', fontSize: '14px', margin: '0 0 6px', fontFamily: "'Space Grotesk', sans-serif" }}>
            {phase === 'locating' ? 'Getting your location...' : 'Sending SOS...'}
          </p>
          <p style={{ fontSize: '12px', color: '#bdc8d1', margin: 0 }}>Please keep this screen open.</p>
        </div>
      )}

      {phase === 'error' && (
        <div style={{
          background:   'rgba(239,68,68,0.1)',
          border:       '1px solid rgba(239,68,68,0.5)',
          borderRadius: '8px',
          padding:      '16px',
          textAlign:    'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#fca5a5', marginBottom: 12 }}>
            <AlertTriangle size={16} />
            <p style={{ fontWeight: '600', fontSize: '13px', margin: 0 }}>{errorMsg}</p>
          </div>
          <button
            onClick={handleRetry}
            style={{
              padding:      '8px 20px',
              background:   'transparent',
              color:        '#fca5a5',
              border:       '1px solid rgba(239,68,68,0.5)',
              borderRadius: '4px',
              fontSize:     '12px',
              fontWeight:   '600',
              cursor:       'pointer',
              display:      'inline-flex',
              alignItems:   'center',
              gap:          '6px'
            }}
          >
            <RefreshCcw size={14} /> Try Again
          </button>
        </div>
      )}

    </div>
  );
}
