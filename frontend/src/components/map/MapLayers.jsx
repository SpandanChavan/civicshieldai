import { useState, useRef, useEffect } from 'react';
import useAppStore from '@/store/useAppStore';
import PinSearch from './PinSearch';
import { Globe, MapPin, Mountain, Filter, Layers, ChevronDown, X, Map } from 'lucide-react';

const EVENT_TYPES = [
  'all', 'Earthquake', 'Wildfire', 'Flood', 'Cyclone', 
  'Tsunami', 'Volcano', 'Landslide', 'Drought', 'Heatwave', 'Cold Wave'
];

const SEVERITIES = ['all', 'Critical', 'High', 'Medium', 'Low'];

export default function MapLayers() {
  const events = useAppStore((s) => s.events);
  const filters = useAppStore((s) => s.filters);
  const setFilter = useAppStore((s) => s.setFilter);
  const clearStateFilter = useAppStore((s) => s.clearStateFilter);
  const setUserLocation = useAppStore((s) => s.setUserLocation);
  
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [layersMenuOpen, setLayersMenuOpen] = useState(false);
  const filterMenuRef = useRef(null);
  const layersMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) setFilterMenuOpen(false);
      if (layersMenuRef.current && !layersMenuRef.current.contains(e.target)) setLayersMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fitAllEvents = () => {
    const map = window.__civicshieldMap;
    if (!map || !events.length) return;
    const coords = events.filter(e => typeof e.lat === 'number' && typeof e.lon === 'number').map(e => [e.lat, e.lon]);
    if (!coords.length) return;
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    coords.forEach(([lat, lon]) => {
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    });
    try { map.fitBounds([[minLat, minLon], [maxLat, maxLon]], { padding: [40, 40], maxZoom: 8 }); } catch (_) {}
  };

  const handleLocateMe = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          setUserLocation(loc);
          const map = window.__civicshieldMap;
          if (map) map.flyTo([loc.lat, loc.lon], 10, { duration: 1.2 });
        },
        (err) => alert('Cannot access location: ' + err.message)
      );
    }
  };

  return (
    <div className="absolute top-4 left-4 z-[1000] flex items-start gap-3 pointer-events-none">
      
      {/* 1. Global PinSearch */}
      <div className="pointer-events-auto shadow-xl rounded-xl">
        <PinSearch />
      </div>

      {/* 2. Main Map Action Bar */}
      <div className="flex gap-1.5 glass p-1.5 rounded-2xl shadow-xl pointer-events-auto">
        
        {/* Fit All Button */}
        <button
          onClick={fitAllEvents}
          title="Zoom to show all events worldwide"
          className="btn btn-ghost px-3 py-1.5 text-xs rounded-xl flex items-center gap-1.5"
        >
          <Globe size={14} /> Fit All <span className="opacity-50 text-[10px]">({events.filter(e => e.is_active).length})</span>
        </button>
        <div className="w-px h-6 bg-white/10 self-center mx-0.5"></div>
          
        <button
          onClick={() => {
            const map = window.__civicshieldMap;
            if (map) map.flyTo([22.5, 80.0], 5, { duration: 1.2 });
          }}
          title="Zoom to India"
          className="btn btn-ghost px-3 py-1.5 text-xs rounded-xl flex items-center gap-1.5"
        >
          <Map size={14} /> IN
        </button>
        <div className="w-px h-6 bg-white/10 self-center mx-0.5"></div>

        {/* Locate Me Button */}
        <button
          onClick={handleLocateMe}
          title="Zoom to my location"
          className="btn btn-ghost px-3 py-1.5 text-xs rounded-xl flex items-center gap-1.5"
        >
          <MapPin size={14} /> Me
        </button>
        <div className="w-px h-6 bg-white/10 self-center mx-0.5"></div>
          
        <div className="relative" ref={filterMenuRef}>
          <button
            onClick={() => {
              setFilterMenuOpen(!filterMenuOpen);
              setLayersMenuOpen(false);
            }}
            className={`btn btn-ghost px-3 py-1.5 text-xs rounded-xl flex items-center gap-1.5 ${filterMenuOpen || filters.eventType !== 'all' || filters.severity !== 'all' ? 'bg-white/10 text-white' : ''}`}
          >
            <Filter size={14} /> Filters <ChevronDown size={12} className={`transition-transform ${filterMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {/* Filters Popover */}
          {filterMenuOpen && (
            <div className="absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 glass rounded-2xl p-4 w-[300px] shadow-2xl animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Event Type</p>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {EVENT_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilter('eventType', type)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors border ${
                      filters.eventType === type
                        ? 'bg-brand-600 border-brand-500 text-white shadow-md shadow-brand-500/20'
                        : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {type === 'all' ? 'All Types' : type}
                  </button>
                ))}
              </div>
            
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2 px-1">Severity</p>
                <div className="flex flex-wrap gap-1.5">
                  {SEVERITIES.map((sev) => (
                    <button
                      key={sev}
                      onClick={() => setFilter('severity', sev)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors border ${
                        filters.severity === sev
                          ? 'bg-brand-600 border-brand-500 text-white shadow-md shadow-brand-500/20'
                          : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {sev === 'all' ? 'All' : (
                        <span className={`severity-${sev.toLowerCase()} flex items-center gap-1.5`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" /> {sev}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={layersMenuRef}>
          <button
            onClick={() => {
              setLayersMenuOpen(!layersMenuOpen);
              setFilterMenuOpen(false);
            }}
            className={`btn btn-ghost px-3 py-1.5 text-xs rounded-xl flex items-center gap-1.5 ${layersMenuOpen ? 'bg-white/10 text-white' : ''}`}
          >
            <Layers size={14} /> Layers <ChevronDown size={12} className={`transition-transform ${layersMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {/* Layers Popover */}
          {layersMenuOpen && (
            <div className="absolute top-[calc(100%+8px)] right-0 glass rounded-2xl p-4 w-[220px] shadow-2xl animate-in fade-in slide-in-from-top-2">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-3 px-1">Map Overlays</p>
              <div className="flex flex-col gap-1">
                {[
                  { key: 'showClusters',    label: 'Cluster Markers', icon: <Layers size={14} className="text-blue-400" /> },
                  { key: 'showResources',   label: 'Resources',       icon: <MapPin size={14} className="text-emerald-400" /> },
                  { key: 'showHeatmap',     label: 'Heat Map',        icon: <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-red-500 to-yellow-500" /> },
                  { key: 'showSeismicZones',label: 'Seismic Zones',   icon: <Mountain size={14} className="text-orange-400" /> },
                ].map(({ key, label, icon }) => (
                  <label key={key} className="flex items-center justify-between cursor-pointer p-2 rounded-lg hover:bg-white/5 transition-colors group">
                    <div className="flex items-center gap-2.5">
                      {icon}
                      <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">{label}</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={filters[key] ?? (key === 'showSeismicZones' ? true : filters[key])}
                      onChange={(e) => setFilter(key, e.target.checked)}
                      className="accent-brand-500 w-4 h-4 rounded border-white/20 bg-white/10"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
