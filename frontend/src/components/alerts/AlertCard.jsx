import { timeAgo } from '@/utils/formatDate';
import { Activity, Flame, Waves, Wind, Mountain, AlertTriangle } from 'lucide-react';

const SEVERITY_COLORS = {
  Critical: 'bg-red-500',
  High:     'bg-orange-500',
  Medium:   'bg-amber-400',
  Low:      'bg-emerald-400',
};

const TYPE_ICONS = {
  Earthquake: Activity,
  Wildfire:   Flame,
  Flood:      Waves,
  Cyclone:    Wind,
  Tsunami:    Waves,
  Volcano:    Mountain,
  Landslide:  Mountain,
  default:    AlertTriangle,
};

export default function AlertCard({ event, onClick }) {
  const IconComponent = TYPE_ICONS[event.event_type] || TYPE_ICONS.default;
  const sevColor = SEVERITY_COLORS[event.severity] || 'bg-slate-400';
  const severityClass = `severity-${event.severity?.toLowerCase()}`;

  return (
    <article
      id={`event-card-${event.id}`}
      onClick={() => onClick?.(event)}
      className={`
        glass-card cursor-pointer transition-all duration-200
        hover:border-white/20 hover:bg-white/5 hover:scale-[1.01]
        animate-fade-in
      `}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(event)}
      aria-label={`${event.event_type} event: ${event.title}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1 flex-shrink-0 text-slate-300 bg-white/5 border border-white/10 p-2 rounded-xl">
          <IconComponent size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`flex items-center gap-1.5 ${severityClass}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${sevColor} shadow-[0_0_6px_currentColor]`} />
              {event.severity}
            </span>
            <span className="text-xs text-slate-500">{event.event_type}</span>
          </div>
          <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">
            {event.title}
          </h3>
          {event.description && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{event.description}</p>
          )}
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-slate-500">{timeAgo(event.detected_at)}</span>
            <span className="text-xs text-slate-600 bg-white/5 px-2 py-0.5 rounded">
              {event.source}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
