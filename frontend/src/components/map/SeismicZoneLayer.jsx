import { useEffect, useRef } from 'react';

/**
 * SeismicZoneLayer — BIS IS 1893 Seismic Zone Map (imperative Leaflet)
 *
 * Uses L.geoJSON added to the map imperatively — matching IndiaMapLayer's pattern.
 * Zones: V (Very High), IV (High), III (Moderate), II (Low)
 * Source: Bureau of Indian Standards IS 1893 (Part 1):2016 — approximate polygons.
 */

const ZONE_STYLES = {
  V:   { fillColor: '#ef4444', fillOpacity: 0.18, color: '#dc2626', weight: 1.5, dashArray: null   },
  IV:  { fillColor: '#f97316', fillOpacity: 0.13, color: '#ea580c', weight: 1.5, dashArray: '6,3'  },
  III: { fillColor: '#eab308', fillOpacity: 0.09, color: '#ca8a04', weight: 1,   dashArray: '4,4'  },
  II:  { fillColor: '#22c55e', fillOpacity: 0.06, color: '#16a34a', weight: 1,   dashArray: '2,4'  },
};

// Simplified BIS seismic zone polygons (approximate, for visualization)
const SEISMIC_ZONES_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    // ── Zone V (Very High Damage Risk) ─────────────────────
    {
      type: 'Feature',
      properties: { zone: 'V', name: 'Andaman & Nicobar', risk: 'Very High Damage Risk' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[92.2,14.0],[93.0,13.0],[93.5,11.5],[93.0,10.0],
          [92.5,8.5],[92.0,7.0],[91.5,7.5],[92.0,9.0],
          [91.8,10.5],[92.0,12.0],[92.2,14.0]]],
      },
    },
    {
      type: 'Feature',
      properties: { zone: 'V', name: 'Himalayan Belt (West)', risk: 'Very High Damage Risk' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[73.0,34.5],[75.0,35.5],[77.5,35.8],[79.5,35.5],
          [80.5,35.0],[79.5,33.0],[77.5,32.5],[75.5,33.5],[73.0,34.5]]],
      },
    },
    {
      type: 'Feature',
      properties: { zone: 'V', name: 'Northeast India', risk: 'Very High Damage Risk' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[88.5,27.5],[91.0,27.8],[93.5,28.0],[95.5,27.5],
          [97.5,27.0],[97.5,25.5],[96.0,24.0],[93.5,23.5],
          [91.5,24.0],[89.5,25.0],[88.5,26.0],[88.5,27.5]]],
      },
    },

    // ── Zone IV (High Damage Risk) ──────────────────────────
    {
      type: 'Feature',
      properties: { zone: 'IV', name: 'Delhi & Himalayan Foothills', risk: 'High Damage Risk' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[73.0,31.5],[75.5,32.0],[77.5,32.5],[79.5,31.5],
          [82.0,30.5],[85.0,28.0],[88.5,27.5],[88.5,26.5],
          [85.0,26.0],[82.0,27.0],[79.0,28.5],[76.5,29.5],
          [74.5,30.0],[73.0,31.5]]],
      },
    },
    {
      type: 'Feature',
      properties: { zone: 'IV', name: 'Eastern NE (Nagaland/Manipur)', risk: 'High Damage Risk' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[93.5,23.5],[96.0,24.0],[97.5,25.5],[97.5,23.5],
          [95.0,22.5],[93.5,22.5],[93.5,23.5]]],
      },
    },
    {
      type: 'Feature',
      properties: { zone: 'IV', name: 'Kutch (Gujarat)', risk: 'High Damage Risk' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[68.0,22.5],[69.5,23.5],[71.0,23.5],[72.0,22.5],
          [72.0,22.0],[70.0,22.0],[68.5,22.0],[68.0,22.5]]],
      },
    },

    // ── Zone III (Moderate Damage Risk) ────────────────────
    {
      type: 'Feature',
      properties: { zone: 'III', name: 'Gangetic Plain & Western Ghats', risk: 'Moderate Damage Risk' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[73.0,26.5],[74.5,30.0],[76.5,29.5],[79.0,28.5],
          [82.0,27.0],[85.0,26.0],[88.5,26.5],[89.5,25.0],
          [88.0,23.0],[86.0,21.5],[83.5,20.0],[81.0,18.5],
          [79.5,17.0],[78.0,15.5],[77.0,14.0],[76.0,14.5],
          [74.0,15.5],[73.0,17.0],[73.0,20.0],[72.5,22.0],
          [73.0,24.0],[73.0,26.5]]],
      },
    },
    {
      type: 'Feature',
      properties: { zone: 'III', name: 'NE Low Hills', risk: 'Moderate Damage Risk' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[88.5,26.0],[89.5,25.0],[91.5,24.0],[93.5,23.5],
          [93.5,22.5],[91.0,22.0],[89.0,22.5],[88.0,23.0],[88.5,26.0]]],
      },
    },

    // ── Zone II (Low / Stable Craton) ────────────────────
    {
      type: 'Feature',
      properties: { zone: 'II', name: 'Stable Peninsular India', risk: 'Low Damage Risk' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[74.0,15.5],[76.0,14.5],[77.0,14.0],[78.0,15.5],
          [79.5,17.0],[81.0,18.5],[83.5,20.0],[86.0,21.5],
          [88.0,23.0],[87.5,21.0],[86.0,18.0],[82.0,14.5],
          [80.0,12.5],[78.0,10.0],[76.5,8.5],[76.0,10.0],
          [75.0,11.5],[74.0,13.0],[74.0,15.5]]],
      },
    },
    {
      type: 'Feature',
      properties: { zone: 'II', name: 'Rajasthan Stable Zone', risk: 'Low Damage Risk' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[69.5,23.5],[72.5,22.0],[73.0,24.0],[73.0,26.5],
          [73.0,28.5],[71.5,29.0],[70.0,29.0],[69.5,27.5],[69.5,23.5]]],
      },
    },
  ],
};

export default function SeismicZoneLayer({ map, visible = true }) {
  const layerRef = useRef(null);

  useEffect(() => {
    if (!map) return;
    const L = window.L || require('leaflet');

    // Remove old layer
    if (layerRef.current) {
      try { map.removeLayer(layerRef.current); } catch (_) {}
      layerRef.current = null;
    }

    if (!visible) return;

    layerRef.current = L.geoJSON(SEISMIC_ZONES_GEOJSON, {
      style: (feature) => ZONE_STYLES[feature.properties.zone] || ZONE_STYLES.II,
      onEachFeature: (feature, layer) => {
        const { zone, name, risk } = feature.properties;
        layer.bindTooltip(
          `<div style="font-family:Inter,sans-serif;font-size:12px;padding:4px 8px">
            <strong style="color:${ZONE_STYLES[zone].color}">Zone ${zone}</strong>
            — ${name}<br/>
            <span style="color:#94a3b8;font-size:11px">${risk}</span>
          </div>`,
          { sticky: true, opacity: 0.95 }
        );
        layer.on({
          mouseover: (e) => {
            e.target.setStyle({
              fillOpacity: (ZONE_STYLES[zone].fillOpacity || 0.08) + 0.12,
              weight: 2.5,
            });
          },
          mouseout: (e) => {
            layerRef.current?.resetStyle?.(e.target);
          },
        });
      },
    }).addTo(map);

    // Push behind markers and state boundaries
    layerRef.current.bringToBack?.();

    return () => {
      if (layerRef.current && map) {
        try { map.removeLayer(layerRef.current); } catch (_) {}
        layerRef.current = null;
      }
    };
  }, [map, visible]);

  return null; // Pure Leaflet, no React DOM output
}
