// Stored Tally statements for Live MIS (Balance Sheet, Cash Flow, MIS Sheet cash rows), loaded once per 2 minutes.
import { useEffect, useMemo, useState } from 'react';
import { statements, type Parents, type StatementMonthIn } from '../../data/statements/statements';

export interface Resp { months: StatementMonthIn[]; parents?: Parents; lastOkAt: string | null; connected: boolean }

let cache: { at: number; p: Promise<Resp> } | null = null;
function load(): Promise<Resp> {
  if (cache && Date.now() - cache.at < 120_000) return cache.p;
  const p = fetch('/api/tally/statements').then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `${r.status}`); return j as Resp; });
  cache = { at: Date.now(), p };
  p.catch(() => { cache = null; });
  return p;
}

export function useStatements() {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { load().then(setData).catch((e) => setErr(e.message)); }, []);
  const built = useMemo(() => (data ? statements(data.months, data.parents) : null), [data]);
  return { data, built, err };
}

