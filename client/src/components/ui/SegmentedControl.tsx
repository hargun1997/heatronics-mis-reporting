// Segmented control — a single-choice toggle group (grain, slice, density).
// The selected option sits on a raised white chip over a slate track. Toggle buttons (aria-pressed, MASTER.md),
// 44px tall on phones so a thumb hits the right one.

interface Option<T extends string> {
  id: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  'aria-label'?: string;
}

export function SegmentedControl<T extends string>({
  options, value, onChange, size = 'md', ...rest
}: SegmentedControlProps<T>) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-[13px]';
  return (
    <div
      role="group"
      aria-label={rest['aria-label']}
      className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-100 p-1"
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={
              `${pad} min-h-11 sm:min-h-0 rounded-lg font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ` +
              (on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
