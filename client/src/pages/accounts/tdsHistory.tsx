// TDS page → History: every month of the financial year (April →). Filing rule (founder, 22 Nov 2026): a month the
// accounts team has FILED shows their report (uploaded here); Tally only checks it, and every difference is a deviation.
// A month not filed yet shows Tally. Select a month to see its deviations; Download = its report + "Deviations from Tally".
// Data: GET /api/tds/history (stored Day Books, invoice memory, filed reports). Matching: data/tds/filed.ts.
import { useMemo, useRef, useState } from 'react';
import { DataTable } from '../../components/ui/DataTable';
import { KpiTile } from '../../components/ui/KpiTile';
import { Button } from '../../components/ui/Button';
import { Drawer, Modal } from '../../components/ui/overlays';
import { InfoTip, Panel } from '../../components/ui/states';
import { StatusPill } from '../../components/ui/StatusPill';
import { confirmDialog, toast } from '../../components/ui/feedback';
import { dateLabel, monthLabel } from '../../data/tds/tds';
import { deleteFiled, saveFiled, type HistoryApi, type HistoryMonth, type MonthState } from '../../data/tds/invoices';
import { STATE_WORDS } from '../../data/tds/tdsFormats';
import { KIND_WORDS, matchFiled, monthReport, parseFiledWorkbook, type Deviation, type FiledDoc, type MonthCheck } from '../../data/tds/filed';
import { compareFiled, filedFor } from '../../data/tds/filedReports';
import { downloadHistory, inr } from '../../data/tds/useTds';

const TONE: Record<MonthState, 'positive' | 'warning' | 'critical' | 'neutral'> = { ok: 'positive', stale: 'warning', partial: 'warning', missing: 'critical', running: 'neutral' };
const KIND_TONE: Record<Deviation['kind'], 'warning' | 'critical' | 'neutral'> = { moved: 'neutral', 'not-in-tally': 'critical', 'not-filed': 'critical', 'tds-differs': 'warning', 'filed-elsewhere': 'neutral' };

export function HistoryView({ api, reload }: { api: HistoryApi; reload: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [staged, setStaged] = useState<FiledDoc[] | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { checks, usedKeys } = useMemo(() => matchFiled(api.months.map((m) => m.filed).filter((f): f is FiledDoc => !!f), new Map(api.months.map((m) => [m.month, m.rows]))), [api]);
  const tdsOf = (m: HistoryMonth) => (m.filed ? m.filed.netPayable : monthReport(m.month, null, m.rows, usedKeys).grand);
  const devCount = (m: HistoryMonth) => checks.get(m.month)?.deviations.length ?? 0;
  const fyTag = api.fy ? `FY ${api.fy}-${String(Number(api.fy) + 1).slice(2)}` : 'FY';
  const closed = api.months.filter((m) => m.state !== 'running');
  const filedN = api.months.filter((m) => m.filed).length;
  const devTotal = api.months.reduce((s, m) => s + devCount(m), 0);
  const months = [...api.months].reverse();
  const allMonths = api.months.map((m) => m.month);

  const pickFile = async (f: File) => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const sheets = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null }) }));
      const docs = parseFiledWorkbook(sheets, f.name);
      if (!docs.length) return toast('No TDS report found in this file. Check that it is the filed report.');
      setStaged(docs);
    } catch (e) {
      toast(`The file did not open. ${e instanceof Error ? e.message : ''}`.trim());
    }
  };
  const saveAll = async () => {
    if (!staged) return;
    setSaving(true);
    try {
      for (const d of staged) await saveFiled(d);
      toast(`Files accepted: ${staged.map((d) => monthLabel(d.month)).join(', ')}.`);
      setStaged(null);
      reload();
    } catch (e) {
      toast(`Not saved. ${e instanceof Error ? e.message : ''}`.trim());
    } finally {
      setSaving(false);
    }
  };

  const openMonth = api.months.find((m) => m.month === open) ?? null;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiTile label={`TDS ${fyTag}`} value={inr(api.months.reduce((s, m) => s + tdsOf(m), 0))} sub="Filed months as filed, others from Tally" />
        <KpiTile label="Months filed" value={String(filedN)} sub={`of ${closed.length} closed`} />
        <KpiTile label="Deviations from Tally" value={String(devTotal)} tone={devTotal ? 'warning' : 'default'} sub={devTotal ? 'Select a month to see them' : 'None'} />
      </div>
      <Panel title={`TDS reports · ${fyTag}`}
        action={<span className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" aria-label="Filed TDS report file"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pickFile(f); }} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>Upload filed report</Button>
          <Button variant="secondary" onClick={() => void downloadHistory(fyTag, api.months, allMonths)}>Download all months</Button>
        </span>}>
        <DataTable label={`TDS reports ${fyTag}`} rows={months} rowKey={(m) => m.month} limit={0} onRow={(m) => setOpen(m.month)}
          columns={[
            { key: 'month', label: 'Month', main: true, cell: (m) => <span className="text-slate-900">{monthLabel(m.month)}{!m.filed && m.note && <span className="block text-xs text-slate-500">{m.note}</span>}</span> },
            { key: 'source', label: 'Source', cell: (m) => (m.filed
              ? <StatusPill toneName="positive" size="sm">Filed</StatusPill>
              : <StatusPill toneName={TONE[m.state]} size="sm">Tally · {STATE_WORDS[m.state]}</StatusPill>) },
            { key: 'asof', label: 'Tally as of', wideOnly: true, cell: (m) => (m.booksAsOf ? dateLabel(m.booksAsOf.slice(0, 10)) : '–') },
            { key: 'tds', label: 'TDS', num: true, emph: true, cell: (m) => inr(tdsOf(m)) },
            { key: 'check', label: 'Tally check', cell: (m) => <CheckCell m={m} n={devCount(m)} grand={tdsOf(m)} totals={monthReport(m.month, null, m.rows, usedKeys).totals} /> },
            { key: 'dl', label: 'Report', cell: (m) => (
              <Button variant="text" size="sm" onClick={(e) => { e.stopPropagation(); void downloadHistory(monthLabel(m.month), api.months, [m.month]); }}>Download</Button>
            ) },
          ]} />
      </Panel>

      <Modal open={!!staged} onClose={() => setStaged(null)} title="Save the filed reports" width={620}
        footer={<span className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setStaged(null)}>Cancel</Button>
          <Button variant="primary" busy={saving} busyLabel="Saving" onClick={() => void saveAll()}>Save {staged?.length ?? 0} month{staged?.length === 1 ? '' : 's'}</Button>
        </span>}>
        <div className="space-y-3 p-4 text-sm">
          <p className="text-slate-700">These months become filed. Their numbers come from this file. Tally checks them.</p>
          <DataTable label="Months in the file" rows={staged ?? []} rowKey={(d) => d.month} limit={0}
            columns={[
              { key: 'm', label: 'Month', main: true, cell: (d) => monthLabel(d.month) },
              { key: 'b', label: 'Bills', num: true, cell: (d) => d.rows.length },
              { key: 't', label: 'Net payable', num: true, emph: true, cell: (d) => inr(d.netPayable) },
              { key: 'n', label: 'Notes', cell: (d) => {
                const prev = api.months.find((m) => m.month === d.month)?.filed;
                const notes = [...(prev ? [`Replaces the upload of ${dateLabel((prev.uploadedAt ?? '').slice(0, 10))}.`] : []), ...d.warnings];
                return notes.length ? <InfoTip label="Notes" text={`${notes.length} note${notes.length > 1 ? 's' : ''}`}>{notes.map((w) => <p key={w}>{w}</p>)}</InfoTip> : '–';
              } },
            ]} />
        </div>
      </Modal>

      <Drawer open={!!openMonth} onClose={() => setOpen(null)} title={openMonth ? monthLabel(openMonth.month) : ''} width={720}>
        {openMonth && <MonthDetail m={openMonth} c={checks.get(openMonth.month)} onRemoved={() => { setOpen(null); reload(); }} />}
      </Drawer>
    </>
  );
}

/** Filed month: deviations count. Not uploaded but the team's totals are known: the old block compare. Else "Not filed". */
function CheckCell({ m, n, totals }: { m: HistoryMonth; n: number; grand: number; totals: Parameters<typeof compareFiled>[0] }) {
  if (m.filed) return n ? <StatusPill toneName="warning" size="sm">{n} to check</StatusPill> : <StatusPill toneName="positive" size="sm">Matches</StatusPill>;
  const f = filedFor(m.month);
  if (f) {
    const c = compareFiled(totals, f);
    return c.matches ? <StatusPill toneName="positive" size="sm">Matches totals</StatusPill>
      : <StatusPill toneName="warning" size="sm">{c.diff > 0 ? '+' : '-'}{inr(Math.abs(c.diff))} vs filed totals</StatusPill>;
  }
  return n ? <StatusPill toneName="neutral" size="sm">{n} to check</StatusPill> : <span className="text-slate-500">Not filed</span>;
}

function MonthDetail({ m, c, onRemoved }: { m: HistoryMonth; c: MonthCheck | undefined; onRemoved: () => void }) {
  const devs = c?.deviations ?? [];
  const remove = async () => {
    const ok = await confirmDialog({ title: `Remove the filed report of ${monthLabel(m.month)}?`, body: 'The month goes back to Tally numbers.', confirm: 'Remove', danger: true });
    if (!ok) return;
    try { await deleteFiled(m.month); toast('Filed report removed.'); onRemoved(); } catch (e) { toast(`Not removed. ${e instanceof Error ? e.message : ''}`.trim()); }
  };
  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {m.filed
          ? <><StatusPill toneName="positive" size="sm">Filed</StatusPill><span className="text-slate-700">{m.filed.fileName} · uploaded {dateLabel((m.filed.uploadedAt ?? '').slice(0, 10))}{m.filed.uploadedBy ? ` by ${m.filed.uploadedBy}` : ''}</span></>
          : <><StatusPill toneName="neutral" size="sm">Tally</StatusPill><span className="text-slate-700">Not filed. Numbers come from Tally.</span></>}
      </div>
      {c?.filed && c.sections.length > 0 && (
        <DataTable label="Sections: filed and Tally" rows={c.sections} rowKey={(s) => s.id} limit={0}
          columns={[
            { key: 's', label: 'Section', main: true, cell: (s) => s.id === 'others' ? 'Advertisement' : s.id === 'jobwork' ? 'Job work' : s.id[0].toUpperCase() + s.id.slice(1) },
            { key: 'f', label: 'Filed', num: true, cell: (s) => inr(s.filed) },
            { key: 't', label: 'Tally', num: true, cell: (s) => inr(s.tally) },
            { key: 'd', label: 'Difference', num: true, emph: true, cell: (s) => (Math.abs(s.diff) <= 1 ? '–' : inr(s.diff)) },
          ]} />
      )}
      <DataTable label="Deviations from Tally" rows={devs} rowKey={(d) => `${d.kind}-${d.party}-${d.billNo}-${d.tallyDate}`} limit={0} empty="No deviations."
        columns={[
          { key: 'k', label: 'Type', cell: (d) => <StatusPill toneName={KIND_TONE[d.kind]} size="sm">{KIND_WORDS[d.kind]}</StatusPill> },
          { key: 'p', label: 'Party', main: true, cell: (d) => <span className="text-slate-900">{d.party}<span className="block text-xs text-slate-500">Bill {d.billNo || '–'} · {d.note}</span></span> },
          { key: 'td', label: 'Tally date', cell: (d) => (d.tallyDate ? dateLabel(d.tallyDate) : '–') },
          { key: 'fm', label: 'Filed in', wideOnly: true, cell: (d) => (d.filedMonth ? monthLabel(d.filedMonth) : '–') },
          { key: 'ft', label: 'Filed TDS', num: true, cell: (d) => (d.filedTds == null ? '–' : inr(d.filedTds)) },
          { key: 'tt', label: 'Tally TDS', num: true, cell: (d) => (d.tallyTds == null ? '–' : inr(d.tallyTds)) },
        ]} />
      {m.filed && <div className="flex justify-end"><Button variant="text" size="sm" onClick={() => void remove()}>Remove the filed report</Button></div>}
    </div>
  );
}
