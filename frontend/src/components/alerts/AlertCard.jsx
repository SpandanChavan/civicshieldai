import { timeAgo } from '@/utils/formatDate';

const SEVERITY_ICONS = {
  Critical: '🔴',
  High:     '🟠',
  Medium:   '🟡',
  Low:      '🟢',
};

const TYPE_ICONS = {
  Earthquake: '🔴',
  Wildfire:   '🔥',
  Flood:      '🌊',
  Cyclone:    '🌀',
  Tsunami:    '🌊',
  Volcano:    '🌋',
};

export default function AlertCard({ event, onClick }) {
  const icon = TYPE_ICONS[event.event_type] || '⚠️';
  const sevIcon = SEVERITY_ICONS[event.severity] || '⚪';
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
        <span className="text-2xl flex-shrink-0 mt-0.5" aria-hidden="true">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={severityClass}>{sevIcon} {event.severity}</span>
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
