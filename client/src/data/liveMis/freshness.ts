// ----------------------------------------------------------------------------
// Connector freshness — "is every source up to date, and through what date is
// the whole MIS actually live?"
//
// Each connector reports a through-date (latest day it has data for), from its
// live API pull or its uploaded report, whichever feeds it. A connector is
// FRESH (green) when that reaches the target (yesterday, allowing a one-day
// settlement lag) and STALE (orange) when it lags behind. The system is only
// as live as its weakest link, so the headline "data live through" is the
// EARLIEST through-date across every connector that has data — beyond that day
// some source is missing, so the combined numbers aren't complete.
// ----------------------------------------------------------------------------

import type { DailyFact } from './facts';
import type { UploadStore } from './uploadParsers';
import type { ConnectorInfo, ConnectorGroup, ConnectorMode } from '../monthClose/connectorsClient';

export type FreshnessStatus = 'fresh' | 'stale' | 'none';

export interface ConnectorFreshness {
  id: string;
  label: string;
  mode: ConnectorMode;
  group: ConnectorGroup;
  /** Latest date this source has data for, or null if none. */
  through: string | null;
  rows: number;
  status: FreshnessStatus;
  /** Days behind the target when stale; null otherwise. */
  daysBehind: number | null;
  fedBy: 'upload' | 'api' | null;
}

export interface SystemFreshness {
  /** The date we expect data through (today − lagDays). */
  target: string;
  /** Earliest through-date across contributing connectors — the MIS is complete only to here. */
  liveThrough: string | null;
  fresh: number;
  stale: number;
  none: number;
  total: number;
  connectors: ConnectorFreshness[];
}

const DAY = 86400000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Whole days from a → b (b later ⇒ positive). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY);
}

export function computeFreshness(
  connectors: ConnectorInfo[],
  apiFacts: DailyFact[],
  uploads: UploadStore,
  opts?: { now?: Date; lagDays?: number },
): SystemFreshness {
  const now = opts?.now ?? new Date();
  const lag = opts?.lagDays ?? 1;
  const target = isoDay(new Date(now.getTime() - lag * DAY));

  // Latest date + row count per source from the live API facts.
  const apiThrough = new Map<string, { through: string; rows: number }>();
  for (const f of apiFacts) {
    if (!isDate(f.date)) continue;
    const cur = apiThrough.get(f.source);
    if (!cur) apiThrough.set(f.source, { through: f.date, rows: 1 });
    else {
      cur.rows += 1;
      if (f.date > cur.through) cur.through = f.date;
    }
  }

  const rows: ConnectorFreshness[] = connectors.map((c) => {
    const up = uploads[c.id];
    let through: string | null = null;
    let count = 0;
    let fedBy: 'upload' | 'api' | null = null;

    if (up && up.facts.length) {
      // An upload is the source of truth for its connector (it carries fees /
      // refunds the API pull may not), so it wins over any API facts.
      const dates = up.facts.map((f) => f.date).filter(isDate).sort();
      through = dates[dates.length - 1] ?? null;
      count = up.facts.length;
      fedBy = 'upload';
    } else {
      const a = apiThrough.get(c.id);
      if (a) {
        through = a.through;
        count = a.rows;
        fedBy = 'api';
      }
    }

    const status: FreshnessStatus = !through ? 'none' : through >= target ? 'fresh' : 'stale';
    const daysBehind = status === 'stale' && through ? daysBetween(through, target) : null;
    return { id: c.id, label: c.label, mode: c.mode, group: c.group, through, rows: count, status, daysBehind, fedBy };
  });

  const contributing = rows.filter((r) => r.through);
  const liveThrough = contributing.length
    ? contributing.reduce((min, r) => (r.through! < min ? r.through! : min), contributing[0].through!)
    : null;

  return {
    target,
    liveThrough,
    fresh: rows.filter((r) => r.status === 'fresh').length,
    stale: rows.filter((r) => r.status === 'stale').length,
    none: rows.filter((r) => r.status === 'none').length,
    total: rows.length,
    connectors: rows,
  };
}

/** Tailwind dot class for a status — green fresh, orange stale, grey none. */
export const STATUS_DOT: Record<FreshnessStatus, string> = {
  fresh: 'bg-emerald-500',
  stale: 'bg-amber-500',
  none: 'bg-slate-300',
};

export const STATUS_LABEL: Record<FreshnessStatus, string> = {
  fresh: 'up to date',
  stale: 'out of sync',
  none: 'no data',
};
