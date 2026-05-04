import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { useTallyMaster } from '../../data/tally/useTallyMaster';
import type { TallyLedger } from '../../data/tally/useTallyMaster';
import { MasterPanel } from './MasterPanel';

const iconLookup = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
  </svg>
);

const MAX_RESULTS = 25;

interface RankedLedger {
  ledger: TallyLedger;
  parent: string;
  score: number;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

export function LedgerLookup() {
  const masterState = useTallyMaster();
  const master = masterState.master;
  const [query, setQuery] = useState('');

  const groupParents = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const g of master?.groups || []) map.set(g.name, g.parent);
    return map;
  }, [master]);

  const results = useMemo<RankedLedger[]>(() => {
    if (!master?.ledgers) return [];
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    const scored: RankedLedger[] = [];
    for (const ledger of master.ledgers) {
      const ledgerLower = ledger.name.toLowerCase();
      const groupLower = (ledger.group || '').toLowerCase();
      const parent = groupParents.get(ledger.group || '') || '';
      const parentLower = (parent || '').toLowerCase();

      let score = 0;
      let allTokensMatched = true;
      for (const t of tokens) {
        const ledgerHit = ledgerLower.includes(t);
        const groupHit = groupLower.includes(t);
        const parentHit = parentLower.includes(t);
        if (!ledgerHit && !groupHit && !parentHit) {
          allTokensMatched = false;
          break;
        }
        if (ledgerHit) score += 3;
        if (groupHit) score += 2;
        if (parentHit) score += 1;
      }
      if (allTokensMatched) {
        scored.push({ ledger, parent: parent || '', score });
      }
    }
    scored.sort(
      (a, b) => b.score - a.score || a.ledger.name.localeCompare(b.ledger.name)
    );
    return scored.slice(0, MAX_RESULTS);
  }, [master, query, groupParents]);

  return (
    <>
      <PageHeader title="Ledger Lookup" accent="emerald" icon={iconLookup} />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <MasterPanel state={masterState} />

        {!master && !masterState.loading && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="font-semibold">Tally master could not be loaded</div>
            <p className="text-xs mt-1">
              {masterState.error
                ? `Bundled master fetch failed: ${masterState.error}.`
                : 'No master available.'}{' '}
              Use the Tally master panel above to upload an override.
            </p>
          </div>
        )}

        {master && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Find a ledger</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Type the kind of expense, vendor or party — e.g. &ldquo;courier&rdquo;,
                &ldquo;AWS&rdquo;, &ldquo;rent&rdquo;, &ldquo;shiprocket&rdquo;.
              </p>
            </div>

            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                placeholder="Search ledger, group or party…"
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-9 py-2 text-sm focus:outline-none focus:border-emerald-400"
              />
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z"
                />
              </svg>
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full text-slate-400 hover:text-slate-700 flex items-center justify-center"
                >
                  ×
                </button>
              )}
            </div>

            <ResultsList query={query} results={results} totalLedgers={master.ledgers?.length || 0} />
          </div>
        )}
      </div>
    </>
  );
}

function ResultsList({
  query,
  results,
  totalLedgers,
}: {
  query: string;
  results: RankedLedger[];
  totalLedgers: number;
}) {
  if (!query.trim()) {
    return (
      <p className="text-xs text-slate-500">
        {totalLedgers} ledgers loaded from the Tally master. Start typing to search.
      </p>
    );
  }
  if (results.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500 text-center">
        No ledgers match &ldquo;{query}&rdquo;. Try fewer or different keywords.
      </div>
    );
  }
  return (
    <ul className="grid gap-1.5">
      {results.map(({ ledger, parent }) => (
        <li
          key={ledger.name}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-emerald-400"
        >
          <div className="text-sm font-medium text-slate-900">{ledger.name}</div>
          {ledger.group && (
            <div className="text-[11px] text-slate-500">
              {ledger.group}
              {parent && parent !== ledger.group && (
                <span className="text-slate-400"> · {parent}</span>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
