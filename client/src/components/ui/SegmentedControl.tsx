// Segmented control — a single-choice toggle group (grain, slice, density).
// The selected option sits on a raised white chip over a slate track.

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
      role="tablist"
      aria-label={rest['aria-label']}
      className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-100 p-1"
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={
              `${pad} rounded-lg font-semibold transition-colors ` +
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
