// Today — the page to open first. What needs you, five numbers, what moved since yesterday, what is coming.
// Reads GET /api/today (stored data only). Numbers first, then the numbered list; all on one screen.
// UI pass 22 Nov 2026: the work counts come from useWorkCount (same as the badge and Tasks); empty tiles fold into one;
// every tile opens its page; "Due soon" left (it repeated Tasks; the Tasks late tile says what is due this week).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { PageHeader, PageBody } from '../../components/ui/PageHeader';
import { KpiTile } from '../../components/ui/KpiTile';
import { BTN, Empty, ErrorBox, Loading, Panel, StepNo } from '../../components/ui/states';
import { SourceChip } from '../../components/ui/SourceChip';
import { StatusPill } from '../../components/ui/StatusPill';
import { useWorkCount, refreshWorkCount, type WorkCount } from '../../data/issues/useWorkCount';
import { inrShort as inr, dayLabel } from '../../utils/money';

interface Tile { id: string; label: string; value: number | null; unit: 'inr' | 'months' | 'count'; sub: string; tone: 'ok' | 'watch' | 'act'; delta: number | null }
interface Need { kind: 'watch' | 'fix' | 'task'; severity: 'high' | 'medium' | 'low'; title: string; why: string; href: string; inr: number | null }
interface Due { title: string; due: string; inDays: number; owners: string[]; href: string }
interface Change { id: string; text: string; direction: 'better' | 'worse' | 'same' | 'info' }
interface Brief {
  day: string; asOf: string; status: 'act' | 'watch' | 'ok'; statusLine: string; tiles: Tile[]; needsYou: Need[]; moreNeeds: number;
  dueSoon: Due[]; changed: Change[]; freshness: { line: string; stale: boolean; tallyLastOkAt?: string | null }; notes: string[];
}

const show = (t: Tile) => (t.value == null ? '—' : t.unit === 'inr' ? inr(t.value) : t.unit === 'months' ? `${t.value} mo` : String(t.value));
const tileDelta = (t: Tile) => (t.delta == null || t.delta === 0 ? null : t.unit === 'inr' ? inr(Math.abs(t.delta)) : String(Math.abs(t.delta)));
const TONE = {
  ok: 'text-emerald-700', watch: 'text-amber-700', act: 'text-red-700',
} as const;
const PILL = { act: { tone: 'critical', text: 'Act now' }, watch: { tone: 'warning', text: 'Watch' }, ok: { tone: 'positive', text: 'All clear' } } as const;
/** Where each tile opens (every overview tile clicks through to its detail). */
const TILE_HREF: Record<string, string> = {
  net_cash: '/reporting/mis/live?tab=statements', runway: '/accounts/cash-runway', sales: '/reporting/mis/live', fix: '/tasks?view=fix', late: '/tasks',
};
/** A Fix item's "why" is a numbered how-to. Today shows only step 1; the full steps open on the item. */
const firstStep = (why: string) => why.replace(/^\s*1\.\s*/, '').split(/\s+2\.\s/)[0];
/** Server lines say "since 2026-11-21": pages show "21 Nov". */
const humanDates = (t: string) => t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (d) => dayLabel(d));

/** Today's 5 tiles, with the two work counts from the shared store so they match the badge and Tasks. Tiles with no
 * data fold into 1 "Books" tile: 3 empty tiles with 3 long reasons said one thing 3 times. */
function tilesFor(b: Brief, c: WorkCount | null): (Tile & { href?: string })[] {
  const out: (Tile & { href?: string })[] = [];
  let empty = 0;
  for (const t of b.tiles) {
    let x: Tile = t;
    if (c && t.id === 'fix') x = { ...t, value: c.fix, delta: null, sub: c.fix ? `${c.fixHigh} urgent` : 'No problems found', tone: c.fixHigh ? 'act' : c.fix ? 'watch' : 'ok' };
    if (c && t.id === 'late') x = { ...t, value: c.late, delta: null, sub: `${c.dueToday} due today · ${c.dueWeek} this week`, tone: c.late ? 'act' : 'ok' };
    if (x.value == null) { empty += 1; continue; }
    out.push({ ...x, href: TILE_HREF[x.id] });
  }
  if (empty) out.unshift({ id: 'books', label: 'Books', value: null, unit: 'count', tone: 'watch', delta: null, sub: 'No Tally books yet. Pull Tally on Setup.', href: '/setup' });
  return out;
}
const KIND = { watch: 'Watch', fix: 'Fix', task: 'Task' } as const;

export function TodayPage() {
  const [b, setB] = useState<Brief | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (fresh = false) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/today${fresh ? '?fresh=1' : ''}`);
      if (!r.ok) throw new Error(`Could not load (${r.status})`);
      setB((await r.json()) as Brief); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load'); }
    setBusy(false);
  };
  useEffect(() => { void load(); }, []);

  const count = useWorkCount();
  const pill = b ? PILL[b.status] : null;
  // The one count (badge, Tasks, here). Before the store answers, the server's list length.
  const total = count ? count.open : b ? b.needsYou.length + b.moreNeeds : 0;
  const line = count ? (count.urgent ? `${count.urgent} urgent of ${count.open} open` : count.open ? `${count.open} open, none urgent` : 'Nothing needs you today') : b?.statusLine;
  return (
    <>
      <PageHeader
        title="Today"
        description={line ?? 'Do the numbered items first.'}
        status={pill ? <StatusPill toneName={pill.tone} dot>{pill.text}</StatusPill> : undefined}
        help={<><p>The 5 numbers come from the Tally books and the Tasks list.</p><p>"What changed" compares today with the last saved day.</p></>}
        actions={<>
          {b && <SourceChip
            items={[
              { label: 'Tally books', asOf: b.freshness.tallyLastOkAt ?? null, staleAfterH: 48, note: 'Net cash, sales and watch items' },
              { label: 'Tasks and Fix list', asOf: b.asOf, note: 'Read live' },
            ]}
            notes={b.notes}
          />}
          <button type="button" onClick={() => { void load(true); void refreshWorkCount(true); }} disabled={busy} className={BTN}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden /> Refresh</button>
        </>}
      />
      <PageBody>
        {err && <ErrorBox onRetry={() => void load(true)}>{err}</ErrorBox>}
        {!b && !err && <Loading />}
        {b && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
              {tilesFor(b, count).map((t) => {
                const d = tileDelta(t);
                // for cash and sales up is good; for fix / late counts up is bad
                const good = t.unit === 'count' ? (t.delta ?? 0) < 0 : (t.delta ?? 0) > 0;
                return (
                  <KpiTile key={t.id} label={t.label} href={t.href} value={<span className={TONE[t.tone]}>{t.id === 'books' ? 'No data' : show(t)}</span>}
                    delta={d ? { dir: (t.delta ?? 0) > 0 ? 'up' : 'down', text: d, good } : undefined}
                    sub={t.sub} />
                );
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Panel title="Do these first" count={total} className="lg:col-span-2" flush
                action={total > 0 ? <Link to="/tasks" className={BTN}>Open Tasks</Link> : undefined}>
                {b.needsYou.length === 0 ? <div className="p-4"><Empty title="Nothing to do now" hint="No late task. No open Fix item." /></div> : (
                  <ol className="divide-y divide-slate-100">
                    {b.needsYou.map((n, i) => (
                      <li key={i}>
                        <Link to={n.href} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500">
                          <StepNo n={i + 1} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900">{n.title}</span>
                            <span className="block truncate text-xs text-slate-600" title={n.why}>{n.kind === 'fix' ? firstStep(n.why) : n.why}</span>
                          </span>
                          {n.inr != null && <span className="shrink-0 text-sm tabular-nums text-slate-700">{inr(n.inr)}</span>}
                          <StatusPill toneName={n.severity === 'high' ? 'critical' : 'warning'} className="shrink-0">{KIND[n.kind]}</StatusPill>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
                {total > b.needsYou.length && <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600">{total - b.needsYou.length} more in <Link to="/tasks?view=fix" className="font-medium text-accent-600 hover:underline">Tasks, Fix list</Link></p>}
              </Panel>

              <div className="space-y-4">
                <Panel title="What changed">
                  <ul className="space-y-1.5 text-sm text-slate-700">
                    {b.changed.map((c) => (
                      <li key={c.id} className="flex items-start gap-2">
                        <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c.direction === 'better' ? 'bg-emerald-500' : c.direction === 'worse' ? 'bg-red-500' : 'bg-slate-300'}`} />
                        <span>{humanDates(c.text)}<span className="sr-only"> ({c.direction})</span></span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
