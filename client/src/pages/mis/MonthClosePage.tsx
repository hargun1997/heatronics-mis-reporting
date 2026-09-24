// ----------------------------------------------------------------------------
// Closing a month.
//
// This was three tabs in the MIS deck — Data Inputs, Month Close, Month Ingest
// — sitting among nine read-only analysis views. Three of them meant "put
// numbers in", and none of them said which to use.
//
// Closing a month is not a view of the deck. It is a workflow that ends in a
// diff, run once a month by one person, so it gets its own page reached from a
// button rather than a tab you scroll past every day. The three collapse into
// one route:
//
//   the file path      drop the month's exports in, clear what the dashboard
//                      refuses to guess, emit (MonthIngestTab)
//   the catalogue      what to pull and from where — now inline on each source
//                      row, with the full table kept at the bottom for the
//                      inputs no file carries
//   the manual path    type the figures straight in, for a month with no
//                      exports to hand (MonthCloseTab)
// ----------------------------------------------------------------------------

import { useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionCard } from '../../components/ui/Card';
import { FEED_SOURCES, TIER_BADGE } from '../../data/misDeck/feedSources';
import { seriesFor } from '../../data/misDeck/analytics';
import { MonthCloseTab } from './MonthCloseTab';
import { MonthIngestTab } from './MonthIngestTab';

const iconClose = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function nextMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m === 12 ? 0 : m]} ${m === 12 ? y + 1 : y}`;
}

export function MonthClosePage() {
  const months = seriesFor('month');
  const last = months[months.length - 1];

  return (
    <>
      <PageHeader
        title="Close the month"
        accent="emerald"
        icon={iconClose}
        description="Drop the month's exports in. Everything read is checked against Tally's own bottom line before it can be emitted."
        crumbs={[
          { label: 'Reporting', to: '/reporting' },
          { label: 'MIS Reporting', to: '/reporting/mis' },
          { label: 'Close the month' },
        ]}
        actions={
          <span className="text-[11px] text-slate-400 hidden sm:block">
            Published through {last?.label ?? '—'} · next {last ? nextMonthLabel(last.key) : '—'}
          </span>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <MonthIngestTab />
        <InputCatalogue />
        <ManualFallback />
      </div>
    </>
  );
}

/**
 * The full input catalogue.
 *
 * Every ingestable row already appears on its own source in the checklist
 * above, where it is useful. This keeps the whole table one click away for the
 * things no file carries — Offline and OEM figures, repeat cohorts — and for
 * reading end to end when setting the month up for the first time.
 */
function InputCatalogue() {
  const [open, setOpen] = useState(false);

  return (
    <SectionCard
      title="Where each input comes from"
      description="The full monthly pull list, including the figures that arrive by hand rather than as a file."
      actions={
        <button
          onClick={() => setOpen(!open)}
          className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
        >
          {open ? 'Hide' : 'Show all'}
        </button>
      }
    >
      {!open ? (
        <p className="text-xs text-slate-500">
          Each source above carries its own instructions — click a row to see the columns it needs and how to check it.
          Open this for the whole list, including Offline/OEM sales and the ad exports that weight the per-SKU split.
        </p>
      ) : (
        <div className="space-y-5">
          <div className="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-slate-600">
            <span className="font-medium text-brand-700">Tally is the book of record.</span> Every company total ties to
            it. The channel and SKU feeds only <span className="font-medium">re-split</span> those totals — revenue by
            real revenue, COGS by real per-unit cost, marketing by real ad spend. They never change the finals, so a
            month is closable once Tally is in and gets more granular as each feed lands.
          </div>

          {FEED_SOURCES.map((src) => (
            <div key={src.name}>
              <div className="flex items-baseline gap-2 mb-1.5">
                <h4 className="text-xs font-semibold text-slate-700">{src.name}</h4>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TIER_BADGE[src.tier].cls}`}>
                  {TIER_BADGE[src.tier].label}
                </span>
                <span className="text-[10px] text-slate-400">{src.cadence}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-slate-400 border-b border-slate-200 text-left align-bottom">
                      <th className="py-1.5 pr-3 font-medium">Pull this</th>
                      <th className="py-1.5 pr-3 font-medium">From</th>
                      <th className="py-1.5 pr-3 font-medium">Columns needed</th>
                      <th className="py-1.5 pr-3 font-medium">Feeds</th>
                      <th className="py-1.5 font-medium">Self-check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {src.rows.map((r) => (
                      <tr key={r.export} className="border-b border-slate-50 align-top">
                        <td className="py-2 pr-3 text-slate-700 font-medium">
                          {r.export}
                          {r.optional && <span className="ml-1 text-[10px] font-normal text-slate-400">optional</span>}
                        </td>
                        <td className="py-2 pr-3 text-slate-500">{r.where}</td>
                        <td className="py-2 pr-3 text-slate-500">{r.fields}</td>
                        <td className="py-2 pr-3 text-slate-500">{r.feeds}</td>
                        <td className="py-2 text-slate-500">
                          {r.check}
                          {r.caution && <span className="block mt-1 text-amber-700">⚠ {r.caution}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span className="font-medium text-slate-600">Golden rule for the ad feeds:</span> the booked S&amp;M total
            always wins. Meta / Google / Amazon ad exports only <span className="font-medium">weight</span> how marketing
            splits across channels and SKUs — if an export is truncated the split is off but the finals still hold.
            Confirm an ad export sums to the full booked spend before trusting its per-SKU detail.
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/**
 * The manual path.
 *
 * Kept because it is not the same output: it models taxes and PBT, which
 * MonthlyMIS does not, and it closes a month with no exports to hand. Folded
 * shut because reaching for it when you have the files means giving up every
 * check the file path does for you.
 */
function ManualFallback() {
  const [open, setOpen] = useState(false);

  return (
    <SectionCard
      title="Type the figures in instead"
      description="No exports to hand, or you only need a quick P&L with taxes and PBT. Nothing here is checked against Tally."
      actions={
        <button
          onClick={() => setOpen(!open)}
          className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
        >
          {open ? 'Hide' : 'Open'}
        </button>
      }
    >
      {!open ? (
        <p className="text-xs text-slate-500">
          The manual close takes typed figures and consolidates them to a full P&amp;L including tax and PBT. It has none
          of the gates above — no reconciliation to Tally, no provenance, no emit — so prefer dropping the files in when
          you have them.
        </p>
      ) : (
        <div className="pt-1">
          <MonthCloseTab />
        </div>
      )}
    </SectionCard>
  );
}
