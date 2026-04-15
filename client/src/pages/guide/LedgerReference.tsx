import { useState, useMemo } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pill } from '../../components/ui/Card';
import { Disclosure } from '../../components/ui/Disclosure';
import { JournalTable } from '../../components/ui/SopLayout';
import { LEDGER_TREE, VOUCHER_TYPES, LedgerNode } from '../../data/guide/ledgerTree';

const iconLedger = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
  </svg>
);

type Tab = 'ledgers' | 'voucherTypes';

export function LedgerReference() {
  const [tab, setTab] = useState<Tab>('ledgers');
  const [query, setQuery] = useState('');

  return (
    <>
      <PageHeader
        title="Ledgers & Voucher Types"
        description="The full tree of ledgers maintained across Tally and Tranzact — grouped by primary head, with voucher types, GST treatment, and real-data examples."
        accent="emerald"
        icon={iconLedger}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <TabButton active={tab === 'ledgers'} onClick={() => setTab('ledgers')}>Ledger tree</TabButton>
            <TabButton active={tab === 'voucherTypes'} onClick={() => setTab('voucherTypes')}>Voucher types</TabButton>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search ledgers, groups, voucher types..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
        </div>

        {tab === 'ledgers' ? <LedgerTreeView query={query} /> : <VoucherTypesView query={query} />}
      </div>
    </>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
        active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}

function LedgerTreeView({ query }: { query: string }) {
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return LEDGER_TREE;
    return LEDGER_TREE.map((g) => ({
      ...g,
      subGroups: g.subGroups
        .map((sg) => ({
          ...sg,
          ledgers: sg.ledgers.filter((l) =>
            [l.name, l.purpose, l.voucherTypes?.join(' ')].filter(Boolean).join(' ').toLowerCase().includes(q)
          ),
        }))
        .filter((sg) => sg.ledgers.length > 0),
    })).filter((g) => g.subGroups.length > 0);
  }, [q]);

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        No ledgers match "{query}".
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filtered.map((group) => (
        <div key={group.name} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-900">{group.name}</h3>
            </div>
            {group.description && <p className="mt-1 text-xs text-slate-500">{group.description}</p>}
          </div>
          <div className="p-5 space-y-4">
            {group.subGroups.map((sg) => (
              <div key={sg.name}>
                <h4 className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">{sg.name}</h4>
                <div className="space-y-2">
                  {sg.ledgers.map((l) => (
                    <LedgerRow key={l.name} ledger={l} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LedgerRow({ ledger }: { ledger: LedgerNode }) {
  return (
    <Disclosure
      title={ledger.name}
      subtitle={ledger.purpose}
      badge={
        <div className="flex items-center gap-1.5">
          {ledger.source && <Pill color={ledger.source === 'Tally' ? 'emerald' : ledger.source === 'Tranzact' ? 'brand' : 'violet'} size="xs">{ledger.source}</Pill>}
          {ledger.gst && <Pill color="amber" size="xs">{ledger.gst}</Pill>}
        </div>
      }
    >
      {ledger.voucherTypes && ledger.voucherTypes.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Voucher types that post here</div>
          <div className="flex flex-wrap gap-1.5">
            {ledger.voucherTypes.map((v) => (
              <Pill key={v} color="slate" size="xs">{v}</Pill>
            ))}
          </div>
        </div>
      )}
      {ledger.examples && ledger.examples.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Example</div>
          {ledger.examples.map((ex, i) => (
            <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 p-3 mb-2">
              <div className="text-xs font-medium text-slate-900">{ex.scenario}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{ex.voucherType}</div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="text-xs">
                  <div className="text-[10px] uppercase tracking-wider text-brand-600 font-semibold">Dr</div>
                  <div className="text-slate-700">{ex.dr}</div>
                </div>
                <div className="text-xs">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold">Cr</div>
                  <div className="text-slate-700">{ex.cr}</div>
                </div>
              </div>
              {ex.note && <p className="mt-2 text-[11px] text-slate-500 italic">{ex.note}</p>}
            </div>
          ))}
        </div>
      )}
      {(!ledger.examples || ledger.examples.length === 0) && (!ledger.voucherTypes || ledger.voucherTypes.length === 0) && (
        <p className="text-xs text-slate-500 italic">No additional details.</p>
      )}
    </Disclosure>
  );
}

function VoucherTypesView({ query }: { query: string }) {
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!q) return VOUCHER_TYPES;
    return VOUCHER_TYPES.filter((v) =>
      [v.name, v.usage, v.billSeries, v.mappedLedgers.join(' ')].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [q]);

  const exampleJournal = {
    title: 'Sales (Amazon-B2C) — how a voucher posts',
    lines: [
      { side: 'Dr' as const, ledger: 'Amazon Unsettled Receivable', amount: '₹1,180.00' },
      { side: 'Cr' as const, ledger: 'Sales — Amazon B2C', amount: '₹1,000.00' },
      { side: 'Cr' as const, ledger: 'Output CGST', amount: '₹90.00' },
      { side: 'Cr' as const, ledger: 'Output SGST', amount: '₹90.00' },
    ],
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-900">Voucher types — series-wise mapping</h3>
          <p className="mt-1 text-xs text-slate-500">
            Each bill series is bound to a voucher type, which in turn is bound to a fixed set of ledgers. This table is the single source of truth for the plugin's UPSERT.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Voucher type</th>
                <th className="text-left px-4 py-2 font-medium">System</th>
                <th className="text-left px-4 py-2 font-medium">Bill series</th>
                <th className="text-left px-4 py-2 font-medium">Usage</th>
                <th className="text-left px-4 py-2 font-medium">Mapped ledgers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((v) => (
                <tr key={v.name} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-900">{v.name}</td>
                  <td className="px-4 py-2">
                    <Pill color={v.system === 'Tally' ? 'emerald' : 'brand'} size="xs">{v.system}</Pill>
                  </td>
                  <td className="px-4 py-2 text-slate-600 font-mono text-[11px]">{v.billSeries || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{v.usage}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {v.mappedLedgers.map((l) => (
                        <Pill key={l} color="slate" size="xs">{l}</Pill>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">{exampleJournal.title}</h3>
        <p className="mt-1 text-xs text-slate-500">Illustrative journal the plugin posts for a ₹1,180 Amazon B2C sale at 18% GST (intra-state).</p>
        <div className="mt-3">
          <JournalTable lines={exampleJournal.lines} />
        </div>
      </div>
    </div>
  );
}
