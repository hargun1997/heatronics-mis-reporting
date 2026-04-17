type ViewMode = 'monthly' | 'weekly' | 'daily';

const MODES: { key: ViewMode; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'daily', label: 'Daily' },
];

export function ViewModeTabs({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
      {MODES.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            mode === key
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export type { ViewMode };
