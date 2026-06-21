import { useState, useMemo } from 'react';
import { useTranslation } from '@/utils/i18n';
import { Phone, ShieldAlert, HeartPulse, HardHat, Siren, MapPin, Search } from 'lucide-react';

// ── NDRF Battalion data ─────────────────────────────────
const NDRF_BATTALIONS = [
  { id: 1,  name: '1st Battalion',  location: 'Guwahati, Assam',          state: 'Assam',          phone: '0361-2529700' },
  { id: 2,  name: '2nd Battalion',  location: 'Kolkata, West Bengal',      state: 'West Bengal',    phone: '033-25285999' },
  { id: 3,  name: '3rd Battalion',  location: 'Mundali, Odisha',           state: 'Odisha',         phone: '06171-2700211' },
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

export default function NDRFPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('helplines');
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
      <div className="rounded-xl overflow-hidden border border-red-500/30 bg-red-500/10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-red-300 flex items-center gap-2 uppercase tracking-wider">
              <Phone size={16} /> {t('ndrf.helpline')}
            </h2>
            <p className="text-3xl font-black text-white mt-0.5">1078</p>
            <p className="text-xs text-slate-400 mt-0.5">NDMA Disaster Management</p>
          </div>
          <a
            href="tel:1078"
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
          >
            <Phone size={16} /> {t('ndrf.call')}
          </a>
        </div>
        <div className="px-4 pb-3 flex gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1"><Siren size={12} className="text-red-400"/> 108</span>
          <span className="flex items-center gap-1"><ShieldAlert size={12} className="text-amber-400"/> 101</span>
          <span className="flex items-center gap-1"><Phone size={12} className="text-blue-400"/> 100</span>
        </div>
      </div>

      <div className="flex bg-slate-900 p-1 rounded-xl border border-white/10">
        {[
          { key: 'helplines', label: t('ndrf.state_sdrf'), icon: HeartPulse },
          { key: 'battalions', label: t('ndrf.battalions'), icon: ShieldAlert },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
              tab === item.key ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-2.5 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
        {tab === 'helplines' && filteredStates.map((s) => (
          <div key={s.state} className="bg-slate-900/50 border border-white/5 p-3 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{s.state}</p>
              <p className="text-xs text-slate-500">SDRF Helpline</p>
            </div>
            <a href={`tel:${s.sdrf}`} className="text-amber-400 font-bold text-sm bg-amber-400/10 px-3 py-1 rounded-lg">
              {s.sdrf}
            </a>
          </div>
        ))}

        {tab === 'battalions' && filteredBattalions.map((b) => (
          <div key={b.id} className="bg-slate-900/50 border border-white/5 p-3 rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <HardHat size={20} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">NDRF {b.name}</p>
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <MapPin size={10} /> {b.location}
              </p>
            </div>
            <a href={`tel:${b.phone}`} className="text-indigo-400 font-mono text-xs bg-indigo-400/10 px-2 py-1 rounded">
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
