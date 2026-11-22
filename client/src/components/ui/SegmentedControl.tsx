// ViewSwitch (GUIDE.md "Tabs and views"): changes how ONE part shows its data. The selected option is a white thumb on a
// grey track (never a dark filled pill). Up to 5 options; more go into a select. ← → move between options. Toggle buttons (aria-pressed, MASTER.md),
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
  const pad = size === 'sm' ? 'px-2.5 text-label sm:min-h-8' : 'px-3.5 text-sm sm:min-h-9';
  return (
    <div
      role="group"
      aria-label={rest['aria-label']}
      className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-lg bg-slate-100 p-0.5"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const i = options.findIndex((o) => o.id === value);
        const n = options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
        e.preventDefault();
        onChange(n.id);
        (e.currentTarget.querySelectorAll('button')[options.indexOf(n)] as HTMLButtonElement | undefined)?.focus();
      }}
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
              `${pad} min-h-11 rounded-md font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ` +
              (on ? 'bg-white font-semibold text-slate-900 ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
