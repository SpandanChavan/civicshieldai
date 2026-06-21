/**
 * Geospatial helper utilities for CivicShield AI.
 */
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Activity, Flame, Waves, Wind, Mountain, Sun, ThermometerSun, Snowflake, Globe2, AlertTriangle } from 'lucide-react';

/**
 * Calculate Haversine distance between two points in km.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function toRad(deg) { return (deg * Math.PI) / 180; }

/**
 * Parse a PostGIS WKT POINT string to { lat, lon }.
 * e.g., "POINT(78.9629 20.5937)" → { lat: 20.5937, lon: 78.9629 }
 */
export function parseWktPoint(wkt) {
  if (!wkt) return null;
  const match = wkt.match(/POINT\(([^\s]+)\s+([^)]+)\)/i);
  if (!match) return null;
  return { lon: parseFloat(match[1]), lat: parseFloat(match[2]) };
}

/**
 * Parse a PostGIS EWKB hex string to { lat, lon } — browser-compatible.
 * PostGIS returns geography columns as EWKB binary (hex-encoded), not WKT.
 * EWKB: 1B byte-order + 4B type + 4B SRID (if present) + 8B lon + 8B lat
 */
export function parseWkbPoint(hex) {
  if (!hex || typeof hex !== 'string' || hex.length < 42) return null;
  try {
    const isLE = hex.slice(0, 2) === '01';
    const hasSrid = hex.length >= 50; // EWKB with SRID = 50 hex chars
    const offset = hasSrid ? 18 : 10;
    if (hex.length < offset + 32) return null;

    const readHexToDouble = (h, le) => {
      const bytes = h.match(/../g).map((b) => parseInt(b, 16));
      const buf = new ArrayBuffer(8);
      const view = new DataView(buf);
      bytes.forEach((b, i) => view.setUint8(i, b));
      return view.getFloat64(0, le);
    };

    const lon = readHexToDouble(hex.slice(offset, offset + 16), isLE);
    const lat = readHexToDouble(hex.slice(offset + 16, offset + 32), isLE);

    if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon };
  } catch { return null; }
}

/**
 * Extract lat/lon from an event object.
 * Priority: pre-parsed lat/lon fields → WKB hex → WKT string → raw_data.coordinates
 */
export function getEventLatLon(event) {
  // 1. Backend now injects lat/lon directly — cheapest check
  if (typeof event.lat === 'number' && typeof event.lon === 'number') {
    return { lat: event.lat, lon: event.lon };
  }

  if (event.location) {
    if (typeof event.location === 'string') {
      // 2. Try WKB hex (PostGIS EWKB binary — what Supabase returns for geography columns)
      const wkb = parseWkbPoint(event.location);
      if (wkb) return wkb;
      // 3. Try WKT string (e.g. "POINT(lon lat)")
      const wkt = parseWktPoint(event.location);
      if (wkt) return wkt;
    }
    // 4. Plain { lat, lon } object
    if (event.location.lat != null && event.location.lon != null) {
      return { lat: event.location.lat, lon: event.location.lon };
    }
  }

  // 5. Fall back to raw_data coordinates array [lon, lat]
  if (Array.isArray(event.raw_data?.coordinates)) {
    const [lon, lat] = event.raw_data.coordinates;
    if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
  }

  return null;
}

/**
 * Get map color for an event's severity level.
 */
export function severityColor(severity) {
  const map = {
    Critical: '#ef4444',
    High: '#f59e0b',
    Medium: '#3b82f6',
    Low: '#10b981',
  };
  return map[severity] || '#6b7280';
}

/**
 * Get Leaflet DivIcon HTML for a disaster event marker.
 */
export function eventMarkerIcon(event) {
  const color = severityColor(event.severity);
  const typeIcon = {
    Earthquake:     Activity,
    Wildfire:       Flame,
    Flood:          Waves,
    Cyclone:        Wind,
    Tsunami:        Waves,
    Volcano:        Mountain,
    Landslide:      Mountain,
    Drought:        Sun,
    Heatwave:       ThermometerSun,
    'Heat Wave':    ThermometerSun,
    'Cold Wave':    Snowflake,
    'Natural Event':Globe2,
    default:        AlertTriangle,
  };
  
  const IconComponent = typeIcon[event.event_type] || typeIcon.default;
  const iconHtml = renderToString(createElement(IconComponent, { size: 16, color: color, strokeWidth: 2.5 }));

  const criticalBadge = event.severity === 'Critical' 
    ? `<div style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;background:#ef4444;border-radius:50%;box-shadow:0 0 8px #ef4444, 0 0 0 2px #0f172a;"></div>` 
    : '';

  return {
    html: `
      <div style="
        position: relative;
        width: 32px;
        height: 32px;
        background: #0f172a;
        border: 2px solid ${color};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5), 0 0 10px ${color}40;
      ">
        ${iconHtml}
        ${criticalBadge}
      </div>
    `,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  };
}

/**
 * Fetch hospital/shelter POIs from OSM Overpass API for a map bounds.
 * @param {{ _southWest: {lat,lng}, _northEast: {lat,lng} }} bounds - Leaflet bounds
 * @param {string} amenity - 'hospital' | 'shelter' | 'fire_station' | 'police'
 */
export async function fetchOsmPois(bounds, amenity = 'hospital') {
  const sw = bounds._southWest || bounds.getSouthWest?.();
  const ne = bounds._northEast || bounds.getNorthEast?.();
  if (!sw || !ne) return [];

  const query = `[out:json][timeout:25];
node["amenity"="${amenity}"](${sw.lat},${sw.lng},${ne.lat},${ne.lng});
out body;`;

  try {
    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });
    const data = await resp.json();
    return data.elements || [];
  } catch (e) {
    console.warn('[OSM] Overpass API error:', e.message);
    return [];
  }
}
