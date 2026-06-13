import { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import useAppStore from '@/store/useAppStore';
import { getEventLatLon, eventMarkerIcon } from '@/utils/geoHelpers';
import { timeAgo } from '@/utils/formatDate';
import { routingApi } from '@/services/backendApi';
import IndiaMapLayer from './IndiaMapLayer';
import SeismicZoneLayer from './SeismicZoneLayer';

// ── Fix Leaflet default marker icon paths for Vite ──
// MUST be done before any L.map() call
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function DisasterMap({ onEventSelect }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);  // Holds the L.Map instance
  const markersRef = useRef({});     // id → L.Marker
  const [mapReady, setMapReady] = useState(false);

  const events = useAppStore((s) => s.events);
  const filters = useAppStore((s) => s.filters);
  const setSelectedEvent = useAppStore((s) => s.setSelectedEvent);
  const userLocation = useAppStore((s) => s.userLocation);
  const userMarkerRef = useRef(null);

  // ── Initialize map exactly once ──────────────────
  useEffect(() => {
    // CRITICAL: React 18 StrictMode double-invokes effects — this guard prevents duplicate maps
    if (mapInstance.current) return;

    mapInstance.current = L.map(mapRef.current, {
      center: [20.5937, 78.9629], // India
      zoom: 5,
      zoomControl: false,
    });
    window.__civicshieldMap = mapInstance.current; // expose for MapLayers fitAll
    setMapReady(true);


    // Custom zoom control (top-right)
    L.control.zoom({ position: 'topright' }).addTo(mapInstance.current);

    // OpenStreetMap tiles — FREE, no API key, no cost ever
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapInstance.current);

    // Scale control
    L.control.scale({ imperial: false }).addTo(mapInstance.current);

    return () => {
      // Only destroy on actual unmount (StrictMode second invocation runs before first cleanup)
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []); // Empty deps — runs once

  // ── Update markers when events or filters change ─
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Filter events
    const activeEvents = events.filter((e) => {
      if (!e.is_active) return false;
      if (filters.eventType !== 'all' && e.event_type !== filters.eventType) return false;
      if (filters.severity !== 'all' && e.severity !== filters.severity) return false;
      // 🇮🇳 India state filter — filter by bounding box of clicked state
      if (filters.stateFilter && window.__civicshieldStateFilter?.bounds) {
        const { ne, sw } = window.__civicshieldStateFilter.bounds;
        const pos = getEventLatLon(e);
        if (pos) {
          if (pos.lat < sw.lat || pos.lat > ne.lat || pos.lon < sw.lng || pos.lon > ne.lng) return false;
        }
      }
      return true;
    });

    // Remove markers for events no longer in filtered set
    const activeIds = new Set(activeEvents.map((e) => e.id));
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      if (!activeIds.has(id)) {
        map.removeLayer(marker);
        delete markersRef.current[id];
      }
    });

    // Add or update markers
    activeEvents.forEach((event) => {
      if (markersRef.current[event.id]) return; // Already on map

      const pos = getEventLatLon(event);
      if (!pos) return;

      const icon = L.divIcon(eventMarkerIcon(event));
      const marker = L.marker([pos.lat, pos.lon], { icon });

      // Popup content
      const popupHtml = `
        <div style="min-width:220px;font-family:Inter,sans-serif;">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px">${event.title}</div>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
            <span style="background:${getSeverityBg(event.severity)};color:${getSeverityColor(event.severity)};
              padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;text-transform:uppercase">
              ${event.severity}
            </span>
            <span style="color:#94a3b8;font-size:12px">${event.event_type}</span>
          </div>
          ${event.description ? `<div style="color:#cbd5e1;font-size:12px;margin-bottom:6px">${event.description}</div>` : ''}
          <div style="color:#64748b;font-size:11px">${timeAgo(event.detected_at)}</div>
          <div style="color:#64748b;font-size:11px">Source: ${event.source}</div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        maxWidth: 280,
        className: 'civicshield-popup',
      });

      marker.on('click', () => {
        setSelectedEvent(event);
        onEventSelect?.(event);
      });

      marker.addTo(map);
      markersRef.current[event.id] = marker;
    });
  }, [events, filters, setSelectedEvent, onEventSelect]);

  // ── Render user location marker ───────────────────
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (userLocation) {
      if (!userMarkerRef.current) {
        // Create user marker
        const iconHtml = `
          <div class="relative flex h-6 w-6 items-center justify-center">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-4 w-4 bg-blue-500 border-2 border-white shadow-md"></span>
          </div>
        `;
        const icon = L.divIcon({
          html: iconHtml,
          className: '',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        userMarkerRef.current = L.marker([userLocation.lat, userLocation.lon], { icon, zIndexOffset: 1000 }).addTo(map);
        userMarkerRef.current.bindPopup('<div style="font-family:Inter;font-weight:600;font-size:12px;">📍 You are here</div>');
      } else {
        userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lon]);
      }
    } else if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }
  }, [userLocation]);

  // ── Draw evacuation route ─────────────────────────
  const drawRoute = useCallback(async (from, to) => {
    const map = mapInstance.current;
    if (!map) return;

    try {
      const data = await routingApi.getRoute(from, to);
      const route = data.routes?.[0];
      if (!route?.geometry) return;

      // Remove existing route layer if any
      if (map._routeLayer) map.removeLayer(map._routeLayer);

      map._routeLayer = L.geoJSON(route.geometry, {
        style: {
          color: '#4d7bff',
          weight: 4,
          opacity: 0.9,
          dashArray: '8 4',
        },
      }).addTo(map);

      map.fitBounds(map._routeLayer.getBounds(), { padding: [40, 40] });
    } catch (e) {
      console.error('[Map] Route fetch failed:', e.message);
    }
  }, []);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div
        ref={mapRef}
        id="disaster-map"
        style={{ height: '100%', width: '100%' }}
        aria-label="Disaster event map"
      />
      {/* 🇮🇳 India state boundaries */}
      {mapReady && <IndiaMapLayer map={mapInstance.current} />}
      {/* 🏔️ BIS Seismic zone overlay */}
      {mapReady && <SeismicZoneLayer map={mapInstance.current} visible={filters.showSeismicZones !== false} />}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────
function getSeverityColor(s) {
  return { Critical: '#fca5a5', High: '#fcd34d', Medium: '#93c5fd', Low: '#6ee7b7' }[s] || '#94a3b8';
}
function getSeverityBg(s) {
  return { Critical: '#7f1d1d', High: '#78350f', Medium: '#1e3a5f', Low: '#064e3b' }[s] || '#1e293b';
}
