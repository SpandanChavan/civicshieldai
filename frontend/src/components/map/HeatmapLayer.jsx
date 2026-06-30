/**
 * HeatmapLayer.jsx — E10: Event density heatmap overlay
 *
 * Implements a lightweight heatmap directly with Leaflet CircleMarkers — no
 * external plugin dependency. Each event renders as a radial translucent circle
 * whose radius and opacity scale by severity. The overlay is independent from
 * the event markers and can be toggled without disrupting them.
 *
 * Visible when `visible` prop is true. Cleans up on unmount.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { getEventLatLon } from '@/utils/geoHelpers';

// Severity → heatmap color (RGBA, high alpha = intense)
const SEVERITY_CONFIG = {
  Critical: { color: '#ef4444', radius: 48, opacity: 0.35 },
  High:     { color: '#f97316', radius: 38, opacity: 0.28 },
  Medium:   { color: '#3b82f6', radius: 28, opacity: 0.22 },
  Low:      { color: '#22c55e', radius: 20, opacity: 0.16 },
};

export default function HeatmapLayer({ map, events, visible }) {
  const layerRef = useRef(null); // L.LayerGroup holding circle markers

  useEffect(() => {
    if (!map) return;

    // Remove existing layer on every update
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!visible || !events?.length) return;

    const group = L.layerGroup();

    events.forEach(event => {
      if (!event.is_active) return;
      const pos = getEventLatLon(event);
      if (!pos) return;

      const cfg = SEVERITY_CONFIG[event.severity] || SEVERITY_CONFIG.Low;

      // Outer glow ring
      L.circleMarker([pos.lat, pos.lon], {
        radius: cfg.radius,
        color: cfg.color,
        fillColor: cfg.color,
        fillOpacity: cfg.opacity * 0.6,
        opacity: 0,
        weight: 0,
        interactive: false,
        pane: 'overlayPane',
      }).addTo(group);

      // Inner core
      L.circleMarker([pos.lat, pos.lon], {
        radius: Math.round(cfg.radius * 0.45),
        color: cfg.color,
        fillColor: cfg.color,
        fillOpacity: cfg.opacity * 1.4,
        opacity: 0,
        weight: 0,
        interactive: false,
        pane: 'overlayPane',
      }).addTo(group);
    });

    group.addTo(map);
    layerRef.current = group;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, events, visible]);

  return null; // Pure Leaflet — no React DOM output
}
