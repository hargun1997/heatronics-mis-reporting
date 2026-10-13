// ----------------------------------------------------------------------------
// Data Rulebook — the explicit, in-app statement of how every number in the MIS
// gets there: the P&L cascade and who owns each line, the completeness rule,
// the per-connector file→read→destination rules, and what feeds each sheet.
// All content comes from client/src/data/ingest/rulebook.ts.
// ----------------------------------------------------------------------------

import { useMemo, useState, type ReactNode } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import {
  CASCADE, CONNECTOR_RULES, SHEET_RULES, COMPLETENESS_RULE,
  WIRING_LABEL, READY_LABEL, stepsReady, stepsFor,
  type LineOwner, type Wiring, type Ready, type ConnectorRule,
} from '../../data/ingest/rulebook';

const iconBook = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 6.5C10.5 5.5 8 5 5.5 5.2 4.7 5.3 4 6 4 6.8v10.4c0 .9.8 1.6 1.7 1.5C8 18.5 10.5 19 12 20m0-13.5c1.5-1 4-1.5 6.5-1.3.8.1 1.5.8 1.5 1.6v10.4c0 .9-.8 1.6-1.7 1.5C16 18.5 13.5 19 12 20m0-13.5V20" />
  </svg>
);

const OWNER_STYLE: Record<LineOwner, { label: string; cls: string }> = {
  connectors: { label: 'Connectors', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  bom: { label: 'BOM', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  tally: { label: 'Tally', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  derived: { label: 'Computed', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};

const WIRING_STYLE: Record<Wiring, string> = {
  live: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  wired: 'bg-sky-50 text-sky-700 border-sky-200',
  'fixture-ready': 'bg-violet-50 text-violet-700 border-violet-200',
  'needs-sample': 'bg-amber-50 text-amber-700 border-amber-200',
};

const READY_STYLE: Record<Ready, string> = {
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  todo: 'bg-slate-50 text-slate-400 border-slate-200',
  na: 'bg-slate-50 text-slate-400 border-slate-200',
};
const READY_MARK: Record<Ready, string> = { done: '✓', partial: '◐', todo: '○', na: '—' };

const GROUP_ORDER = ['Book of record', 'Marketplace', 'D2C', 'Marketing', 'Logistics', 'Payments & checkout'] as const;

function Badge({ children, cls }: { children: ReactNode; cls: string }) {
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium whitespace-nowrap ${cls}`}>{children}</span>;
}

export function RulebookPage() {
  const grouped = useMemo(() => {
    const m = new Map<string, ConnectorRule[]>();
    for (const c of CONNECTOR_RULES) {
      const arr = m.get(c.group) ?? [];
      arr.push(c);
      m.set(c.group, arr);
    }
    return GROUP_ORDER.map((g) => [g, m.get(g) ?? []] as const).filter(([, a]) => a.length > 0);
  }, []);

  // Progress checklist — the ones we have wired, in the order we did them, then
  // the queue. Three columns: mapping figured, steps added, what we do (rule).
  const checklist = useMemo(() => {
    const done = CONNECTOR_RULES.filter((c) => c.seq != null).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    const queued = CONNECTOR_RULES.filter((c) => c.seq == null);
    return [...done, ...queued];
  }, []);

  return (
    <>
      <PageHeader
        title="Data Rulebook"
        accent="brand"
        icon={iconBook}
        description="The rule for every number: which file it comes from, what we read, and exactly where it lands in the MIS. This is the contract the ingestion follows."
        crumbs={[
          { label: 'Reporting', to: '/reporting' },
          { label: 'MIS Reporting', to: '/reporting/mis' },
          { label: 'Data Rulebook' },
        ]}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* 0 — Connector progress checklist */}
        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-1">Connector progress</h2>
          <p className="text-sm text-slate-500 mb-3">
            Each source needs three things: its ids mapped into the MIS, its export steps added, and its rule
            (what we do with the data) defined. Done ones first, in the order we wired them, then the queue.
          </p>
          <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-3 py-2 font-semibold w-10">#</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                  <th className="px-3 py-2 font-semibold w-28">Mapping</th>
                  <th className="px-3 py-2 font-semibold w-28">Steps</th>
                  <th className="px-3 py-2 font-semibold">What we do with its data</th>
                  <th className="px-3 py-2 font-semibold">Still to do</th>
                </tr>
              </thead>
              <tbody>
                {checklist.map((c, i) => {
                  const firstQueued = c.seq == null && (checklist[i - 1]?.seq != null);
                  return (
                    <tr key={c.connectorId}
                      className={`align-top ${firstQueued ? 'border-t-2 border-slate-200' : 'border-t border-slate-100'}`}>
                      <td className="px-3 py-2.5 tabular-nums text-slate-400">{c.seq ?? '·'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-slate-800">{c.label}</span>
                          {c.channel && <Badge cls="bg-slate-50 text-slate-500 border-slate-200">{c.channel}</Badge>}
                        </div>
                        <Badge cls={WIRING_STYLE[c.wiring]}>{WIRING_LABEL[c.wiring]}</Badge>
                      </td>
                      <td className="px-3 py-2.5"><Badge cls={READY_STYLE[c.mapping]}>{READY_MARK[c.mapping]} {READY_LABEL[c.mapping]}</Badge></td>
                      <td className="px-3 py-2.5">
                        {(() => {
                          const r = stepsReady(c.connectorId);
                          const s = stepsFor(c.connectorId);
                          return (
                            <div className="flex flex-col gap-0.5">
                              <Badge cls={READY_STYLE[r]}>{READY_MARK[r]} {READY_LABEL[r]}</Badge>
                              <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                {s.steps ? '✓' : '○'} steps · {s.linkExpected ? `${s.link ? '✓' : '○'} link` : '— link'}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 text-[13px] min-w-[16rem]">{c.summary}</td>
                      <td className="px-3 py-2.5 text-[12px] min-w-[14rem]">
                        {c.pending
                          ? <span className="text-amber-700">{c.pending}</span>
                          : <span className="text-emerald-600">✓ Nothing pending</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            The queue (below the line) is the remaining one-by-one order. The full file→read→destination rule for
            every source is in “Every source, every file” below.
          </p>
        </section>

        {/* 1 — The cascade and who owns each line */}
        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-1">The P&amp;L cascade</h2>
          <p className="text-sm text-slate-500 mb-3">
            Every tab is a view of this one cascade. Each line is owned by a source — connectors feed the top,
            BOM gives cost of goods, Tally owns everything below Contribution Margin, and the margins are computed.
          </p>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {CASCADE.map((line, i) => {
              const o = OWNER_STYLE[line.owner];
              const isMargin = line.kind === 'margin';
              return (
                <div key={line.key}
                  className={`flex items-start gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-slate-100' : ''} ${isMargin ? 'bg-slate-50/60' : ''}`}>
                  <div className="w-44 flex-shrink-0">
                    <span className={`text-sm ${isMargin ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                      {line.kind === 'cost' ? '− ' : ''}{line.label}
                    </span>
                  </div>
                  <div className="flex-shrink-0 w-24"><Badge cls={o.cls}>{o.label}</Badge></div>
                  <div className="flex-1 min-w-0">
                    {line.formula && <p className="text-xs text-slate-500">{line.formula}</p>}
                    {line.note && <p className="text-[11px] text-slate-400 mt-0.5">{line.note}</p>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {(Object.keys(OWNER_STYLE) as LineOwner[]).map((k) => (
              <Badge key={k} cls={OWNER_STYLE[k].cls}>{OWNER_STYLE[k].label}</Badge>
            ))}
          </div>
        </section>

        {/* 2 — Completeness rule */}
        <section>
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3.5">
            <h2 className="text-sm font-semibold text-brand-800 mb-1">{COMPLETENESS_RULE.headline}</h2>
            <p className="text-sm text-brand-900/80 leading-relaxed">{COMPLETENESS_RULE.body}</p>
          </div>
        </section>

        {/* 3 — Per-connector rules */}
        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-1">Every source, every file</h2>
          <p className="text-sm text-slate-500 mb-3">
            For each connector: the file you upload, what we read from it, and where each figure posts.
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {(Object.keys(WIRING_LABEL) as Wiring[]).map((w) => (
              <Badge key={w} cls={WIRING_STYLE[w]}>{WIRING_LABEL[w]}</Badge>
            ))}
          </div>

          <div className="space-y-6">
            {grouped.map(([group, connectors]) => (
              <div key={group}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{group}</h3>
                <div className="space-y-3">
                  {connectors.map((c) => <ConnectorCard key={c.connectorId} c={c} />)}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4 — What feeds each sheet */}
        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-1">What feeds each sheet</h2>
          <p className="text-sm text-slate-500 mb-3">Every tab of the MIS and the data behind it.</p>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {SHEET_RULES.map((s, i) => (
              <div key={s.sheet} className={`px-4 py-3 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                  <span className="w-32 flex-shrink-0 text-sm font-semibold text-slate-800">{s.sheet}</span>
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">{s.what}</p>
                    <p className="text-xs text-slate-400 mt-0.5"><span className="font-medium text-slate-500">Fed by:</span> {s.feeds}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function ConnectorCard({ c }: { c: ConnectorRule }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors">
        <svg className={`w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{c.label}</span>
            {c.channel && <Badge cls="bg-slate-50 text-slate-500 border-slate-200">{c.channel} channel</Badge>}
            <Badge cls={WIRING_STYLE[c.wiring]}>{WIRING_LABEL[c.wiring]}</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{c.summary}</p>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {c.files.map((f) => (
            <div key={f.slotId} className="px-4 py-3 pl-11">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-sm font-medium text-slate-700">{f.label}</span>
                <Badge cls={f.required ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-slate-50 text-slate-400 border-slate-200'}>
                  {f.required ? 'Required' : 'Optional'}
                </Badge>
                <span className="text-[11px] text-slate-400">· {f.cadence}</span>
              </div>
              <p className="text-xs text-slate-500 mb-2"><span className="font-medium text-slate-600">We read:</span> {f.reads}</p>
              {f.exclusions && (
                <p className="text-xs text-slate-400 mb-2"><span className="font-medium text-slate-500">Excluded:</span> {f.exclusions}</p>
              )}
              <div className="space-y-1.5">
                {f.destinations.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="flex-shrink-0 mt-0.5 text-brand-500">→</span>
                    <div>
                      <span className="font-semibold text-slate-700">{d.line}</span>
                      <span className="text-slate-400"> · {d.dimension}</span>
                      <p className="text-slate-500">{d.rule}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
