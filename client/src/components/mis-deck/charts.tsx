import React, { useRef, useState, useLayoutEffect, useCallback } from 'react';

// ============================================================================
// Formatters
// ============================================================================

/** Format INR compactly: ₹1.23 Cr / ₹4.56 L / ₹789. */
export function inr(value: number, opts: { sign?: boolean } = {}): string {
  const sign = value < 0 ? '-' : opts.sign && value > 0 ? '+' : '';
  const a = Math.abs(value);
  let body: string;
  if (a >= 1e7) body = `₹${(a / 1e7).toFixed(2)} Cr`;
  else if (a >= 1e5) body = `₹${(a / 1e5).toFixed(2)} L`;
  else if (a >= 1e3) body = `₹${(a / 1e3).toFixed(1)}k`;
  else body = `₹${Math.round(a)}`;
  return sign + body;
}

/** Format INR in lakhs always (for axis ticks). */
export function inrLakh(value: number): string {
  return `${(value / 1e5).toFixed(value >= 1e7 ? 0 : 1)}L`;
}

/** Format a fraction as a percentage. */
export function pctStr(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !isFinite(value)) return '–';
  return `${(value * 100).toFixed(digits)}%`;
}

export function pctSigned(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !isFinite(value)) return '–';
  const s = value > 0 ? '+' : '';
  return `${s}${(value * 100).toFixed(digits)}%`;
}

// ============================================================================
// Palette
// ============================================================================

export const CHANNEL_COLORS: Record<string, string> = {
  D2C: '#4f46e5',     // indigo
  Amazon: '#f59e0b',  // amber
  Blinkit: '#eab308', // yellow
  OEM: '#0ea5e9',     // sky
  Offline: '#8b5cf6', // violet
  Export: '#ec4899',  // pink
};

// Neutral, categorical palette — deliberately avoids red/green value signalling.
export const SERIES_COLORS = ['#4f46e5', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

// Directional accents for +/- bars — indigo for up, muted slate for down (no red/green).
export const POS_COLOR = '#4f46e5';
export const NEG_COLOR = '#94a3b8';

// ============================================================================
// Measurement hook
// ============================================================================

function useMeasure(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const update = () => setW(el.clientWidth || 640);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ============================================================================
// Tooltip
// ============================================================================

interface TooltipState { x: number; y: number; content: React.ReactNode }

function Tooltip({ state, width }: { state: TooltipState | null; width: number }) {
  if (!state) return null;
  const left = Math.min(Math.max(state.x, 8), width - 8);
  const flip = state.x > width * 0.6;
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-lg bg-slate-900 text-white text-[11px] leading-snug px-2.5 py-1.5 shadow-lg whitespace-nowrap"
      style={{ left, top: state.y, transform: `translate(${flip ? '-100%' : '0'}, -50%)`, marginLeft: flip ? -8 : 8 }}
    >
      {state.content}
    </div>
  );
}

// ============================================================================
// Shared chart frame
// ============================================================================

const PAD = { top: 16, right: 16, bottom: 28, left: 44 };
const HEIGHT = 240;

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

// ============================================================================
// Line Chart (multi-series)
// ============================================================================

export interface LineSeries { name: string; color: string; values: (number | null)[] }

export function LineChart({
  labels, series, height = HEIGHT, yFormat = inrLakh, valueFormat = inr, percent = false,
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  yFormat?: (n: number) => string;
  valueFormat?: (n: number) => string;
  percent?: boolean;
}) {
  const [ref, width] = useMeasure();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;

  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  let min = Math.min(0, ...all);
  let max = Math.max(0, ...all);
  if (max === min) max = min + 1;
  const niceTop = max > 0 ? niceMax(max) : max;
  const niceBot = min < 0 ? -niceMax(-min) : 0;
  const span = niceTop - niceBot || 1;

  const n = labels.length;
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - niceBot) / span) * innerH;

  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => niceBot + (span * i) / ticks);

  const onMove = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - PAD.left) / innerW) * (n - 1));
    const idx = Math.min(Math.max(i, 0), n - 1);
    setTip({
      x: x(idx), y: PAD.top + 4,
      content: (
        <div>
          <div className="font-semibold mb-0.5">{labels[idx]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} />
              <span className="text-slate-300">{s.name}:</span>
              <span className="font-medium">{s.values[idx] === null ? '–' : valueFormat(s.values[idx]!)}</span>
            </div>
          ))}
        </div>
      ),
    });
  }, [innerW, n, labels, series, valueFormat]);

  const labelStep = Math.ceil(n / Math.max(1, Math.floor(innerW / 56)));

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} onMouseMove={onMove} className="block">
        {/* gridlines */}
        {tickVals.map((tv, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(tv)} y2={y(tv)} stroke="#eef2f7" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(tv) + 3} textAnchor="end" className="fill-slate-400" fontSize={10}>
              {percent ? `${Math.round(tv * 100)}%` : yFormat(tv)}
            </text>
          </g>
        ))}
        {/* zero line */}
        {niceBot < 0 && <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="#cbd5e1" strokeWidth={1} />}
        {/* x labels */}
        {labels.map((lb, i) => (i % labelStep === 0 || i === n - 1) ? (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="fill-slate-400" fontSize={10}>{lb}</text>
        ) : null)}
        {/* series */}
        {series.map((s) => {
          const segs: string[] = [];
          let started = false;
          s.values.forEach((v, i) => {
            if (v === null) { started = false; return; }
            segs.push(`${started ? 'L' : 'M'}${x(i)},${y(v)}`);
            started = true;
          });
          return (
            <g key={s.name}>
              <path d={segs.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => v === null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={s.color} />
              ))}
            </g>
          );
        })}
        {tip && <line x1={tip.x} x2={tip.x} y1={PAD.top} y2={PAD.top + innerH} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />}
      </svg>
      <Tooltip state={tip} width={width} />
    </div>
  );
}

// ============================================================================
// Stacked Bar Chart (channels)
// ============================================================================

export function StackedBarChart({
  labels, keys, colors, data, height = HEIGHT, asShare = false,
}: {
  labels: string[];
  keys: string[];
  colors: Record<string, string>;
  data: Record<string, number>[]; // one record per label
  height?: number;
  asShare?: boolean;              // render as 0–100% share
}) {
  const [ref, width] = useMeasure();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const n = labels.length;

  const totals = data.map((d) => keys.reduce((s, k) => s + Math.max(0, d[k] || 0), 0));
  const rawMax = Math.max(1, ...totals);
  const top = asShare ? 1 : niceMax(rawMax);

  const bandW = innerW / Math.max(1, n);
  const barW = Math.min(34, bandW * 0.68);
  const xBand = (i: number) => PAD.left + bandW * i + bandW / 2;
  const yOf = (v: number) => PAD.top + innerH - (v / top) * innerH;

  const labelStep = Math.ceil(n / Math.max(1, Math.floor(innerW / 52)));
  const ticks = 4;

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} className="block">
        {Array.from({ length: ticks + 1 }, (_, i) => (top * i) / ticks).map((tv, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={width - PAD.right} y1={yOf(tv)} y2={yOf(tv)} stroke="#eef2f7" strokeWidth={1} />
            <text x={PAD.left - 6} y={yOf(tv) + 3} textAnchor="end" className="fill-slate-400" fontSize={10}>
              {asShare ? `${Math.round(tv * 100)}%` : inrLakh(tv)}
            </text>
          </g>
        ))}
        {labels.map((lb, i) => {
          const d = data[i];
          const total = asShare ? (totals[i] || 1) : 1;
          let acc = 0;
          return (
            <g key={i}
              onMouseMove={(e) => {
                const rect = (e.currentTarget.ownerSVGElement!.parentElement as HTMLElement).getBoundingClientRect();
                setTip({
                  x: e.clientX - rect.left, y: PAD.top + 4,
                  content: (
                    <div>
                      <div className="font-semibold mb-0.5">{labels[i]}</div>
                      {keys.map((k) => (d[k] ? (
                        <div key={k} className="flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full" style={{ background: colors[k] }} />
                          <span className="text-slate-300">{k}:</span>
                          <span className="font-medium">
                            {asShare ? pctStr((d[k] || 0) / (totals[i] || 1)) : inr(d[k] || 0)}
                          </span>
                        </div>
                      ) : null))}
                      {!asShare && <div className="mt-0.5 pt-0.5 border-t border-slate-700 text-slate-300">Total: <span className="text-white font-medium">{inr(totals[i])}</span></div>}
                    </div>
                  ),
                });
              }}
            >
              {/* invisible hover band */}
              <rect x={PAD.left + bandW * i} y={PAD.top} width={bandW} height={innerH} fill="transparent" />
              {keys.map((k) => {
                const v = Math.max(0, d[k] || 0);
                if (v <= 0) return null;
                const h = (v / total / top) * innerH;
                const yPos = PAD.top + innerH - acc - h;
                acc += h;
                return <rect key={k} x={xBand(i) - barW / 2} y={yPos} width={barW} height={Math.max(0, h)} fill={colors[k]} rx={1} />;
              })}
              {(i % labelStep === 0 || i === n - 1) && (
                <text x={xBand(i)} y={height - 8} textAnchor="middle" className="fill-slate-400" fontSize={10}>{lb}</text>
              )}
            </g>
          );
        })}
      </svg>
      <Tooltip state={tip} width={width} />
    </div>
  );
}

// ============================================================================
// Bar Chart (single series, +/- colored — for growth)
// ============================================================================

export function GrowthBarChart({
  labels, values, height = HEIGHT, format = pctSigned,
}: {
  labels: string[];
  values: (number | null)[];
  height?: number;
  format?: (n: number) => string;
}) {
  const [ref, width] = useMeasure();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const n = labels.length;

  const nums = values.filter((v): v is number => v !== null);
  let max = Math.max(0.0001, ...nums);
  let min = Math.min(0, ...nums);
  const top = niceMax(max);
  const bot = min < 0 ? -niceMax(-min) : 0;
  const span = top - bot || 1;

  const bandW = innerW / Math.max(1, n);
  const barW = Math.min(30, bandW * 0.6);
  const xBand = (i: number) => PAD.left + bandW * i + bandW / 2;
  const yOf = (v: number) => PAD.top + innerH - ((v - bot) / span) * innerH;
  const labelStep = Math.ceil(n / Math.max(1, Math.floor(innerW / 52)));

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} className="block">
        {Array.from({ length: 5 }, (_, i) => bot + (span * i) / 4).map((tv, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={width - PAD.right} y1={yOf(tv)} y2={yOf(tv)} stroke="#eef2f7" strokeWidth={1} />
            <text x={PAD.left - 6} y={yOf(tv) + 3} textAnchor="end" className="fill-slate-400" fontSize={10}>{Math.round(tv * 100)}%</text>
          </g>
        ))}
        <line x1={PAD.left} x2={width - PAD.right} y1={yOf(0)} y2={yOf(0)} stroke="#cbd5e1" strokeWidth={1} />
        {labels.map((lb, i) => {
          const v = values[i];
          return (
            <g key={i}
              onMouseMove={(e) => {
                const rect = (e.currentTarget.ownerSVGElement!.parentElement as HTMLElement).getBoundingClientRect();
                setTip({ x: e.clientX - rect.left, y: PAD.top + 4, content: (
                  <div><div className="font-semibold">{labels[i]}</div><div>{v === null ? '–' : format(v)}</div></div>
                ) });
              }}
            >
              <rect x={PAD.left + bandW * i} y={PAD.top} width={bandW} height={innerH} fill="transparent" />
              {v !== null && (
                <rect
                  x={xBand(i) - barW / 2}
                  y={v >= 0 ? yOf(v) : yOf(0)}
                  width={barW}
                  height={Math.max(1, Math.abs(yOf(v) - yOf(0)))}
                  fill={v >= 0 ? POS_COLOR : NEG_COLOR}
                  rx={1}
                />
              )}
              {(i % labelStep === 0 || i === n - 1) && (
                <text x={xBand(i)} y={height - 8} textAnchor="middle" className="fill-slate-400" fontSize={10}>{lb}</text>
              )}
            </g>
          );
        })}
      </svg>
      <Tooltip state={tip} width={width} />
    </div>
  );
}

// ============================================================================
// Donut Chart (channel mix)
// ============================================================================

export function DonutChart({
  data, colors, size = 200, format = pctStr,
}: {
  data: { key: string; value: number }[];
  colors: Record<string, string>;
  size?: number;
  format?: (n: number) => string;
}) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
  const r = size / 2;
  const inner = r * 0.6;
  let acc = 0;
  const cx = r, cy = r;
  const segments = data.filter((d) => d.value > 0).map((d) => {
    const frac = d.value / total;
    const a0 = acc * 2 * Math.PI - Math.PI / 2;
    acc += frac;
    const a1 = acc * 2 * Math.PI - Math.PI / 2;
    const large = frac > 0.5 ? 1 : 0;
    const p = (ang: number, rad: number) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
    const [x0, y0] = p(a0, r), [x1, y1] = p(a1, r);
    const [x2, y2] = p(a1, inner), [x3, y3] = p(a0, inner);
    return { key: d.key, frac, d: `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${inner},${inner} 0 ${large} 0 ${x3},${y3} Z` };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((s) => (
        <path key={s.key} d={s.d} fill={colors[s.key] || '#94a3b8'} stroke="#fff" strokeWidth={1.5}>
          <title>{`${s.key}: ${format(s.frac)}`}</title>
        </path>
      ))}
    </svg>
  );
}

// ============================================================================
// Waterfall Chart (margin bridge)
// ============================================================================

export interface WaterfallStep { label: string; value: number; type: 'total' | 'cost' }

export function WaterfallChart({ steps, height = 280 }: { steps: WaterfallStep[]; height?: number }) {
  const [ref, width] = useMeasure();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const pad = { top: 16, right: 16, bottom: 48, left: 44 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const n = steps.length;

  // running cumulative for cost steps
  let running = 0;
  const bars = steps.map((s) => {
    if (s.type === 'total') {
      const bar = { start: 0, end: s.value, ...s };
      running = s.value;
      return bar;
    }
    const start = running;
    const end = running + s.value; // s.value negative for costs
    running = end;
    return { start, end, ...s };
  });

  const maxV = Math.max(0, ...bars.map((b) => Math.max(b.start, b.end)));
  const minV = Math.min(0, ...bars.map((b) => Math.min(b.start, b.end)));
  const top = niceMax(maxV);
  const bot = minV < 0 ? -niceMax(-minV) : 0;
  const span = top - bot || 1;
  const bandW = innerW / Math.max(1, n);
  const barW = Math.min(48, bandW * 0.6);
  const xBand = (i: number) => pad.left + bandW * i + bandW / 2;
  const yOf = (v: number) => pad.top + innerH - ((v - bot) / span) * innerH;

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} className="block">
        {Array.from({ length: 5 }, (_, i) => bot + (span * i) / 4).map((tv, i) => (
          <g key={i}>
            <line x1={pad.left} x2={width - pad.right} y1={yOf(tv)} y2={yOf(tv)} stroke="#eef2f7" strokeWidth={1} />
            <text x={pad.left - 6} y={yOf(tv) + 3} textAnchor="end" className="fill-slate-400" fontSize={10}>{inrLakh(tv)}</text>
          </g>
        ))}
        <line x1={pad.left} x2={width - pad.right} y1={yOf(0)} y2={yOf(0)} stroke="#cbd5e1" strokeWidth={1} />
        {bars.map((b, i) => {
          const yTop = yOf(Math.max(b.start, b.end));
          const h = Math.max(1, Math.abs(yOf(b.start) - yOf(b.end)));
          const color = b.type === 'total' ? '#4f46e5' : b.value < 0 ? '#94a3b8' : '#a5b4fc';
          const words = b.label.split(' ');
          return (
            <g key={i}
              onMouseMove={(e) => {
                const rect = (e.currentTarget.ownerSVGElement!.parentElement as HTMLElement).getBoundingClientRect();
                setTip({ x: e.clientX - rect.left, y: yTop, content: (
                  <div><div className="font-semibold">{b.label}</div><div>{inr(b.value, { sign: b.type === 'cost' })}</div></div>
                ) });
              }}
            >
              <rect x={pad.left + bandW * i} y={pad.top} width={bandW} height={innerH} fill="transparent" />
              {i > 0 && <line x1={xBand(i - 1) + barW / 2} x2={xBand(i) - barW / 2} y1={yOf(bars[i - 1].end)} y2={yOf(bars[i - 1].end)} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="2 2" />}
              <rect x={xBand(i) - barW / 2} y={yTop} width={barW} height={h} fill={color} rx={1} opacity={b.type === 'total' ? 1 : 0.85} />
              {words.map((w, wi) => (
                <text key={wi} x={xBand(i)} y={height - 30 + wi * 11} textAnchor="middle" className="fill-slate-500" fontSize={9}>{w}</text>
              ))}
            </g>
          );
        })}
      </svg>
      <Tooltip state={tip} width={width} />
    </div>
  );
}

// ============================================================================
// Legend
// ============================================================================

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: it.color }} />
          {it.label}
        </div>
      ))}
    </div>
  );
}
