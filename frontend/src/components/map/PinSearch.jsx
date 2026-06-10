import { useState, useRef } from 'react';
import useAppStore from '@/store/useAppStore';

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
          setResults(matched.map((c) => ({
            label: `${c.name}, ${c.state}`,
            district: c.district || c.name,
            state: c.state,
            lat: c.lat,
            lon: c.lon,
            type: 'city',
          })));
          if (!matched.length) setError('No results found');
        }
      } catch (e) {
        setError('Search failed — check connection');
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  function selectResult(result) {
    setQuery(result.label);
    setResults([]);
    setError('');

    const map = window.__civicshieldMap;
    if (!map) return;

    if (result.lat && result.lon) {
      map.flyTo([result.lat, result.lon], 9, { duration: 1.2 });
    } else if (result.state) {
      // Try to fly to state capital
      const capital = STATE_CAPITALS[result.state];
      if (capital) map.flyTo(capital, 8, { duration: 1.2 });
    }

    // Set district/state filter
    setFilter('stateFilter', result.state);
    window.dispatchEvent(new CustomEvent('india:stateclick', {
      detail: { stateName: result.state }
    }));
  }

  function clearSearch() {
    setQuery('');
    setResults([]);
    setError('');
    setFilter('stateFilter', null);
  }

  return (
    <div className="relative" style={{ minWidth: 220 }}>
      {/* Input */}
      <div className="glass rounded-xl flex items-center gap-2 px-3 py-2">
        <span style={{ fontSize: 14 }}>🔍</span>
        <input
          id="india-pin-search"
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search city, district or PIN..."
          className="bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none flex-1"
          style={{ minWidth: 0 }}
          autoComplete="off"
        />
        {query && (
          <button
            onClick={clearSearch}
            className="text-slate-500 hover:text-slate-300 text-xs"
            title="Clear"
          >✕</button>
        )}
        {loading && (
          <span className="text-slate-500 text-xs animate-pulse">...</span>
        )}
      </div>

      {/* Dropdown */}
      {(results.length > 0 || error) && (
        <div className="absolute top-full left-0 right-0 mt-1 glass rounded-xl overflow-hidden z-[2000] shadow-lg">
          {error && (
            <div className="px-3 py-2 text-xs text-slate-400 italic">{error}</div>
          )}
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => selectResult(r)}
              className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0 flex items-center gap-2"
            >
              <span>{r.type === 'pincode' ? '📮' : '📍'}</span>
              <span>{r.label}</span>
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
