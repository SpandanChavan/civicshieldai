/**
 * frontend/src/components/sos/NearestSafeZones.jsx
 *
 * Renders a list of the nearest available safe zones (shelters, hospitals, etc.)
 * returned from the backend after SOS creation or from the standalone endpoint.
 *
 * Props:
 *   zones: Array<{
 *     id, name, type, status, quantity, contact, notes,
 *     latitude, longitude, distance_meters
 *   }>
 */

import { Home, PlusSquare, MapPin, HeartPulse, Coffee, LifeBuoy, AlertTriangle, ExternalLink, Phone } from 'lucide-react';

const TYPE_ICONS = {
  shelter:     Home,
  hospital:    PlusSquare,
  relief_camp: MapPin,
  medical:     HeartPulse,
  food:        Coffee,
  rescue:      LifeBuoy,
};

const TYPE_LABELS = {
  shelter:     'Shelter',
  hospital:    'Hospital',
  relief_camp: 'Relief Camp',
  medical:     'Medical Aid',
  food:        'Food & Water',
  rescue:      'Rescue Team',
};

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function getMapsLink(lat, lon, name) {
  return `https://maps.google.com/?q=${lat},${lon}&label=${encodeURIComponent(name)}`;
}

export default function NearestSafeZones({ zones }) {
  if (!zones || zones.length === 0) {
    return (
      <div style={{
        background:   'rgba(245, 158, 11, 0.1)',
        border:       '1px solid rgba(245, 158, 11, 0.4)',
        borderRadius: '8px',
        padding:      '14px',
        fontSize:     '13px',
        color:        '#fcd34d',
        marginTop:    '12px',
        display:      'flex',
        gap:          '10px',
        alignItems:   'flex-start',
        fontFamily:   "'Inter', sans-serif"
      }}>
        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ margin: '0 0 4px', fontWeight: 600 }}>No nearby safe zones found.</p>
          <p style={{ margin: 0, opacity: 0.9 }}>
            Contact your local coordinator or call <strong style={{ color: '#fff' }}>112</strong> immediately.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '16px', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '12px', color: '#bdc8d1' }}>
        <MapPin size={14} />
        <span style={{ fontWeight: '600', fontSize: '13px', fontFamily: "'Space Grotesk', sans-serif", textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Nearest Safe Zones
        </span>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {zones.map((zone) => {
          const IconComp = TYPE_ICONS[zone.type] || MapPin;
          return (
            <div
              key={zone.id}
              style={{
                background:   '#131b2e',
                border:       '1px solid rgba(134, 239, 172, 0.2)',
                borderRadius: '8px',
                padding:      '12px 14px',
                display:      'flex',
                alignItems:   'center',
                gap:          '12px',
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 4, background: 'rgba(134, 239, 172, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconComp size={18} color="#86efac" />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '600', fontSize: '14px', color: '#dae2fd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {zone.name}
                </div>
                <div style={{ fontSize: '12px', color: '#86efac', marginTop: '2px', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span>{TYPE_LABELS[zone.type] || zone.type}</span>
                  <span style={{ opacity: 0.5 }}>•</span>
                  <strong style={{ fontWeight: 600 }}>{formatDistance(zone.distance_meters)}</strong>
                  {zone.quantity && (
                    <>
                      <span style={{ opacity: 0.5 }}>•</span>
                      <span>Cap: {zone.quantity}</span>
                    </>
                  )}
                </div>
                
                {(zone.contact || zone.notes) && (
                  <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {zone.contact && (
                      <div style={{ fontSize: '11px', color: '#bdc8d1', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={10} />
                        <a href={`tel:${zone.contact}`} style={{ color: '#38bdf8', textDecoration: 'none' }}>
                          {zone.contact}
                        </a>
                      </div>
                    )}
                    {zone.notes && (
                      <div style={{ fontSize: '11px', color: '#87929a' }}>
                        {zone.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <a
                href={getMapsLink(zone.latitude, zone.longitude, zone.name)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding:      '8px 12px',
                  background:   'rgba(56, 189, 248, 0.1)',
                  color:        '#38bdf8',
                  border:       '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '4px',
                  fontSize:     '12px',
                  textDecoration: 'none',
                  fontWeight:   '600',
                  display:      'flex',
                  alignItems:   'center',
                  gap:          '4px',
                  flexShrink:   0
                }}
              >
                Nav <ExternalLink size={12} />
              </a>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: '11px', color: '#87929a', marginTop: '12px', textAlign: 'center' }}>
        In life-threatening emergency, call <strong style={{ color: '#ef4444' }}>112</strong> immediately.
      </p>
    </div>
  );
}
