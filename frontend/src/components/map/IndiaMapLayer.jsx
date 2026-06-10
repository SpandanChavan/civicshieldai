import { useEffect, useRef, useState } from 'react';
import useAppStore from '@/store/useAppStore';

// India state GeoJSON — fetched from Datameet open data
const INDIA_STATES_GEOJSON_URL =
  'https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson';

// IMD color-coded alert levels per state (populated from IMD alerts)
const ALERT_COLORS = {
  Critical: { fill: '#ef4444', opacity: 0.35, border: '#dc2626' },
  High:     { fill: '#f97316', opacity: 0.30, border: '#ea580c' },
  Medium:   { fill: '#eab308', opacity: 0.25, border: '#ca8a04' },
  Low:      { fill: '#22c55e', opacity: 0.15, border: '#16a34a' },
  None:     { fill: '#3b82f6', opacity: 0.05, border: '#1d4ed8' },
};

/**
 * IndiaMapLayer — renders India state boundaries on the Leaflet map.
 * - Clickable states filter events to that state's region
 * - States with active IMD alerts are highlighted in alert color
 */
export default function IndiaMapLayer({ map }) {
  const geoLayerRef = useRef(null);
  const [selectedState, setSelectedState] = useState(null);
  const events = useAppStore((s) => s.events);
  const setFilter = useAppStore((s) => s.setFilter);

  useEffect(() => {
    if (!map) return;

    // Dynamically import Leaflet (already loaded by DisasterMap)
    const L = window.L || require('leaflet');

    // Build a map of state → max severity from active events
    const stateSeverity = {};
    const SEVERITY_RANK = { Critical: 4, High: 3, Medium: 2, Low: 1 };

    events
      .filter((e) => e.is_active && e.raw_data?.state)
      .forEach((e) => {
        const state = e.raw_data.state;
        const rank = SEVERITY_RANK[e.severity] || 0;
        if (!stateSeverity[state] || rank > SEVERITY_RANK[stateSeverity[state]]) {
          stateSeverity[state] = e.severity;
        }
      });

    // Also check event titles for state names (IMD events have city/state in title)
    events
      .filter((e) => e.is_active && (e.event_type === 'Heatwave' || e.event_type === 'Cold Wave' || e.event_type === 'Flood'))
      .forEach((e) => {
        const stateMatch = INDIA_STATES.find((s) =>
          e.title?.includes(s) || e.description?.includes(s)
        );
        if (stateMatch) {
          const rank = SEVERITY_RANK[e.severity] || 0;
          if (!stateSeverity[stateMatch] || rank > SEVERITY_RANK[stateSeverity[stateMatch]]) {
            stateSeverity[stateMatch] = e.severity;
          }
        }
      });

    // Load GeoJSON and render
    fetch(INDIA_STATES_GEOJSON_URL)
      .then((r) => r.json())
      .then((geojson) => {
        // Remove previous layer
        if (geoLayerRef.current) {
          map.removeLayer(geoLayerRef.current);
        }

        geoLayerRef.current = L.geoJSON(geojson, {
          style: (feature) => {
            const stateName = feature.properties.NAME_1;
            const severity = stateSeverity[stateName] || 'None';
            const colors = ALERT_COLORS[severity] || ALERT_COLORS.None;
            return {
              fillColor: colors.fill,
              fillOpacity: colors.opacity,
              color: colors.border,
              weight: 1,
              dashArray: severity === 'None' ? '3 3' : null,
            };
          },
          onEachFeature: (feature, layer) => {
            const stateName = feature.properties.NAME_1;
            const stateType = feature.properties.TYPE_1 || feature.properties.ENGTYPE_1 || 'State';
            const severity = stateSeverity[stateName];

            // Tooltip
            layer.bindTooltip(
              `<div style="font-family:Inter,sans-serif;font-size:13px;font-weight:600;padding:4px 8px">
                ${stateName}
                ${severity ? `<span style="color:${ALERT_COLORS[severity]?.border};margin-left:6px">● ${severity} Alert</span>` : ''}
              </div>`,
              { sticky: true, opacity: 0.95 }
            );

            layer.on({
              mouseover: (e) => {
                e.target.setStyle({
                  fillOpacity: (ALERT_COLORS[severity || 'None'].opacity || 0.05) + 0.15,
                  weight: 2,
                });
              },
              mouseout: (e) => {
                geoLayerRef.current?.resetStyle(e.target);
              },
              click: (e) => {
                const bounds = e.target.getBounds();
                map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 });
                setSelectedState(stateName);

                // Filter events to this state's bounding box
                const ne = bounds.getNorthEast();
                const sw = bounds.getSouthWest();
                window.__civicshieldStateFilter = { ne, sw, name: stateName };

                // Emit custom event so DisasterMap can filter by bounds
                window.dispatchEvent(new CustomEvent('india:stateclick', {
                  detail: { stateName, bounds: { ne, sw } }
                }));

                setFilter('stateFilter', stateName);
              },
            });
          },
        }).addTo(map);

        // Send to back so markers appear on top
        geoLayerRef.current.bringToBack?.();
      })
      .catch((e) => console.warn('[IndiaMapLayer] GeoJSON load failed:', e.message));

    return () => {
      if (geoLayerRef.current && map) {
        try { map.removeLayer(geoLayerRef.current); } catch (_) {}
        geoLayerRef.current = null;
      }
    };
  }, [map, events, setFilter]);

  return null; // Renders into Leaflet map imperatively
}

// List of Indian state names for IMD title matching
const INDIA_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar', 'Chandigarh', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];
