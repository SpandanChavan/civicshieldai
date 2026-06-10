import { useState } from 'react';
import { useTranslation } from '@/utils/i18n';

// ── NDRF Battalion data ─────────────────────────────────
const NDRF_BATTALIONS = [
  { id: 1,  name: '1st Battalion',  location: 'Guwahati, Assam',          state: 'Assam',          phone: '0361-2529700' },
  { id: 2,  name: '2nd Battalion',  location: 'Kolkata, West Bengal',      state: 'West Bengal',    phone: '033-25285999' },
  { id: 3,  name: '3rd Battalion',  location: 'Mundali, Odisha',           state: 'Odisha',         phone: '0671-2700211' },
  { id: 4,  name: '4th Battalion',  location: 'Arakkonam, Tamil Nadu',     state: 'Tamil Nadu',     phone: '04177-222040' },
  { id: 5,  name: '5th Battalion',  location: 'Pune, Maharashtra',         state: 'Maharashtra',    phone: '020-27695100' },
  { id: 6,  name: '6th Battalion',  location: 'Vadodara, Gujarat',         state: 'Gujarat',        phone: '0265-2681052' },
  { id: 7,  name: '7th Battalion',  location: 'Bhatinda, Punjab',          state: 'Punjab',         phone: '0164-2243900' },
  { id: 8,  name: '8th Battalion',  location: 'Ghaziabad, UP',             state: 'Uttar Pradesh',  phone: '0120-2782100' },
  { id: 9,  name: '9th Battalion',  location: 'Patna, Bihar',              state: 'Bihar',          phone: '0612-2222100' },
  { id: 10, name: '10th Battalion', location: 'Vijaywada, Andhra Pradesh', state: 'Andhra Pradesh', phone: '0866-2438100' },
  { id: 11, name: '11th Battalion', location: 'Varanasi, UP',              state: 'Uttar Pradesh',  phone: '0542-2508100' },
  { id: 12, name: '12th Battalion', location: 'Itanagar, Arunachal',       state: 'Arunachal Pradesh', phone: '0360-2212399' },
  { id: 13, name: '13th Battalion', location: 'Rishikesh, Uttarakhand',    state: 'Uttarakhand',    phone: '0135-2431900' },
  { id: 14, name: '14th Battalion', location: 'Bhanu, Himachal Pradesh',   state: 'Himachal Pradesh', phone: '01792-276100' },
  { id: 15, name: '15th Battalion', location: 'Nagpur, Maharashtra',       state: 'Maharashtra',    phone: '0712-2595100' },
];

// ── State emergency helpline numbers ──
const STATE_HELPLINES = [
  { state: 'Maharashtra',     sdrf: '1077',  police: '100', fire: '101' },
  { state: 'Delhi',           sdrf: '1077',  police: '100', fire: '101' },
  { state: 'West Bengal',     sdrf: '1077',  police: '100', fire: '101' },
  { state: 'Tamil Nadu',      sdrf: '1077',  police: '100', fire: '104' },
  { state: 'Telangana',       sdrf: '1077',  police: '100', fire: '101' },
  { state: 'Karnataka',       sdrf: '1070',  police: '100', fire: '101' },
  { state: 'Gujarat',         sdrf: '1070',  police: '100', fire: '101' },
  { state: 'Rajasthan',       sdrf: '1077',  police: '100', fire: '101' },
  { state: 'Uttar Pradesh',   sdrf: '1077',  police: '100', fire: '101' },
  { state: 'Bihar',           sdrf: '1070',  police: '100', fire: '101' },
  { state: 'Odisha',          sdrf: '1070',  police: '100', fire: '101' },
  { state: 'Assam',           sdrf: '1077',  police: '100', fire: '101' },
  { state: 'Uttarakhand',     sdrf: '1070',  police: '100', fire: '101' },
  { state: 'Kerala',          sdrf: '1070',  police: '100', fire: '101' },
  { state: 'Madhya Pradesh',  sdrf: '1077',  police: '100', fire: '101' },
  { state: 'Andhra Pradesh',  sdrf: '1070',  police: '100', fire: '101' },
  { state: 'Punjab',          sdrf: '1077',  police: '100', fire: '101' },
  { state: 'Himachal Pradesh',sdrf: '1077',  police: '100', fire: '101' },
  { state: 'Chhattisgarh',    sdrf: '1077',  police: '100', fire: '101' },
  { state: 'Jharkhand',       sdrf: '1077',  police: '100', fire: '101' },
];

/**
 * NDRFPanel — India-specific emergency resources panel.
 * Replaces the generic resource panel with NDRF battalions,
 * state SDRF helplines and the national 1078 disaster helpline.
 */
export default function NDRFPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('helplines'); // 'helplines' | 'battalions' | 'state'
  const [search, setSearch] = useState('');

  const filteredBattalions = NDRF_BATTALIONS.filter((b) =>
    b.location.toLowerCase().includes(search.toLowerCase()) ||
    b.state.toLowerCase().includes(search.toLowerCase())
  );

  const filteredStates = STATE_HELPLINES.filter((s) =>
    s.state.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3">

      {/* ── National Helpline Banner ── */}
      <div className="rounded-xl overflow-hidden border border-red-500/30 bg-red-500/10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-red-300 font-semibold uppercase tracking-wider">
              🆘 {t('ndrf.helpline')}
            </p>
            <p className="text-3xl font-black text-white mt-0.5">1078</p>
            <p className="text-xs text-slate-400 mt-0.5">NDMA Disaster Management</p>
          </div>
          <a
            href="tel:1078"
            id="call-ndma-btn"
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all duration-200 hover:scale-105"
          >
            📞 {t('ndrf.call')}
          </a>
        </div>
        <div className="px-4 pb-3 flex gap-3 text-xs text-slate-400">
          <span>🚑 Ambulance: <strong className="text-white">108</strong></span>
          <span>🚒 Fire: <strong className="text-white">101</strong></span>
          <span>👮 Police: <strong className="text-white">100</strong></span>
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex rounded-xl overflow-hidden border border-white/10 text-xs font-semibold">
        {[
          { key: 'helplines',  label: '📋 State Helplines' },
          { key: 'battalions', label: '🪖 ' + t('ndrf.battalions') },
        ].map(({ key, label }) => (
          <button
            key={key}
            id={`ndrf-tab-${key}`}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 transition-all duration-200 ${
              tab === key
                ? 'bg-brand-600/30 text-brand-300'
                : 'text-slate-500 hover:text-white hover:bg-white/5'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Search ── */}
      <input
        id="ndrf-search"
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={tab === 'battalions' ? 'Search by state or city...' : 'Search state...'}
        className="input text-sm"
      />

      {/* ── Content ── */}
      <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">

        {/* State Helplines */}
        {tab === 'helplines' && filteredStates.map((s) => (
          <div
            key={s.state}
            id={`sdrf-${s.state.toLowerCase().replace(/\s+/g, '-')}`}
            className="glass-card flex items-center justify-between gap-2 py-2.5"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{s.state}</p>
              <div className="flex gap-3 mt-0.5">
                <span className="text-xs text-slate-500">SDRF: <strong className="text-amber-400">{s.sdrf}</strong></span>
              </div>
            </div>
            <a
              href={`tel:${s.sdrf}`}
              className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg transition-all duration-200 font-semibold"
            >
              📞 {s.sdrf}
            </a>
          </div>
        ))}

        {/* NDRF Battalions */}
        {tab === 'battalions' && filteredBattalions.map((b) => (
          <div
            key={b.id}
            id={`ndrf-battalion-${b.id}`}
            className="glass-card flex items-start justify-between gap-2 py-2.5"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">NDRF {b.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">📍 {b.location}</p>
            </div>
            <a
              href={`tel:${b.phone}`}
              className="text-xs bg-brand-500/10 border border-brand-500/30 text-brand-400 hover:bg-brand-500/20 px-2.5 py-1.5 rounded-lg transition-all duration-200 font-mono whitespace-nowrap"
            >
              {b.phone}
            </a>
          </div>
        ))}

        {(tab === 'helplines' ? filteredStates : filteredBattalions).length === 0 && (
          <p className="text-center text-slate-500 text-sm py-6">No results for "{search}"</p>
        )}
      </div>
    </div>
  );
}
