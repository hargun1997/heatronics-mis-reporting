// GST refund (/accounts/gst-refund, founder 23 Nov 2026): the month's inverted duty refund (Rule 89(5) from 1 Nov 2026: goods +
// input services) from the stored Tally Day Books, which the hourly TDS sync re-reads for the whole year, so the claim is live.
// Tabs: Claim (the formula and what blocks filing) · Check (the scanner: each problem with its fix; class choices are saved as
// rules; AI second opinion) · Inward · Outward. Download = Statement 1A in the GST portal utility's column order + working.
// Data: data/gstRefund/gstRefund.ts · server: routes/gstRefund.ts, services/gstRefund.ts.
import { useMemo, useRef, useState } from 'react';
import { Download, Sparkles, Upload } from 'lucide-react';
import { HeaderMore, PageBody, PageHeader } from '../../components/ui/PageHeader';
import { KpiTile } from '../../components/ui/KpiTile';
import { DataTable } from '../../components/ui/DataTable';
import { Drawer, Modal } from '../../components/ui/overlays';
import { BTN, ErrorBox, InfoTip, Loading, Panel } from '../../components/ui/states';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { FreshnessPill } from '../../components/ui/FreshnessPill';
import { confirmDialog, toast } from '../../components/ui/feedback';
import { dayLabel, inrFull, inrShort } from '../../utils/money';
import {
  askAi, CLASS_WORDS, checksSheet, deleteTwoB, gstr2bRows, leftOutSheet, loadRules, saveMonth, saveRules, saveSettings, saveTwoB,
  statementSheets, useGstRefund, workingSheet,
  type AiSuggestion, type InwardClass, type InwardDoc, type Issue, type OutwardDoc, type RefundApi,
} from '../../data/gstRefund/gstRefund';

type View = 'claim' | 'check' | 'inward' | 'outward';
type Scope = 'bill' | 'party';
const PICK: InwardClass[] = ['input', 'service', 'capital', 'blocked', 'rcm', 'stock-transfer'];

const lastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); };
const monthWords = (m: string) => dayLabel(m);
const gst = (d: { igst: number; cgst: number; sgst: number }) => d.igst + d.cgst + d.sgst;

/** Save a class for one bill or for every bill of its party (used next month too). */
async function setClass(doc: InwardDoc, cls: InwardClass, scope: Scope) {
  const rules = await loadRules();
  if (scope === 'party') rules.parties[doc.party.toLowerCase()] = cls; else rules.bills[doc.guid] = cls;
  await saveRules(rules);
}

function ClassPick({ doc, scope, onDone }: { doc: InwardDoc; scope: Scope; onDone: () => void }) {
  return (
    <select aria-label={`Class of ${doc.party} bill ${doc.invoice}`} value={doc.cls}
      onChange={async (e) => { await setClass(doc, e.target.value as InwardClass, scope); toast(scope === 'party' ? `Saved for every bill of ${doc.party}.` : 'Saved for this bill.'); onDone(); }}
      className="min-h-11 sm:min-h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
      {PICK.map((c) => <option key={c} value={c}>{CLASS_WORDS[c]}</option>)}
    </select>
  );
}

function statusOf(d: InwardDoc): { tone: 'positive' | 'warning' | 'critical' | 'neutral'; text: string } {
  if (d.eligible) return { tone: 'positive', text: d.in2b ? 'In claim · in 2B' : 'In claim' };
  if (d.in2b === false) return { tone: 'critical', text: 'Not in 2B' };
  if (d.leftOut === 'fix the error first') return { tone: 'critical', text: 'Fix first' };
  return { tone: 'neutral', text: 'Left out' };
}

function ClaimView({ api, onEcl }: { api: RefundApi; onEcl: (v: number | null) => void }) {
  const c = api.calc;
  const [ecl, setEcl] = useState(c.ecl == null ? '' : String(c.ecl));
  const rows: [string, number | null, string][] = [
    ['ITC on goods (inputs)', c.itcInputs, 'Eligible goods bills of the month.'],
    ['ITC on input services', c.itcServices, c.servicesLeftOut ? `Services from 1 Nov 2026 only. ${inrShort(c.servicesLeftOut)} of older service GST is left out.` : 'Services with ITC taken on or after 1 Nov 2026.'],
    ['Net ITC', c.netItc, 'Goods + services. Capital goods join from 1 Apr 2027.'],
    ['Inverted turnover', c.invertedTurnover, c.invertedRates.length ? `Sales at ${c.invertedRates.join(' / ')} %. Inputs go up to ${c.topInputRate} %.` : 'No sale rate is below the input rate.'],
    ['Adjusted total turnover', c.adjustedTurnover, 'All taxable sales of this GSTIN, less credit notes.'],
    ['Tax payable on inverted sales', c.taxPayable, 'Output GST on those sales.'],
    ['Maximum refund', c.maxRefund, '(Inverted turnover × Net ITC ÷ Adjusted total turnover) − Tax payable.'],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <Panel title="How the refund is made" action={<InfoTip label="The rule">Rule 89(5) of the CGST Rules, as changed by Notification 05/2026-Central Tax, in force from 1 Nov 2026.</InfoTip>} flush>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, v, how]) => (
              <tr key={label} className="border-b border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{label}<div className="text-xs font-normal text-slate-500">{how}</div></td>
                <td className="px-4 py-2 text-right tabular-nums">{inrFull(v)}</td>
              </tr>
            ))}
            <tr className="border-b border-slate-100">
              <td className="px-4 py-2 font-medium text-slate-900">Credit ledger balance<div className="text-xs font-normal text-slate-500">Lowest balance on the portal from the month end to filing.</div></td>
              <td className="px-4 py-2 text-right">
                <input inputMode="decimal" aria-label="Electronic credit ledger balance" value={ecl} placeholder="Enter ₹"
                  onChange={(e) => setEcl(e.target.value.replace(/[^\d.]/g, ''))}
                  onBlur={() => onEcl(ecl === '' ? null : Number(ecl))}
                  className="min-h-11 sm:min-h-8 w-32 rounded-lg border border-slate-300 px-2 text-right text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" />
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-base font-semibold text-slate-900">Refund to claim</td>
              <td className="px-4 py-3 text-right text-base font-semibold tabular-nums">{inrFull(c.claim)}</td>
            </tr>
          </tbody>
        </table>
      </Panel>
      <div className="space-y-4">
        <Panel title={api.ready ? 'Ready to file' : 'Before you file'} count={api.notReady.length || null}>
          {api.ready ? <p className="text-sm text-slate-700">No problems. Download Statement 1A and file RFD-01.</p> : (
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-800">{api.notReady.map((x) => <li key={x}>{x}</li>)}</ol>
          )}
        </Panel>
        <Panel title="Ties with Tally">
          <ul className="space-y-2 text-sm">
            {api.ties.map((t) => (
              <li key={t.label} className="flex items-start justify-between gap-3">
                <span><span className="font-medium text-slate-900">{t.label}</span><span className="block text-xs text-slate-500">{t.note}</span></span>
                <StatusPill toneName={t.ok ? 'positive' : 'critical'} size="sm" dot>{t.ok ? 'Ties' : `Off by ${inrFull(t.diff)}`}</StatusPill>
              </li>
            ))}
          </ul>
        </Panel>
        {api.drift && (api.drift.added.length || api.drift.removed.length || api.drift.changed.length) ? (
          <Panel title="Changed in Tally after filing">
            <p className="text-sm text-slate-700">{api.drift.added.length} bill(s) added, {api.drift.removed.length} removed, {api.drift.changed.length} changed. Net ITC moved by {inrFull(api.drift.diff)}.</p>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

function CheckView({ api, reload }: { api: RefundApi; reload: () => void }) {
  const [scope, setScope] = useState<Scope>('party');
  const [ai, setAi] = useState<Record<string, AiSuggestion>>({});
  const [busy, setBusy] = useState(false);
  const byKey = useMemo(() => new Map(api.inward.map((d) => [d.key, d])), [api.inward]);
  const groups: [string, Issue[]][] = [
    ['Errors: the row stays out of the claim', api.issues.filter((i) => i.severity === 'error')],
    ['Check these', api.issues.filter((i) => i.severity === 'warn')],
    ['Class not clear', api.issues.filter((i) => i.severity === 'info')],
  ];
  const runAi = async () => {
    setBusy(true);
    try {
      const out = await askAi(api.month);
      if (out.error) toast(out.error);
      setAi(Object.fromEntries(out.suggestions.map((s) => [s.key, s])));
      if (!out.error) toast(out.suggestions.length ? `AI looked at ${out.suggestions.length} bill(s).` : 'No bill needs a second opinion.');
    } finally { setBusy(false); }
  };
  if (!api.issues.length) return <Panel title="Check"><p className="text-sm text-slate-700">No problems found in this month.</p></Panel>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-700">Save a class choice for</span>
        <SegmentedControl size="sm" aria-label="Save the choice for" value={scope} onChange={setScope} options={[{ id: 'party', label: 'Every bill of the party' }, { id: 'bill', label: 'This bill' }]} />
        <Button busy={busy} busyLabel="Asking AI" onClick={() => void runAi()}><Sparkles className="h-4 w-4" aria-hidden />Ask AI about unclear bills</Button>
      </div>
      {groups.filter(([, list]) => list.length).map(([title, list]) => (
        <Panel key={title} title={title} count={list.length} flush>
          <ul className="divide-y divide-slate-100">
            {list.slice(0, 40).map((i, n) => {
              const doc = byKey.get(i.key);
              const s = ai[i.key];
              return (
                <li key={`${i.key}-${i.code}-${n}`} className="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="text-slate-900">{i.text}</p>
                    <p className="text-slate-600">Fix: {i.fix}</p>
                    {s && <p className="mt-1 text-slate-700"><span className="font-semibold">AI:</span> {CLASS_WORDS[s.cls]} ({s.confidence}). {s.why}</p>}
                  </div>
                  {doc && (i.code === 'check-class' || i.code === 'blocked' || i.code === 'capital') && (
                    <div className="flex items-center gap-2">
                      {s && s.cls !== doc.cls && <Button size="sm" onClick={async () => { await setClass(doc, s.cls, scope); toast('AI choice saved.'); reload(); }}>Accept AI</Button>}
                      <ClassPick doc={doc} scope={scope} onDone={reload} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {list.length > 40 && <p className="px-4 py-2 text-xs text-slate-500">{list.length - 40} more in the Download (sheet Checks).</p>}
        </Panel>
      ))}
    </div>
  );
}

function InwardView({ api, reload }: { api: RefundApi; reload: () => void }) {
  const [open, setOpen] = useState<InwardDoc | null>(null);
  const [only, setOnly] = useState<'all' | 'in' | 'out'>('all');
  const rows = api.inward.filter((d) => (only === 'all' ? true : only === 'in' ? d.eligible : !d.eligible));
  return (
    <>
      <div className="mb-3"><SegmentedControl size="sm" aria-label="Show" value={only} onChange={setOnly} options={[
        { id: 'all', label: `All ${api.inward.length}` }, { id: 'in', label: `In claim ${api.counts.eligible}` }, { id: 'out', label: `Left out ${api.inward.length - api.counts.eligible}` }]} /></div>
      <DataTable label="Supplier bills" rowKey={(d) => d.guid} rows={rows} onRow={setOpen} limit={20}
        columns={[
          { key: 'date', label: 'Date', cell: (d) => dayLabel(d.date), quiet: true },
          { key: 'party', label: 'Supplier', main: true, cell: (d) => <span>{d.party}<span className="block text-xs text-slate-500">{d.invoice || 'No bill no.'}</span></span> },
          { key: 'taxable', label: 'Taxable', num: true, cell: (d) => inrFull(d.taxable) },
          { key: 'gst', label: 'GST', num: true, emph: true, cell: (d) => inrFull(gst(d)) },
          { key: 'cls', label: 'Class', wideOnly: true, cell: (d) => CLASS_WORDS[d.cls] },
          { key: 'st', label: 'Status', cell: (d) => { const s = statusOf(d); return <StatusPill toneName={s.tone} size="sm">{s.text}</StatusPill>; } },
        ]}
        total={{ gst: inrFull(rows.filter((d) => d.eligible).reduce((s, d) => s + gst(d), 0)), taxable: '' }} />
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? open.party : ''} subtitle={open ? `${open.vType} ${open.number} · ${dayLabel(open.date)}` : ''}>
        {open && (
          <div className="space-y-3 p-4 text-sm">
            <dl className="grid grid-cols-[120px_1fr] gap-y-1.5">
              <dt className="text-slate-500">GSTIN</dt><dd>{open.gstin || 'None'}</dd>
              <dt className="text-slate-500">Bill no.</dt><dd>{open.invoice || 'None'} {open.invoiceDate && `(${dayLabel(open.invoiceDate)})`}</dd>
              <dt className="text-slate-500">Taxable</dt><dd>{inrFull(open.taxable)}</dd>
              <dt className="text-slate-500">GST</dt><dd>{inrFull(gst(open))} {open.rate != null && `at ${open.rate} %`}</dd>
              <dt className="text-slate-500">Ledgers</dt><dd>{open.ledgers}</dd>
              <dt className="text-slate-500">Narration</dt><dd>{open.narration || 'None'}</dd>
              <dt className="text-slate-500">Class</dt><dd>{CLASS_WORDS[open.cls]}: {open.why}</dd>
              <dt className="text-slate-500">In claim</dt><dd>{open.eligible ? 'Yes' : `No: ${open.leftOut}`}</dd>
            </dl>
            <div className="flex items-center gap-2"><span className="text-slate-700">Set class (every bill of this party):</span>
              <ClassPick doc={open} scope="party" onDone={() => { setOpen(null); reload(); }} /></div>
          </div>
        )}
      </Drawer>
    </>
  );
}

function OutwardView({ api }: { api: RefundApi }) {
  const byType = (['B2B', 'B2C-Large', 'B2C-Small'] as const).map((t) => {
    const r = api.outward.filter((o) => o.supplyType === t);
    return { t, n: r.length, taxable: r.reduce((s, o) => s + o.taxable, 0), tax: r.reduce((s, o) => s + gst(o), 0) };
  });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">{byType.map((b) => <KpiTile key={b.t} label={b.t} value={inrShort(b.taxable)} sub={`${b.n} documents · GST ${inrShort(b.tax)}`} />)}</div>
      <DataTable<OutwardDoc> label="Sales documents" rowKey={(o) => o.key} rows={api.outward} limit={20}
        columns={[
          { key: 'date', label: 'Date', cell: (o) => dayLabel(o.date), quiet: true },
          { key: 'number', label: 'Document', main: true, cell: (o) => <span>{o.number}<span className="block text-xs text-slate-500">{o.vType}</span></span> },
          { key: 'type', label: 'Type', cell: (o) => `${o.supplyType}${o.docType === 'Credit Note' ? ' · Credit note' : ''}` },
          { key: 'taxable', label: 'Taxable', num: true, cell: (o) => inrFull(o.taxable) },
          { key: 'gst', label: 'GST', num: true, emph: true, cell: (o) => inrFull(gst(o)) },
        ]} />
    </div>
  );
}

export function GstRefundPage() {
  const [month, setMonth] = useState(() => (lastMonth() < '2026-11' ? '2026-11' : lastMonth()));
  const [view, setView] = useState<View>('claim');
  const { api, error, loading, reload } = useGstRefund(month);
  const file = useRef<HTMLInputElement>(null);
  const [filing, setFiling] = useState(false);
  const [arn, setArn] = useState('');
  const [setup, setSetup] = useState(false);
  const [gstin, setGstin] = useState('');

  const tabs = [
    { id: 'claim', label: 'Claim' },
    { id: 'check', label: 'Check', count: api ? api.counts.errors + api.counts.warns + api.counts.checks : undefined },
    { id: 'inward', label: 'Inward', count: api?.counts.inward },
    { id: 'outward', label: 'Outward', count: api?.counts.outward },
  ];

  const download = async () => {
    if (!api) return;
    if (!api.gstin) toast('The GSTIN is empty in the file. Enter it in Settings.');
    const { downloadStyledReport } = await import('../../utils/tdsReportExport');
    downloadStyledReport(`GST refund ${month} Statement 1A.xlsx`, [
      ...statementSheets(api).map((s) => ({ ...s, kind: 'table' as const })),
      { name: 'Working', rows: workingSheet(api), kind: 'table', headerRows: [3] },
      { name: 'Left out', rows: leftOutSheet(api), kind: 'table', headerRows: [0] },
      { name: 'Checks', rows: checksSheet(api), kind: 'table', headerRows: [0] },
    ]);
  };
  const pick2b = async (f: File) => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false });
      const sheets = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null }) }));
      const got = gstr2bRows(sheets);
      if (!got.rows.length) return toast('No B2B bills found. Upload the GSTR-2B Excel from the GST portal.');
      const ok = await confirmDialog({ title: `Use this GSTR-2B for ${monthWords(month)}?`, body: `${got.rows.length} bills read from ${got.sheets.join(', ')}.${got.skipped ? ` ${got.skipped} rows skipped.` : ''}`, confirm: 'Save' });
      if (!ok) return;
      await saveTwoB(month, got.rows, f.name);
      toast(`File accepted: ${got.rows.length} bills from GSTR-2B.`);
      reload();
    } catch (e) { toast(`The file did not open. ${e instanceof Error ? e.message : ''}`.trim()); }
  };

  const filed = api?.record.filed;
  const status = !api ? null : filed
    ? <StatusPill toneName="positive" size="sm" dot>Filed · {filed.arn}</StatusPill>
    : api.ready ? <StatusPill toneName="positive" size="sm" dot>Ready</StatusPill>
      : <StatusPill toneName="warning" size="sm" dot>Not ready · {api.notReady.length}</StatusPill>;

  return (
    <>
      <PageHeader
        title="GST refund"
        description="The refund of GST stuck on inputs and services, for 1 month, from Tally."
        status={<span className="inline-flex items-center gap-2">{status}<FreshnessPill label="Tally" asOf={api?.reachedAt}
          notes={api ? [api.booksAsOf ? `Day Book of ${monthWords(month)} copied ${dayLabel(api.booksAsOf)}.` : 'No Day Book for this month yet.', 'The TDS sync reads the whole year from Tally every hour.'] : []} /></span>}
        help={<ul className="space-y-1"><li className="!list-disc">Goods and input services count from 1 Nov 2026. Capital goods count from 1 Apr 2027.</li><li className="!list-disc">A bill counts only when it is in GSTR-2B.</li><li className="!list-disc">Other state GSTINs (Amazon warehouses) are left out.</li></ul>}
        tabs={tabs} tab={view} onTab={(id) => setView(id as View)}
        actions={<>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span className="sr-only sm:not-sr-only">Month</span>
            <input type="month" min="2026-04" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month of the claim"
              className="min-h-11 w-[150px] sm:w-auto sm:min-h-9 rounded-lg border border-slate-300 bg-white px-2 sm:px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" />
          </label>
          <Button variant="primary" disabled={!api} onClick={() => void download()}><Download className="h-4 w-4" aria-hidden />Download Statement 1A</Button>
          <HeaderMore>
            <button type="button" className={BTN} onClick={() => file.current?.click()}><Upload className="h-4 w-4" aria-hidden />{api?.twoB.uploaded ? 'Replace GSTR-2B' : 'Upload GSTR-2B'}</button>
            <button type="button" className={BTN} disabled={!api} onClick={() => setFiling(true)}>{filed ? 'Filed record' : 'Mark as filed'}</button>
            <button type="button" className={BTN} onClick={() => { setGstin(api?.settings.gstin ?? ''); setSetup(true); }}>Settings</button>
          </HeaderMore>
          <input ref={file} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick2b(f); }} />
        </>}
      />
      <PageBody>
        {error && <ErrorBox>{error}</ErrorBox>}
        {loading && !api && <Loading label="Reading the Tally Day Book" />}
        {api && !api.stored && <ErrorBox>No Tally Day Book for {monthWords(month)} yet. Open TDS and select Sync with Tally.</ErrorBox>}
        {api && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiTile label="Refund to claim" value={inrShort(api.calc.claim)} tone={api.ready ? 'default' : 'warning'} sub={api.calc.ecl == null ? 'Credit ledger not entered' : 'Capped by the credit ledger'} />
              <KpiTile label="Net ITC" value={inrShort(api.calc.netItc)} sub={`Goods ${inrShort(api.calc.itcInputs)} · services ${inrShort(api.calc.itcServices)}`} />
              <KpiTile label="Inverted turnover" value={inrShort(api.calc.invertedTurnover)} sub={`Tax on it ${inrShort(api.calc.taxPayable)}`} />
              <KpiTile label="GSTR-2B" value={api.twoB.uploaded ? `${api.twoB.matched} / ${api.twoB.rows}` : null} sub={api.twoB.uploaded ? `${api.twoB.notInTally.length} in 2B, not in Tally` : 'Upload the 2B Excel'} tone={api.twoB.uploaded ? 'default' : 'warning'} />
            </div>
            {view === 'claim' && <ClaimView key={month} api={api} onEcl={async (v) => { await saveMonth(month, { ecl: v }); reload(); }} />}
            {view === 'check' && <CheckView api={api} reload={reload} />}
            {view === 'inward' && <InwardView api={api} reload={reload} />}
            {view === 'outward' && <OutwardView api={api} />}
            {api.twoBFile && (
              <p className="text-xs text-slate-500">GSTR-2B: {api.twoBFile.file}, saved {dayLabel(api.twoBFile.uploadedAt)}.{' '}
                <button type="button" className="underline" onClick={async () => { if (await confirmDialog({ title: 'Remove this GSTR-2B?', body: 'The claim goes back to Tally only.', confirm: 'Remove' })) { await deleteTwoB(month); reload(); } }}>Remove</button></p>
            )}
          </>
        )}
      </PageBody>

      <Modal open={filing} onClose={() => setFiling(false)} title={filed ? `Filed: ${monthWords(month)}` : `Mark ${monthWords(month)} as filed`}
        footer={filed
          ? <Button variant="danger-outline" onClick={async () => { await saveMonth(month, { unfile: true }); setFiling(false); reload(); }}>Remove the filed record</Button>
          : <Button variant="primary" onClick={async () => {
            try { await saveMonth(month, { filed: { arn, filedOn: new Date().toISOString().slice(0, 10), amount: api?.calc.claim ?? 0 } }); toast('Filed record saved. Later Tally changes show on Claim.'); setFiling(false); reload(); }
            catch (e) { toast(e instanceof Error ? e.message : 'Not saved.'); }
          }}>Save</Button>}>
        {filed ? (
          <p className="text-sm text-slate-700">ARN {filed.arn}, filed {dayLabel(filed.filedOn)}, {inrFull(filed.amount)}.</p>
        ) : (
          <label className="block text-sm text-slate-700">ARN from the GST portal
            <input value={arn} onChange={(e) => setArn(e.target.value.toUpperCase())} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" />
            <span className="mt-1 block text-xs text-slate-500">The claim of {inrFull(api?.calc.claim)} is kept as filed.</span>
          </label>
        )}
      </Modal>

      <Modal open={setup} onClose={() => setSetup(false)} title="Settings"
        footer={<Button variant="primary" onClick={async () => { try { await saveSettings({ gstin, homeState: api?.settings.homeState ?? 'UTTAR PRADESH' }); toast('Saved.'); setSetup(false); reload(); } catch (e) { toast(e instanceof Error ? e.message : 'Not saved.'); } }}>Save</Button>}>
        <label className="block text-sm text-slate-700">GSTIN of the factory (goes into Statement 1A)
          <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} maxLength={15} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" />
        </label>
        <p className="mt-2 text-xs text-slate-500">Home state: {api?.settings.homeState ?? 'UTTAR PRADESH'}. Vouchers of other state GSTINs are left out.</p>
      </Modal>
    </>
  );
}

export default GstRefundPage;
