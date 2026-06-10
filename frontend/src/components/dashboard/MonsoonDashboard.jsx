import { useMemo } from 'react';
import useAppStore from '@/store/useAppStore';
import { useTranslation } from '@/utils/i18n';

// Monsoon active: June 1 – September 30
function isMonsoonSeason() {
  const month = new Date().getMonth(); // 0-indexed
  return month >= 5 && month <= 8;    // June=5, September=8
}

// Basin-wise flood risk data (static — updated by IMD in real life)
const RIVER_BASINS = [
  { name: 'Brahmaputra',   risk: 'High',   states: ['Assam', 'Arunachal Pradesh'] },
  { name: 'Ganga',         risk: 'High',   states: ['UP', 'Bihar', 'West Bengal'] },
  { name: 'Mahanadi',      risk: 'Medium', states: ['Odisha', 'Chhattisgarh'] },
  { name: 'Godavari',      risk: 'Medium', states: ['Telangana', 'Andhra Pradesh'] },
  { name: 'Krishna',       risk: 'Low',    states: ['Karnataka', 'Andhra Pradesh'] },
  { name: 'Narmada',       risk: 'Low',    states: ['Madhya Pradesh', 'Gujarat'] },
];

const RISK_STYLES = {
  High:   { bg: 'bg-red-500/15', border: 'border-red-500/30', dot: 'bg-red-500',    text: 'text-red-300' },
  Medium: { bg: 'bg-orange-500/15', border: 'border-orange-500/30', dot: 'bg-orange-400', text: 'text-orange-300' },
  Low:    { bg: 'bg-green-500/10', border: 'border-green-500/25', dot: 'bg-green-500',  text: 'text-green-400' },
};

/**
 * MonsoonDashboard — seasonal widget active June–September.
 * Shows basin-wise flood risk, monsoon onset status, and active flood events.
 */
export default function MonsoonDashboard() {
  const { t, lang } = useTranslation();
  const events = useAppStore((s) => s.events);
  const monsoon = isMonsoonSeason();

  // Count active flood events
  const floodEvents = useMemo(
    () => events.filter((e) => e.is_active && (e.event_type === 'Flood' || e.event_type === 'Heatwave')),
    [events]
  );

  const floodCount    = floodEvents.filter((e) => e.event_type === 'Flood').length;
  const heatwaveCount = floodEvents.filter((e) => e.event_type === 'Heatwave').length;

  // IMD monsoon onset dates (approximate normal dates)
  const ONSET_DATES = [
    { region: 'Kerala',        normal: 'Jun 1' },
    { region: 'NE India',      normal: 'Jun 5' },
    { region: 'Central India', normal: 'Jun 15' },
    { region: 'Delhi/NCR',     normal: 'Jun 27' },
    { region: 'Rajasthan',     normal: 'Jul 1'  },
  ];

  if (!monsoon) {
    // Off-season: show next monsoon countdown
    const today = new Date();
    const nextMonsoon = new Date(today.getFullYear() + (today.getMonth() >= 9 ? 1 : 0), 5, 1);
    const daysUntil = Math.ceil((nextMonsoon - today) / (1000 * 60 * 60 * 24));

    return (
      <div className="glass-card">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">☀️</span>
          <div>
            <p className="text-sm font-bold text-white">{t('monsoon.watch')}</p>
            <p className="text-xs text-slate-400">Next monsoon in <strong className="text-brand-400">{daysUntil} days</strong></p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {ONSET_DATES.slice(0, 4).map((o) => (
            <div key={o.region} className="glass rounded-lg px-2 py-1.5">
              <p className="text-slate-400">{o.region}</p>
              <p className="text-white font-semibold">{o.normal}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Season Banner ── */}
      <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌧️</span>
            <div>
              <p className="text-sm font-bold text-blue-300">{t('monsoon.active')}</p>
              <p className="text-xs text-slate-400">Jun 1 – Sep 30 · IMD Monitoring Active</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-white">{floodCount}</p>
            <p className="text-xs text-slate-400">Flood alerts</p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            { label: 'Floods',    value: floodCount,    color: 'text-blue-300' },
            { label: 'Heatwaves', value: heatwaveCount, color: 'text-orange-300' },
            { label: 'Basins at risk', value: RIVER_BASINS.filter(b => b.risk === 'High').length, color: 'text-red-300' },
          ].map((s) => (
            <div key={s.label} className="glass rounded-lg px-2 py-1.5 text-center">
              <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── River Basin Flood Risk ── */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
          🌊 River Basin Risk
        </p>
        <div className="space-y-1.5">
          {RIVER_BASINS.map((basin) => {
            const style = RISK_STYLES[basin.risk];
            return (
              <div
                key={basin.name}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border ${style.bg} ${style.border}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                  <div>
                    <p className="text-xs font-semibold text-white">{basin.name}</p>
                    <p className="text-[10px] text-slate-500">{basin.states.join(', ')}</p>
                  </div>
                </div>
                <span className={`text-xs font-bold ${style.text}`}>{basin.risk}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Monsoon Onset Dates ── */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
          📅 {t('monsoon.onset')} (Normal Dates)
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {ONSET_DATES.map((o) => (
            <div key={o.region} className="glass rounded-lg px-2.5 py-2">
              <p className="text-[10px] text-slate-400">{o.region}</p>
              <p className="text-xs font-bold text-blue-300">{o.normal}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Source attribution */}
      <p className="text-[9px] text-slate-600 text-center">
        Data: IMD · NDMA · Central Water Commission
      </p>
    </div>
  );
}
