// ----------------------------------------------------------------------------
// Data rulebook: how each number gets into the MIS. Two tabs in the header (22 Nov 2026: the Sources tab repeated
// Setup's source list; each source's files and rules now open in its Setup drawer, components/ingest/SourceRules.tsx):
//   P&L lines the cascade and the source that owns each line, plus the
//             completeness rule (numbered steps behind an "i")
//   Sheets    each MIS tab and the data behind it
// All content comes from client/src/data/ingest/rulebook.ts.
// Simplification pass 2 (11 Nov 2026): Checklist + Sources & files merged into one list with a detail modal.
// ----------------------------------------------------------------------------

import { useState, type ReactNode } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { InfoTip, Panel } from '../../components/ui/states';
import { CASCADE, SHEET_RULES, COMPLETENESS_RULE, type LineOwner } from '../../data/ingest/rulebook';

const OWNER_STYLE: Record<LineOwner, { label: string; cls: string }> = {
  connectors: { label: 'Reports', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  bom: { label: 'BOM', cls: 'bg-white text-slate-900 border-slate-400' },
  tally: { label: 'Tally', cls: 'bg-accent-50 text-accent-700 border-accent-200' },
  derived: { label: 'Computed', cls: 'bg-white text-slate-600 border-slate-300' },
};

type RbTab = 'cascade' | 'sheets';

function Badge({ children, cls }: { children: ReactNode; cls: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function RulebookPage() {
  const [tab, setTab] = useState<RbTab>('cascade');

  return (
    <>
      <PageHeader
        title="Data rulebook"
        description="How each number gets into the MIS: the report, what the MIS reads, and the P&L line it goes to."
        help={
          <ol className="list-decimal space-y-1 pl-4">
            <li>P&amp;L lines: see the source of each P&amp;L line.</li>
            <li>Sheets: see the data behind each MIS tab.</li>
            <li>Each source's files and rules: open the source on Setup.</li>
          </ol>
        }
        tabs={[
          { id: 'cascade', label: 'P&L lines' },
          { id: 'sheets', label: 'Sheets' },
        ]}
        tab={tab}
        onTab={(id) => setTab(id as RbTab)}
      />

      <div className="mx-auto max-w-7xl space-y-4 px-4 pb-10 sm:px-6 lg:px-8">
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

    </>
  );
}
