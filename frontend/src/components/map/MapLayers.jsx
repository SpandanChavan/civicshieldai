import useAppStore from '@/store/useAppStore';

const EVENT_TYPES = [
  'all', 'Earthquake', 'Wildfire', 'Flood',
  'Cyclone', 'Tsunami', 'Volcano', 'Landslide',
  'Drought', 'Natural Event',
];
const SEVERITIES = ['all', 'Critical', 'High', 'Medium', 'Low'];

function fitAllEvents() {
  // DisasterMap exposes the Leaflet instance on window for this purpose
  const map = window.__civicshieldMap;
  const events = useAppStore.getState().events;
  if (!map || !events.length) return;

  const coords = events
    .filter(e => typeof e.lat === 'number' && typeof e.lon === 'number')
    .map(e => [e.lat, e.lon]);

  if (coords.length === 0) return;
  try {
    const L = window.L || map.options._L;
    // Build bounds manually
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    coords.forEach(([lat, lon]) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    });
    map.fitBounds([[minLat, minLon], [maxLat, maxLon]], { padding: [40, 40], maxZoom: 8 });
  } catch (e) {
    console.warn('fitAllEvents failed:', e.message);
  }
}

export default function MapLayers() {
  const filters = useAppStore((s) => s.filters);
  const setFilter = useAppStore((s) => s.setFilter);
  const events = useAppStore((s) => s.events);

  return (
    <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2 pointer-events-auto">
      {/* Fit all button */}
      <button
        id="btn-fit-all"
        onClick={fitAllEvents}
        title="Zoom to show all events worldwide"
        className="glass rounded-xl px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2"
      >
        🌍 Fit All Events ({events.filter(e => e.is_active).length})
      </button>

      {/* Event Type Filter */}
      <div className="glass rounded-xl p-3 min-w-[160px]">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">Event Type</p>
        <div className="flex flex-col gap-1">
          {EVENT_TYPES.map((type) => (
            <button
              key={type}
              id={`filter-type-${type.replace(' ', '-')}`}
              onClick={() => setFilter('eventType', type)}
              className={`text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
                filters.eventType === type
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {type === 'all' ? 'All Types' : type}
            </button>
          ))}
        </div>
      </div>

      {/* Severity Filter */}
      <div className="glass rounded-xl p-3 min-w-[160px]">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">Severity</p>
        <div className="flex flex-col gap-1">
          {SEVERITIES.map((sev) => (
            <button
              key={sev}
              id={`filter-severity-${sev}`}
              onClick={() => setFilter('severity', sev)}
              className={`text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
                filters.severity === sev
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {sev === 'all' ? 'All' : (
                <span className={`severity-${sev.toLowerCase()}`}>{sev}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Toggle Options */}
      <div className="glass rounded-xl p-3">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">Layers</p>
        {[
          { key: 'showClusters',  label: 'Cluster Markers' },
          { key: 'showResources', label: 'Resources' },
          { key: 'showHeatmap',   label: 'Heat Map' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer py-1">
            <input
              id={`toggle-${key}`}
              type="checkbox"
              checked={filters[key]}
              onChange={(e) => setFilter(key, e.target.checked)}
              className="accent-brand-500 w-4 h-4"
            />
            <span className="text-sm text-slate-300">{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

