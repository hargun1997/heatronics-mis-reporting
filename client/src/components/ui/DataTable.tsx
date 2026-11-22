// DataTable — the one table (UI pass, 22 Nov 2026). Sticky head, numbers right-aligned in tabular digits, a focusable
// scroll box, an optional total row, and on phones one card per row (the `main` column is the card title, the `emph`
// column sits on the right in bold, the rest show as "label value" lines). Pages pass columns + rows; no page
// builds its own <table> markup for a plain list of numbers.
import React from 'react';

export interface Column<R> {
  key: string;
  label: string;
  /** Cell content. Default: String(row[key]). */
  cell?: (row: R) => React.ReactNode;
  /** Numbers: right-aligned, tabular digits. */
  num?: boolean;
  /** The card title on phones (first column if none). */
  main?: boolean;
  /** The figure that matters: bold, and on the right of the phone card. */
  emph?: boolean;
  /** Muted text. */
  quiet?: boolean;
  /** Hide this column on phones (it still shows in the table from sm up). */
  wideOnly?: boolean;
  className?: string;
}

export function DataTable<R>({ columns, rows, rowKey, total, label, minWidth = 560, onRow, empty = 'No rows.' }: {
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R, i: number) => string;
  /** Total row: cells by column key; the first column's label defaults to "Total". */
  total?: Partial<Record<string, React.ReactNode>>;
  /** What the table shows (screen readers, the scroll box). */
  label: string;
  minWidth?: number;
  onRow?: (row: R) => void;
  empty?: React.ReactNode;
}) {
  if (!rows.length) return <p className="text-sm text-slate-600">{empty}</p>;
  const cell = (c: Column<R>, r: R) => (c.cell ? c.cell(r) : String((r as Record<string, unknown>)[c.key] ?? ''));
  const main = columns.find((c) => c.main) ?? columns[0];
  const emph = columns.find((c) => c.emph);
  const rest = columns.filter((c) => c !== main && c !== emph && !c.wideOnly);
  const tdCls = (c: Column<R>) => `px-3 py-2 ${c.num ? 'text-right tabular-nums whitespace-nowrap' : ''} ${c.emph ? 'font-semibold text-slate-900' : c.quiet ? 'text-slate-600' : 'text-slate-800'} ${c.className ?? ''}`;
  return (
    <>
      {/* Phones: one card per row */}
      <ul className="space-y-2 sm:hidden" aria-label={label}>
        {rows.map((r, i) => (
          <li key={rowKey(r, i)} className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2"
            onClick={onRow ? () => onRow(r) : undefined}>
            <div className="min-w-0 flex-1 text-sm">
              <div className="text-slate-900">{cell(main, r)}</div>
              {rest.length > 0 && (
                <div className="mt-0.5 space-y-0.5 text-xs text-slate-600">
                  {rest.map((c) => <div key={c.key}>{c.label} <span className={c.num ? 'tabular-nums' : ''}>{cell(c, r)}</span></div>)}
                </div>
              )}
            </div>
            {emph && <div className="text-right text-base font-semibold tabular-nums text-slate-900">{cell(emph, r)}</div>}
          </li>
        ))}
        {total && (
          <li className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold">
            <span>{total[main.key] ?? 'Total'}</span>
            {emph && <span className="tabular-nums">{total[emph.key]}</span>}
          </li>
        )}
      </ul>

      {/* sm and up: the table, scrolling inside its own box */}
      <div tabIndex={0} role="region" aria-label={label} className="hidden max-h-[70vh] overflow-auto rounded-lg border border-slate-200 sm:block">
        <table className="w-full text-[13px]" style={{ minWidth }}>
          <thead className="sticky top-0 z-[1] bg-slate-50 text-left text-xs text-slate-600">
            <tr>{columns.map((c) => <th key={c.key} scope="col" className={`px-3 py-2 font-semibold ${c.num ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={rowKey(r, i)} className={`border-t border-slate-100 ${onRow ? 'cursor-pointer hover:bg-slate-50' : ''}`} onClick={onRow ? () => onRow(r) : undefined}>
                {columns.map((c) => <td key={c.key} className={tdCls(c)}>{cell(c, r)}</td>)}
              </tr>
            ))}
            {total && (
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                {columns.map((c, i) => <td key={c.key} className={`px-3 py-2 ${c.num ? 'text-right tabular-nums' : ''}`}>{total[c.key] ?? (i === 0 ? 'Total' : '')}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
