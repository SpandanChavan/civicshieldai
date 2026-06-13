/**
 * Reusable loading spinner.
 *
 * @param {string}  size    - 'sm' | 'md' | 'lg'  (default: 'md')
 * @param {string}  label   - Accessible screen-reader label (default: 'Loading…')
 * @param {boolean} center  - If true, wraps in a centred flex container
 */
export default function LoadingSpinner({ size = 'md', label = 'Loading…', center = true }) {
  const sizeMap = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' };
  const spinner = (
    <div
      role="status"
      aria-label={label}
      className={`spinner ${sizeMap[size] || sizeMap.md}`}
    />
  );

  if (center) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        {spinner}
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    );
  }

  return spinner;
}
