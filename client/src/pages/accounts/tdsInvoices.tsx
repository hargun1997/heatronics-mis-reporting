// TDS page → Invoices: every supplier bill of the month from Tally, kept across syncs (edited / removed bills stay
// visible). Data: data/tds/invoices.ts (GET /api/tds/invoices). Select a row to see its detail and its change log.
import { Fragment, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { KpiTile } from '../../components/ui/KpiTile';
import { DataTable } from '../../components/ui/DataTable';
import { Drawer } from '../../components/ui/overlays';
import { Empty, Panel } from '../../components/ui/states';
import { StatusPill } from '../../components/ui/StatusPill';
import { dateLabel, monthLabel } from '../../data/tds/tds';
import { rowRate, rowSection, type InvoiceRow, type InvoicesApi } from '../../data/tds/invoices';
import { inr } from '../../data/tds/useTds';

const statusOf = (r: InvoiceRow) => (r.status === 'removed' ? 'removed' : r.changes.some((c) => c.field !== 'status') ? 'edited' : 'ok');

function RowStatus({ r }: { r: InvoiceRow }) {
  const s = statusOf(r);
  if (s === 'removed') return <StatusPill toneName="critical" size="sm">Removed</StatusPill>;
  if (s === 'edited') return <StatusPill toneName="warning" size="sm">Edited</StatusPill>;
  return null;
}

export function InvoicesView({ api, month, onSync, syncing }: { api: InvoicesApi; month: string; onSync: () => void; syncing: boolean }) {
  const [open, setOpen] = useState<InvoiceRow | null>(null);
  const s = api.summary;
  if (!api.stored) {
    return (
      <div role="status">
        <Empty title={`No Tally Day Book for ${monthLabel(month)}`} hint="Open TallyPrime on the cloud. Then select Sync with Tally."
          action={<Button variant="primary" busy={syncing} busyLabel="Syncing" onClick={onSync}>Sync with Tally</Button>} />
      </div>
    );
  }
  const rows = [...api.rows].sort((a, b) => (a.status === b.status ? a.date.localeCompare(b.date) : a.status === 'removed' ? 1 : -1));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Supplier bills" value={String(s.bills)} sub={`${s.suppliers} suppliers`} />
        <KpiTile label="Taxable value" value={inr(s.taxable)} sub={monthLabel(month)} />
        <KpiTile label="TDS on bills" value={inr(s.tds)} sub={`${s.withTds} bills with TDS`} />
        <KpiTile label="Changed in Tally" value={String(s.edited + s.removed)} tone={s.edited + s.removed ? 'warning' : 'default'} sub={`${s.edited} edited · ${s.removed} removed`} />
      </div>
      {api.duplicates.length > 0 && (
        <Panel title="Booked twice?" count={api.duplicates.length}>
          <ol className="space-y-1 text-sm text-amber-800">
            {api.duplicates.map((d, i) => (
              <li key={`${d.supplier}-${d.invoiceNo}`}>{i + 1}. {d.supplier}, bill {d.invoiceNo}: {d.voucherNos.join(' and ')} ({inr(d.total)}). Check in Tally.</li>
            ))}
          </ol>
        </Panel>
      )}
      <Panel title="Supplier bills" count={rows.length}>
        <DataTable label={`Supplier bills of ${monthLabel(month)}`} rows={rows} rowKey={(r) => r.key} onRow={setOpen} limit={20}
          columns={[
            { key: 'date', label: 'Date', cell: (r) => dateLabel(r.date) },
            { key: 'supplier', label: 'Supplier', main: true, cell: (r) => <span className="text-slate-900">{r.supplier} <RowStatus r={r} /><span className="block text-xs text-slate-500">{r.voucherType} {r.voucherNo}{r.invoiceNo ? ` · bill ${r.invoiceNo}` : ''}</span></span> },
            { key: 'taxable', label: 'Taxable', num: true, cell: (r) => inr(r.taxable) },
            { key: 'section', label: 'TDS section', wideOnly: true, cell: (r) => rowSection(r) || '–' },
            { key: 'tds', label: 'TDS', num: true, emph: true, cell: (r) => (r.tds ? inr(r.tds) : '–') },
          ]}
          total={{ date: 'Total', taxable: inr(s.taxable), tds: inr(s.tds) }} />
      </Panel>
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? open.supplier : ''} width={520}>
        {open && <InvoiceDetail r={open} />}
      </Drawer>
    </>
  );
}

function InvoiceDetail({ r }: { r: InvoiceRow }) {
  const rate = rowRate(r);
  const lines: [string, string][] = [
    ['Voucher', `${r.voucherType} ${r.voucherNo}`], ['Date', dateLabel(r.date)],
    ['Supplier bill', r.invoiceNo ? `${r.invoiceNo}${r.invoiceDate ? ` of ${dateLabel(r.invoiceDate)}` : ''}` : 'Not in Tally'],
    ['PAN', r.pan || 'Missing'], ['GSTIN', r.gstin || 'None'], ['Ledger', r.ledgers || '–'],
    ['Taxable', inr(r.taxable)], ['GST', inr(r.igst + r.cgst + r.sgst + r.cess)], ['Bill total', inr(r.total)],
    ['TDS', r.tds ? `${inr(r.tds)} · ${rowSection(r)}${rate != null ? ` · ${rate}%` : ''}` : 'None'], ['Net payable', inr(r.payable)],
    ['Party TDS nature', r.partyTds || 'Not set'], ['First seen', dateLabel(r.firstSeen.slice(0, 10))],
  ];
  return (
    <div className="space-y-4 p-4 text-sm">
      <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5">
        {lines.map(([k, v]) => (<Fragment key={k}><dt className="text-slate-600">{k}</dt><dd className="text-slate-900">{v}</dd></Fragment>))}
      </dl>
      {r.narration && <p className="text-slate-600">{r.narration}</p>}
      <div>
        <div className="mb-1 font-semibold text-slate-900">Changes in Tally</div>
        {r.changes.length ? (
          <ol className="space-y-1 text-slate-700">
            {r.changes.map((c, i) => <li key={i}>{i + 1}. {dateLabel(c.at.slice(0, 10))}: {c.field} {String(c.from) || 'blank'} → {String(c.to) || 'blank'}</li>)}
          </ol>
        ) : <p className="text-slate-600">No change since first seen.</p>}
      </div>
    </div>
  );
}
