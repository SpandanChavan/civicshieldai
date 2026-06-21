import { useTranslation } from '@/utils/i18n';
import { CloudLightning } from 'lucide-react';

/**
 * IMDLegend — Shows IMD's official 4-colour warning system on the map.
 * Positioned bottom-right of the map area.
 */
const IMD_LEVELS = [
  {
    key:   'red',
    color: '#ef4444',
    bg:    'bg-red-500/20',
    border:'border-red-500/40',
    text:  'text-red-300',
    dot:   'bg-red-500',
    label: 'imd.red',
    action:'Take action immediately',
    action_hi: 'तुरंत कार्रवाई करें',
  },
  {
    key:   'orange',
    color: '#f97316',
    bg:    'bg-orange-500/20',
    border:'border-orange-500/40',
    text:  'text-orange-300',
    dot:   'bg-orange-500',
    label: 'imd.orange',
    action:'Be prepared',
    action_hi: 'तैयार रहें',
  },
  {
    key:   'yellow',
    color: '#eab308',
    bg:    'bg-yellow-500/20',
    border:'border-yellow-500/40',
    text:  'text-yellow-300',
    dot:   'bg-yellow-400',
    label: 'imd.yellow',
    action:'Stay updated',
    action_hi: 'अपडेट रहें',
  },
  {
    key:   'green',
    color: '#22c55e',
    bg:    'bg-green-500/10',
    border:'border-green-500/30',
    text:  'text-green-400',
    dot:   'bg-green-500',
    label: 'imd.green',
    action:'No action needed',
    action_hi: 'कोई कार्रवाई नहीं',
  },
];

export default function IMDLegend() {
  const { t, lang } = useTranslation();

  return (
    <div
      className="glass rounded-xl p-3 pointer-events-auto"
      style={{ minWidth: 190, maxWidth: 220 }}
      aria-label="IMD Warning Level Legend"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-white/10">
        <CloudLightning size={16} className="text-slate-300" />
        <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
          {t('map.legend')}
        </span>
      </div>

      {/* Legend rows */}
      <div className="space-y-1.5">
        {IMD_LEVELS.map((level) => (
          <div
            key={level.key}
            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg border ${level.bg} ${level.border}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${level.dot}`} />
            <div className="min-w-0">
              <p className={`text-xs font-semibold leading-tight ${level.text}`}>
                {t(level.label)}
              </p>
              <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                {lang === 'hi' ? level.action_hi : level.action}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* IMD attribution */}
      <p className="text-[9px] text-slate-600 mt-2 text-center">
        Source: India Meteorological Dept.
      </p>
    </div>
  );
}
