import { useState, useRef } from 'react';
import useAppStore from '@/store/useAppStore';
import { Search, MapPin, Mail, X, Loader2 } from 'lucide-react';

/**
 * PinSearch — India PIN code / district / city search bar.
 * Uses the free India POST API (no key required) for PIN code lookup.
 * Falls back to fuzzy matching against known city coordinates.
 */
export default function PinSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);
  const setFilter = useAppStore((s) => s.setFilter);

  async function handleSearch(val) {
    setQuery(val);
    setError('');
    if (!val.trim()) { setResults([]); return; }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setResults([]);

      try {
        // ── PIN code lookup (6-digit number) ─────────────
        if (/^\d{6}$/.test(val.trim())) {
          const res = await fetch(`https://api.postalpincode.in/pincode/${val.trim()}`);
          const data = await res.json();
          if (data?.[0]?.Status === 'Success') {
            const offices = data[0].PostOffice || [];
              setResults(offices.slice(0, 5).map((o) => ({
              label: `${o.Name}, ${o.District}, ${o.State}`,
              district: o.District,
              state: o.State,
              pincode: val.trim(),
              lat: null,
              lon: null,
              type: 'pincode',
            })));
          } else {
            setError('PIN code not found');
          }
        } else {
          // ── City / district name lookup ───────────────
          const matched = INDIA_CITIES.filter((c) =>
            c.name.toLowerCase().startsWith(val.toLowerCase()) ||
            c.district?.toLowerCase().startsWith(val.toLowerCase()) ||
            c.state.toLowerCase().includes(val.toLowerCase())
          ).slice(0, 6);
          if (matched.length > 0) {
            setResults(matched.map((c) => ({
              label: `${c.name}, ${c.state}`,
              district: c.district || c.name,
              state: c.state,
              lat: c.lat,
              lon: c.lon,
              type: 'city',
            })));
          } else {
            // ── Fallback to live OSM Nominatim search ────────
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val.trim())}&countrycodes=in&format=json&addressdetails=1&limit=5`);
            const data = await res.json();
            
            if (data && data.length > 0) {
              setResults(data.map((d) => {
                const city = d.address?.city || d.address?.town || d.address?.county || d.name;
                const state = d.address?.state || '';
                return {
                  label: `${city}${state ? `, ${state}` : ''}`,
                  district: d.address?.state_district || city,
                  state: state,
                  lat: parseFloat(d.lat),
                  lon: parseFloat(d.lon),
                  boundingbox: d.boundingbox,
                  type: 'city',
                };
              }));
            } else {
              setError('No results found');
            }
          }
        }
      } catch (e) {
        setError('Search failed — check connection');
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  async function selectResult(result) {
    setQuery(result.label);
    setResults([]);
    setError('');

    const map = window.__civicshieldMap;
    if (!map) return;

    // Set district/state filter for the sidebar immediately
    setFilter('stateFilter', result.state);
    window.dispatchEvent(new CustomEvent('india:stateclick', {
      detail: { stateName: result.state }
    }));

    if (result.boundingbox) {
      const bounds = [
        [parseFloat(result.boundingbox[0]), parseFloat(result.boundingbox[2])],
        [parseFloat(result.boundingbox[1]), parseFloat(result.boundingbox[3])]
      ];
      map.fitBounds(bounds, { padding: [40, 40], animate: true, duration: 1.2 });
      return;
    } else if (result.lat && result.lon) {
      map.flyTo([result.lat, result.lon], 9, { duration: 1.2 });
      return;
    }

    // Geocode the PIN code or district on the fly using free Nominatim API
    try {
      const queryStr = result.type === 'pincode' 
        ? `postalcode=${result.pincode}&countrycodes=in` 
        : `q=${encodeURIComponent(result.district + ', ' + result.state)}&countrycodes=in`;
        
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${queryStr}&format=json&limit=1`);
      const data = await res.json();
      
      if (data && data.length > 0) {
        const { lat, lon, boundingbox } = data[0];
        if (boundingbox) {
          // [south, north, west, east] — Leaflet fitBounds expects [[south, west], [north, east]]
          const bounds = [
            [parseFloat(boundingbox[0]), parseFloat(boundingbox[2])],
            [parseFloat(boundingbox[1]), parseFloat(boundingbox[3])]
          ];
          map.fitBounds(bounds, { padding: [40, 40], animate: true, duration: 1.2 });
        } else {
          map.flyTo([parseFloat(lat), parseFloat(lon)], 12, { duration: 1.2 });
        }
        return;
      }
    } catch (e) {
      console.warn("[Geocoding] Nominatim lookup failed:", e);
    }

    // Fallback to state capital if geocoding fails or returns no results
    const capital = STATE_CAPITALS[result.state];
    if (capital) map.flyTo(capital, 8, { duration: 1.2 });
  }

  function clearSearch() {
    setQuery('');
    setResults([]);
    setError('');
    setFilter('stateFilter', null);
  }

  return (
    <div className="relative font-sans" style={{ minWidth: 220 }}>
      {/* Input Box */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
        <input
          id="india-pin-search"
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search city, district or PIN..."
          className="input glass !pl-9 !pr-8"
          autoComplete="off"
        />
        
        {loading ? (
          <div className="absolute right-3 top-2.5">
            <Loader2 size={16} className="text-brand-500 animate-spin" />
          </div>
        ) : query ? (
          <button 
            onClick={clearSearch} 
            className="absolute right-2 top-2 p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={14} className="text-slate-400 hover:text-white" />
          </button>
        ) : null}
      </div>

      {/* Dropdown */}
      {(results.length > 0 || error) && (
        <div className="absolute top-[calc(100%+8px)] left-0 right-0 glass rounded-xl overflow-hidden shadow-2xl z-[2000] animate-in fade-in slide-in-from-top-2">
          {error && (
            <div className="p-3 text-xs text-slate-400 italic text-center">
              {error}
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => selectResult(r)}
              className={`w-full text-left p-3 flex items-center gap-3 transition-colors hover:bg-white/10 ${
                i !== results.length - 1 ? 'border-b border-white/5' : ''
              }`}
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                r.type === 'pincode' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'
              }`}>
                {r.type === 'pincode' ? <Mail size={12} /> : <MapPin size={12} />}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-semibold text-slate-200 leading-tight truncate">
                  {r.label.split(',')[0]}
                </span>
                <span className="text-xs font-medium text-slate-500 leading-tight truncate">
                  {r.label.substring(r.label.indexOf(',') + 1).trim()}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── State capitals for map fly-to ─────────────────────────────────
const STATE_CAPITALS = {
  'Maharashtra':        [18.9752, 72.8258],
  'Delhi':              [28.6139, 77.2090],
  'West Bengal':        [22.5726, 88.3639],
  'Tamil Nadu':         [13.0827, 80.2707],
  'Telangana':          [17.3850, 78.4867],
  'Karnataka':          [12.9716, 77.5946],
  'Gujarat':            [23.0225, 72.5714],
  'Rajasthan':          [26.9124, 75.7873],
  'Uttar Pradesh':      [26.8467, 80.9462],
  'Bihar':              [25.5941, 85.1376],
  'Madhya Pradesh':     [23.2599, 77.4126],
  'Odisha':             [20.2961, 85.8245],
  'Assam':              [26.1445, 91.7362],
  'Uttarakhand':        [30.3165, 78.0322],
  'Himachal Pradesh':   [31.1048, 77.1734],
  'Punjab':             [30.7333, 76.7794],
  'Haryana':            [30.6942, 76.9919],
  'Jharkhand':          [23.3441, 85.3096],
  'Chhattisgarh':       [21.2787, 81.8661],
  'Andhra Pradesh':     [17.6868, 83.2185],
  'Kerala':             [8.5241, 76.9366],
  'Goa':                [15.2993, 74.1240],
  'Arunachal Pradesh':  [27.0844, 93.6053],
  'Manipur':            [24.6637, 93.9063],
  'Meghalaya':          [25.5788, 91.8933],
  'Mizoram':            [23.1645, 92.9376],
  'Nagaland':           [25.6751, 94.1086],
  'Sikkim':             [27.5330, 88.5122],
  'Tripura':            [23.9408, 91.9882],
  'Jammu and Kashmir':  [34.0837, 74.7973],
  'Ladakh':             [34.1526, 77.5771],
  'Andaman and Nicobar':[11.6234, 92.7265],
  'Chandigarh':         [30.7333, 76.7794],
  'Puducherry':         [11.9416, 79.8083],
  'Lakshadweep':        [10.5667, 72.6417],
};

// ── Top 60 Indian cities for instant name search ──────────────────
const INDIA_CITIES = [
  { name: 'Mumbai',      state: 'Maharashtra',  lat: 19.0760, lon: 72.8777 },
  { name: 'Delhi',       state: 'Delhi',         lat: 28.6139, lon: 77.2090 },
  { name: 'Bengaluru',   state: 'Karnataka',     lat: 12.9716, lon: 77.5946 },
  { name: 'Hyderabad',   state: 'Telangana',     lat: 17.3850, lon: 78.4867 },
  { name: 'Chennai',     state: 'Tamil Nadu',    lat: 13.0827, lon: 80.2707 },
  { name: 'Kolkata',     state: 'West Bengal',   lat: 22.5726, lon: 88.3639 },
  { name: 'Ahmedabad',   state: 'Gujarat',       lat: 23.0225, lon: 72.5714 },
  { name: 'Pune',        state: 'Maharashtra',   lat: 18.5204, lon: 73.8567 },
  { name: 'Jaipur',      state: 'Rajasthan',     lat: 26.9124, lon: 75.7873 },
  { name: 'Lucknow',     state: 'Uttar Pradesh', lat: 26.8467, lon: 80.9462 },
  { name: 'Kanpur',      state: 'Uttar Pradesh', lat: 26.4499, lon: 80.3319 },
  { name: 'Nagpur',      state: 'Maharashtra',   lat: 21.1458, lon: 79.0882 },
  { name: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.6868, lon: 83.2185 },
  { name: 'Bhopal',      state: 'Madhya Pradesh',lat: 23.2599, lon: 77.4126 },
  { name: 'Patna',       state: 'Bihar',         lat: 25.5941, lon: 85.1376 },
  { name: 'Surat',       state: 'Gujarat',       lat: 21.1702, lon: 72.8311 },
  { name: 'Indore',      state: 'Madhya Pradesh',lat: 22.7196, lon: 75.8577 },
  { name: 'Bhubaneswar', state: 'Odisha',        lat: 20.2961, lon: 85.8245 },
  { name: 'Guwahati',    state: 'Assam',         lat: 26.1445, lon: 91.7362 },
  { name: 'Dehradun',    state: 'Uttarakhand',   lat: 30.3165, lon: 78.0322 },
  { name: 'Shimla',      state: 'Himachal Pradesh', lat: 31.1048, lon: 77.1734 },
  { name: 'Chandigarh',  state: 'Chandigarh',    lat: 30.7333, lon: 76.7794 },
  { name: 'Amritsar',    state: 'Punjab',        lat: 31.6340, lon: 74.8723 },
  { name: 'Ranchi',      state: 'Jharkhand',     lat: 23.3441, lon: 85.3096 },
  { name: 'Raipur',      state: 'Chhattisgarh',  lat: 21.2787, lon: 81.8661 },
  { name: 'Thiruvananthapuram', state: 'Kerala', lat: 8.5241, lon: 76.9366 },
  { name: 'Kochi',       state: 'Kerala',        lat: 9.9312, lon: 76.2673 },
  { name: 'Coimbatore',  state: 'Tamil Nadu',    lat: 11.0168, lon: 76.9558 },
  { name: 'Madurai',     state: 'Tamil Nadu',    lat: 9.9252, lon: 78.1198 },
  { name: 'Varanasi',    state: 'Uttar Pradesh', lat: 25.3176, lon: 82.9739 },
  { name: 'Agra',        state: 'Uttar Pradesh', lat: 27.1767, lon: 78.0081 },
  { name: 'Meerut',      state: 'Uttar Pradesh', lat: 28.9845, lon: 77.7064 },
  { name: 'Jodhpur',     state: 'Rajasthan',     lat: 26.2389, lon: 73.0243 },
  { name: 'Udaipur',     state: 'Rajasthan',     lat: 24.5854, lon: 73.7125 },
  { name: 'Port Blair',  state: 'Andaman and Nicobar', lat: 11.6234, lon: 92.7265 },
  { name: 'Srinagar',    state: 'Jammu and Kashmir', lat: 34.0837, lon: 74.7973 },
  { name: 'Leh',         state: 'Ladakh',        lat: 34.1526, lon: 77.5771 },
  { name: 'Gangtok',     state: 'Sikkim',        lat: 27.3389, lon: 88.6065 },
  { name: 'Imphal',      state: 'Manipur',       lat: 24.8170, lon: 93.9368 },
  { name: 'Shillong',    state: 'Meghalaya',     lat: 25.5788, lon: 91.8933 },
  { name: 'Aizawl',      state: 'Mizoram',       lat: 23.7307, lon: 92.7173 },
  { name: 'Itanagar',    state: 'Arunachal Pradesh', lat: 27.0844, lon: 93.6053 },
  { name: 'Kohima',      state: 'Nagaland',      lat: 25.6751, lon: 94.1086 },
  { name: 'Agartala',    state: 'Tripura',       lat: 23.8315, lon: 91.2868 },
  { name: 'Panaji',      state: 'Goa',           lat: 15.4909, lon: 73.8278 },
  { name: 'Puducherry',  state: 'Puducherry',    lat: 11.9416, lon: 79.8083 },
];
