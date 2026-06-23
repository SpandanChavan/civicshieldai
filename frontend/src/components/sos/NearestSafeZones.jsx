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

const TYPE_ICONS = {
  shelter:     '🏠',
  hospital:    '🏥',
  relief_camp: '⛺',
  medical:     '💊',
  food:        '🍱',
  rescue:      '🚁',
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
        background:   '#FFF8E1',
        border:       '1px solid #FFD54F',
        borderRadius: '10px',
        padding:      '12px',
        fontSize:     '13px',
        color:        '#795548',
        marginTop:    '12px',
      }}>
        ⚠️ No nearby safe zones found in the database. Contact your local coordinator
        or call <strong>112</strong> (National Emergency) immediately.
      </div>
    );
  }

  return (
    <div style={{ marginTop: '16px' }}>
      <p style={{ fontWeight: '600', fontSize: '14px', marginBottom: '10px', color: '#ccc' }}>
        📍 Nearest Safe Zones
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {zones.map((zone) => (
          <div
            key={zone.id}
            style={{
              background:   '#F1F8E9',
              border:       '1px solid #AED581',
              borderRadius: '10px',
              padding:      '10px 12px',
              display:      'flex',
              alignItems:   'flex-start',
              gap:          '10px',
            }}
          >
            <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>
              {TYPE_ICONS[zone.type] || '📍'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: '#333' }}>{zone.name}</div>
              <div style={{ fontSize: '12px', color: '#558B2F', marginTop: '2px' }}>
                {TYPE_LABELS[zone.type] || zone.type}
                {' · '}
                <strong>{formatDistance(zone.distance_meters)} away</strong>
                {zone.quantity ? ` · Capacity: ${zone.quantity}` : ''}
              </div>
              {zone.contact && (
                <div style={{ fontSize: '12px', color: '#37474F', marginTop: '4px' }}>
                  📞{' '}
                  <a href={`tel:${zone.contact}`} style={{ color: '#1565C0' }}>
                    {zone.contact}
                  </a>
                </div>
              )}
              {zone.notes && (
                <div style={{ fontSize: '12px', color: '#546E7A', marginTop: '2px' }}>
                  {zone.notes}
                </div>
              )}
            </div>
            <a
              href={getMapsLink(zone.latitude, zone.longitude, zone.name)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding:      '6px 12px',
                background:   '#43A047',
                color:        '#fff',
                borderRadius: '8px',
                fontSize:     '12px',
                textDecoration: 'none',
                whiteSpace:   'nowrap',
                fontWeight:   '500',
              }}
            >
              Navigate ↗
            </a>
          </div>
        ))}
      </div>
      <p style={{ fontSize: '12px', color: '#888', marginTop: '8px', textAlign: 'center' }}>
        In life-threatening emergency, call <strong>112</strong> immediately.
      </p>
    </div>
  );
}
