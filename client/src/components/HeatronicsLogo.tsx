// ----------------------------------------------------------------------------
// Heatronics brandmark — the "H": two vertical bars with a centred dot.
//
// Reproduced faithfully from the 2.0 brand kit (heatronics-brandmark colour
// variation 1), proportions measured from the master art. Drawn in
// currentColor so it inherits the brand orange (#FE4705) wherever it's used;
// keep the shape and colour unchanged per the brand guidelines.
// ----------------------------------------------------------------------------

export function HeatronicsMark({ className = 'h-6 w-auto' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 489 533"
      className={className}
      fill="currentColor"
      role="img"
      aria-label="Heatronics"
    >
      <rect x="0" y="0" width="99" height="533" />
      <rect x="391" y="0" width="98" height="533" />
      <circle cx="244.5" cy="266.5" r="63.5" />
    </svg>
  );
}

/** The full lockup: brandmark + "Heatronics" wordmark in the display face. */
export function HeatronicsLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <HeatronicsMark className="h-6 w-auto text-brand-500" />
      <span className="font-display font-bold text-lg tracking-tight text-slate-900">Heatronics</span>
    </span>
  );
}
