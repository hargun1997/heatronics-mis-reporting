// ----------------------------------------------------------------------------
// Data rulebook: how each number gets into the MIS. Three tabs in the header:
//   Sources   one row per report source (status + next step); a row opens the
//             full rule (files, what the MIS reads, the line each figure goes to)
//   P&L lines the cascade and the source that owns each line, plus the
//             completeness rule (numbered steps behind an "i")
//   Sheets    each MIS tab and the data behind it
// All content comes from client/src/data/ingest/rulebook.ts.
// Simplification pass 2 (11 Nov 2026): Checklist + Sources & files merged into one list with a detail modal.
// ----------------------------------------------------------------------------

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { KpiTile } from '../../components/ui/KpiTile';
import { Modal } from '../../components/ui/overlays';
import { InfoTip, Panel } from '../../components/ui/states';
import {
  CASCADE, CONNECTOR_RULES, SHEET_RULES, COMPLETENESS_RULE,
  WIRING_LABEL, READY_LABEL, stepsReady, stepsFor,
  type LineOwner, type Wiring, type Ready, type ConnectorRule,
} from '../../data/ingest/rulebook';

const OWNER_STYLE: Record<LineOwner, { label: string; cls: string }> = {
  connectors: { label: 'Reports', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  bom: { label: 'BOM', cls: 'bg-slate-900 text-white border-slate-900' },
  tally: { label: 'Tally', cls: 'bg-accent-50 text-accent-700 border-accent-200' },
  derived: { label: 'Computed', cls: 'bg-white text-slate-600 border-slate-300' },
};

const WIRING_STYLE: Record<Wiring, string> = {
  live: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  wired: 'bg-slate-50 text-slate-700 border-slate-200',
  'fixture-ready': 'bg-slate-50 text-slate-700 border-slate-200',
  'needs-sample': 'bg-amber-50 text-amber-700 border-amber-200',
};

type Status = 'ready' | 'partly' | 'todo';
const STATUS: Record<Status, { label: string; glyph: string; cls: string }> = {
  ready: { label: 'Ready', glyph: '✓', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partly: { label: 'Check', glyph: '◐', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  todo: { label: 'To do', glyph: '○', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
};
const READY_GLYPH: Record<Ready, string> = { done: '✓', partial: '◐', todo: '○', na: '·' };

/** One status per source: ready when its ids are mapped and its upload steps (and link) exist. */
function statusOf(c: ConnectorRule): Status {
  const steps = stepsReady(c.connectorId);
  if (c.mapping === 'done' && (steps === 'done' || steps === 'na')) return 'ready';
  if (c.mapping === 'todo' && steps === 'todo') return 'todo';
  return 'partly';
}

type RbTab = 'sources' | 'cascade' | 'sheets';

function Badge({ children, cls }: { children: ReactNode; cls: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function RulebookPage() {
  // Sources in the order they were set up, then the ones still in the queue.
  const sources = useMemo(() => {
    const done = CONNECTOR_RULES.filter((c) => c.seq != null).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    const queued = CONNECTOR_RULES.filter((c) => c.seq == null);
    return [...done, ...queued];
  }, []);
  const counts = useMemo(() => {
    const st = sources.map(statusOf);
    return {
      ready: st.filter((x) => x === 'ready').length,
      check: st.filter((x) => x !== 'ready').length,
      live: sources.filter((c) => c.wiring === 'live').length,
      files: sources.reduce((n, c) => n + c.files.length, 0),
    };
  }, [sources]);

  const [tab, setTab] = useState<RbTab>('sources');
  const [open, setOpen] = useState<ConnectorRule | null>(null);

  return (
    <>
      <PageHeader
        title="Data rulebook"
        description="How each number gets into the MIS: the report, what the MIS reads, and the P&L line it goes to."
        help={
          <ol className="list-decimal space-y-1 pl-4">
            <li>Sources: select a source to see its files and rules.</li>
            <li>P&amp;L lines: see the source of each P&amp;L line.</li>
            <li>Sheets: see the data behind each MIS tab.</li>
          </ol>
        }
        tabs={[
          { id: 'sources', label: 'Sources', count: sources.length },
          { id: 'cascade', label: 'P&L lines' },
          { id: 'sheets', label: 'Sheets' },
        ]}
        tab={tab}
        onTab={(id) => setTab(id as RbTab)}
      />

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6 lg:px-8">
        {tab === 'sources' && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiTile label="Sources" value={sources.length} sub={`${counts.files} report files`} />
              <KpiTile label="Ready" value={<span className="text-emerald-700">{counts.ready}</span>} sub="Ids mapped, steps and link added" />
              <KpiTile label="To check" value={<span className={counts.check ? 'text-amber-700' : 'text-slate-900'}>{counts.check}</span>} sub="A step or a link is missing" />
              <KpiTile label="Live API" value={counts.live} sub="No upload needed" />
            </div>

            <Panel title="Sources" count={sources.length} flush
              action={<InfoTip label="About this list">
                <p>Each source needs 3 things:</p>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>Its ids mapped into the MIS.</li>
                  <li>Its upload steps and a direct link.</li>
                  <li>Its rule: what the MIS does with the data.</li>
                </ol>
                <p>The list shows the sources in the order we set them up.</p>
              </InfoTip>}>
              <ul className="divide-y divide-slate-100">
                {sources.map((c) => {
                  const st = STATUS[statusOf(c)];
                  return (
                    <li key={c.connectorId}>
                      <button type="button" onClick={() => setOpen(c)}
                        className="group flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500 md:flex-nowrap">
                        <span className="w-5 shrink-0 text-xs tabular-nums text-slate-600">{c.seq ?? '·'}</span>
                        <span className="min-w-0 flex-1 md:w-60 md:flex-none">
                          <span className="block text-sm font-medium text-slate-900 group-hover:text-accent-700">{c.label}</span>
                          <span className="block text-xs text-slate-600">{[c.channel, WIRING_LABEL[c.wiring]].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="shrink-0 md:w-24"><Badge cls={st.cls}><span aria-hidden>{st.glyph}</span>{st.label}</Badge></span>
                        <span className="w-full pl-8 text-[13px] leading-snug text-slate-700 md:w-auto md:min-w-0 md:flex-1 md:pl-0">{c.pending ?? 'Nothing to do.'}</span>
                        <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-400 group-hover:text-accent-600 md:block" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </>
        )}

        {tab === 'cascade' && (
          <Panel title="P&L lines and their source" count={CASCADE.length} flush
            action={<InfoTip text="How far the MIS is complete" label={COMPLETENESS_RULE.headline} width={360}>
              <ol className="list-decimal space-y-1 pl-4">{COMPLETENESS_RULE.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            </InfoTip>}>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-600">
              Source:
              {(Object.keys(OWNER_STYLE) as LineOwner[]).map((k) => <Badge key={k} cls={OWNER_STYLE[k].cls}>{OWNER_STYLE[k].label}</Badge>)}
            </div>
            <ul className="divide-y divide-slate-100">
              {CASCADE.map((line) => {
                const o = OWNER_STYLE[line.owner];
                const isMargin = line.kind === 'margin';
                return (
                  <li key={line.key} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-4 py-2 md:grid-cols-[14rem_6rem_minmax(0,1fr)] ${isMargin ? 'bg-slate-50' : ''}`}>
                    <span className={`text-sm ${isMargin ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{line.kind === 'cost' ? '− ' : ''}{line.label}</span>
                    <span><Badge cls={o.cls}>{o.label}</Badge></span>
                    <span className="col-span-2 min-w-0 text-xs text-slate-600 md:col-span-1">
                      {line.formula}
                      {line.note && <span className="block text-slate-600">{line.note}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}

        {tab === 'sheets' && (
          <Panel title="What feeds each MIS tab" count={SHEET_RULES.length} flush>
            <ul className="divide-y divide-slate-100">
              {SHEET_RULES.map((s) => (
                <li key={s.sheet} className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
                  <span className="text-sm font-semibold text-slate-900">{s.sheet}</span>
                  <span>
                    <span className="block text-sm text-slate-700">{s.what}</span>
                    <span className="mt-0.5 block text-xs text-slate-600"><span className="font-medium">Data:</span> {s.feeds}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <SourceModal c={open} onClose={() => setOpen(null)} />
    </>
  );
}

/** Everything about one source: status, next step, and each file's read and destination rules. */
function SourceModal({ c, onClose }: { c: ConnectorRule | null; onClose: () => void }) {
  if (!c) return null;
  const s = stepsFor(c.connectorId);
  const steps = stepsReady(c.connectorId);
  const st = STATUS[statusOf(c)];
  return (
    <Modal open onClose={onClose} title={c.label} subtitle={c.summary} width={760}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge cls={st.cls}><span aria-hidden>{st.glyph}</span>{st.label}</Badge>
          {c.channel && <Badge cls="bg-slate-50 text-slate-700 border-slate-200">{c.channel} channel</Badge>}
          <Badge cls={WIRING_STYLE[c.wiring]}>{WIRING_LABEL[c.wiring]}</Badge>
          <Badge cls="bg-white text-slate-700 border-slate-200"><span aria-hidden>{READY_GLYPH[c.mapping]}</span>Ids mapped: {READY_LABEL[c.mapping]}</Badge>
          <Badge cls="bg-white text-slate-700 border-slate-200"><span aria-hidden>{READY_GLYPH[steps]}</span>Steps: {s.steps ? 'Added' : 'To do'}{s.linkExpected ? `, link: ${s.link ? 'Added' : 'To do'}` : ''}</Badge>
        </div>
        {c.pending && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><span className="font-semibold text-slate-900">Next step: </span>{c.pending}</p>
        )}
        {c.files.map((f, i) => (
          <section key={f.slotId} className="rounded-lg border border-slate-200">
            <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold tabular-nums text-white" aria-hidden>{i + 1}</span>
              <span className="font-semibold text-slate-900">{f.label}</span>
              <Badge cls={f.required ? 'bg-accent-50 text-accent-700 border-accent-200' : 'bg-slate-50 text-slate-600 border-slate-200'}>{f.required ? 'Required' : 'Optional'}</Badge>
              <span className="text-xs text-slate-600">{f.cadence}</span>
            </header>
            <div className="space-y-2 px-3 py-2">
              <p className="text-slate-700"><span className="font-medium text-slate-900">The MIS reads: </span>{f.reads}</p>
              {f.exclusions && <p className="text-slate-700"><span className="font-medium text-slate-900">Left out: </span>{f.exclusions}</p>}
              <ul className="divide-y divide-slate-100 rounded-md bg-slate-50">
                {f.destinations.map((d, j) => (
                  <li key={j} className="px-3 py-1.5 text-xs">
                    <span className="font-semibold text-slate-900">{d.line}</span>
                    <span className="text-slate-600"> · {d.dimension}</span>
                    <span className="block text-slate-700">{d.rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
