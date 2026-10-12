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
  WIRING_LABEL, type LineOwner, type Wiring, type ConnectorRule,
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
