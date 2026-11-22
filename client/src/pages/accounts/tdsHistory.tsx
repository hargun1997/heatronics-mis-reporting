// TDS page → History: every month of the financial year (April →) with how far its Tally data can be trusted and a
// download of that month's TDS report in the accounts team's layout; "Download all months" = one sheet per month.
// Data: GET /api/tds/history (stored Day Books + the invoice memory). A month that is not OK is flagged in the sheet too.
import { DataTable } from '../../components/ui/DataTable';
import { KpiTile } from '../../components/ui/KpiTile';
import { Button } from '../../components/ui/Button';
import { Panel } from '../../components/ui/states';
import { StatusPill } from '../../components/ui/StatusPill';
import { dateLabel, monthLabel } from '../../data/tds/tds';
import type { HistoryApi, HistoryMonth, MonthState } from '../../data/tds/invoices';
import { REPORT_BLOCKS, STATE_WORDS, tdsReportSheet } from '../../data/tds/tdsFormats';
import { compareFiled, filedFor } from '../../data/tds/filedReports';
import { InfoTip } from '../../components/ui/states';
import { downloadHistory, inr } from '../../data/tds/useTds';

const TONE: Record<MonthState, 'positive' | 'warning' | 'critical' | 'neutral'> = { ok: 'positive', stale: 'warning', partial: 'warning', missing: 'critical', running: 'neutral' };

export function HistoryView({ api }: { api: HistoryApi }) {
  const months = [...api.months].reverse();
  const tds = (m: HistoryMonth) => tdsReportSheet(m.month, m.rows).grand;
  const vsFiled = (m: HistoryMonth) => { const f = filedFor(m.month); return f ? { f, c: compareFiled(tdsReportSheet(m.month, m.rows).totals, f) } : null; };
  const flagged = api.months.filter((m) => (m.state !== 'ok' && m.state !== 'running') || (vsFiled(m) && !vsFiled(m)!.c.matches));
  const fyTag = api.fy ? `FY ${api.fy}-${String(Number(api.fy) + 1).slice(2)}` : 'FY';
  const total = api.months.reduce((s, m) => s + tds(m), 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiTile label={`TDS ${fyTag}`} value={inr(total)} sub={`${api.months.length} months`} />
        <KpiTile label="Months OK" value={String(api.months.filter((m) => m.state === 'ok').length)} sub={`of ${api.months.filter((m) => m.state !== 'running').length} closed`} />
        <KpiTile label="Months to check" value={String(flagged.length)} tone={flagged.length ? 'warning' : 'default'}
          sub={flagged.length ? flagged.map((m) => monthLabel(m.month)).slice(0, 3).join(', ') : 'Data is complete'} />
      </div>
      <Panel title={`TDS reports · ${fyTag}`}
        action={<Button variant="secondary" onClick={() => void downloadHistory(fyTag, api.months)}>Download all months</Button>}>
        <DataTable label={`TDS reports ${fyTag}`} rows={months} rowKey={(m) => m.month} limit={0}
          columns={[
            { key: 'month', label: 'Month', main: true, cell: (m) => <span className="text-slate-900">{monthLabel(m.month)}{m.note && <span className="block text-xs text-slate-500">{m.note}</span>}</span> },
            { key: 'state', label: 'Data', cell: (m) => <StatusPill toneName={TONE[m.state]} size="sm">{STATE_WORDS[m.state]}</StatusPill> },
            { key: 'asof', label: 'Data as of', wideOnly: true, cell: (m) => (m.booksAsOf ? dateLabel(m.booksAsOf.slice(0, 10)) : '–') },
            { key: 'bills', label: 'Bills with TDS', num: true, wideOnly: true, cell: (m) => m.rows.filter((r) => r.status === 'active').length },
            { key: 'tds', label: 'TDS', num: true, emph: true, cell: (m) => inr(tds(m)) },
            { key: 'filed', label: 'Filed report', cell: (m) => <FiledCell v={vsFiled(m)} /> },
            { key: 'dl', label: 'Report', cell: (m) => (
              <Button variant="text" size="sm" onClick={(e) => { e.stopPropagation(); void downloadHistory(`${monthLabel(m.month)}`, [m]); }}>Download</Button>
            ) },
          ]} />
      </Panel>
    </>
  );
}

const blockName = (id: string) => REPORT_BLOCKS.find((b) => b.id === id)?.summary ?? id;

/** Built from Tally vs the report the team filed: "Matches", or the difference with the blocks behind an "i". */
function FiledCell({ v }: { v: { f: NonNullable<ReturnType<typeof filedFor>>; c: ReturnType<typeof compareFiled> } | null }) {
  if (!v) return <span className="text-slate-500">Not filed</span>;
  const { f, c } = v;
  return (
    <span className="inline-flex items-center gap-1">
      {c.matches ? <StatusPill toneName="positive" size="sm">Matches</StatusPill> : <StatusPill toneName="warning" size="sm">{c.diff > 0 ? '+' : '-'}{inr(Math.abs(c.diff))} vs filed</StatusPill>}
      <InfoTip label="Compare with the filed report" align="right">
        <table className="text-label">
          <thead><tr className="text-left text-slate-600"><th className="pr-3">Block</th><th className="pr-3 text-right">Filed</th><th className="pr-3 text-right">Tally</th><th className="text-right">Difference</th></tr></thead>
          <tbody>{c.rows.map((r) => (
            <tr key={r.id}><td className="pr-3">{blockName(r.id)}</td><td className="pr-3 text-right tabular-nums">{inr(r.filed)}</td><td className="pr-3 text-right tabular-nums">{inr(r.tally)}</td>
              <td className={`text-right tabular-nums ${Math.abs(r.diff) > 1 ? 'text-amber-800' : ''}`}>{inr(r.diff)}</td></tr>
          ))}</tbody>
        </table>
        <p className="mt-2">Total payable in the filed report: {inr(f.netPayable ?? f.totalPayable)}.</p>
        {f.notes?.map((n) => <p key={n}>{n}</p>)}
      </InfoTip>
    </span>
  );
}
