// TDS page → "Claim back" (founder, 23 Nov 2026): TDS we paid on bills that platforms charged in full (Amazon, Meta, Google, Porter,
// Shiprocket and any party paid in full), per quarter, with how to claim it: steps, where, the message to send, the files to attach.
// Plus TDS deducted FROM us (Amazon 194-O), which is credit in the tax return. Data: data/tds/claims.ts · server services/tdsClaims.ts.
import { useMemo, useState } from 'react';
import { Copy, Download, ExternalLink, Settings } from 'lucide-react';
import { KpiTile } from '../../components/ui/KpiTile';
import { DataTable } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/overlays';
import { ErrorBox, InfoTip, Loading, Panel } from '../../components/ui/states';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { askText, toast } from '../../components/ui/feedback';
import { dayLabel, inrFull, inrShort } from '../../utils/money';
import {
  billListRows, claimMessage, markClaim, playbookFor, saveClaimSettings, useClaims,
  type ClaimPlatform, type ClaimQuarter, type ClaimSettings, type ClaimsApi, type ClaimState,
} from '../../data/tds/claims';

const STATE: Record<ClaimState, { tone: 'positive' | 'warning' | 'neutral' | 'info'; text: string }> = {
  ready: { tone: 'warning', text: 'Claim now' },
  wait: { tone: 'neutral', text: 'Wait for certificate' },
  claimed: { tone: 'info', text: 'Claimed' },
  received: { tone: 'positive', text: 'Received' },
};
const worst = (p: ClaimPlatform): ClaimState => (['ready', 'claimed', 'wait', 'received'] as ClaimState[]).find((s) => p.quarters.some((q) => q.state === s && (s === 'received' || q.pending > 0.5))) ?? 'received';

async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast(`${what} copied.`); } catch { toast('Copy did not work. Select the text and copy it.'); }
}

function ClaimModal({ p, api, onClose, reload }: { p: ClaimPlatform; api: ClaimsApi; onClose: () => void; reload: () => void }) {
  const book = playbookFor(p.id);
  const open = p.quarters.filter((q) => q.pending > 0.5 && q.state !== 'wait');
  const [pick, setPick] = useState<string[]>(open.length ? open.map((q) => q.quarter) : p.quarters.filter((q) => q.pending > 0.5).map((q) => q.quarter));
  const chosen = p.quarters.filter((q) => pick.includes(q.quarter));
  const msg = claimMessage(p, chosen, api.company, api.settings);
  const mark = async (q: ClaimQuarter, status: 'claimed' | 'received' | 'clear') => {
    let ref = '';
    if (status !== 'clear') {
      const got = await askText({ title: status === 'claimed' ? `Mark ${q.label} as claimed` : `Mark ${q.label} as received`, label: status === 'claimed' ? 'Case, ticket or email date' : 'Credit note or reference', confirm: 'Save' });
      if (got == null) return;
      ref = got;
    }
    try { await markClaim(p.id, q.quarter, { status, ref }); toast('Saved.'); reload(); }
    catch (e) { toast(`Could not save: ${e instanceof Error ? e.message : 'try again'}`); }
  };
  const downloadList = async () => {
    const { downloadStyledReport } = await import('../../utils/tdsReportExport');
    downloadStyledReport(`TDS bills ${p.name.split(' (')[0]} ${pick.join(' ')}.xlsx`, [{ name: 'Bills with TDS', rows: billListRows(p, pick), kind: 'table', headerRows: [0] }]);
  };
  return (
    <Modal open onClose={onClose} width={760} title={p.name} subtitle={`${inrFull(p.pending)} to get back · ${book.refundAs} · ${book.time}`}>
      <div className="space-y-4 text-sm">
        <section>
          <h3 className="mb-1 font-semibold text-slate-900">Where</h3>
          <p className="text-slate-800">{book.where}{book.to && <> · <span className="font-medium">{book.to}</span> <button type="button" className="underline" onClick={() => void copy(book.to!, 'Address')}>Copy</button></>}
            {book.link && <> · <a href={book.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">Open <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a></>}</p>
          {book.check && <p className="mt-1 text-amber-800">{book.check}</p>}
        </section>
        <section>
          <h3 className="mb-1 font-semibold text-slate-900">Steps</h3>
          <ol className="list-decimal space-y-1 pl-5 text-slate-800">{book.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </section>
        {p.kind === 'reimburse' && (
          <section>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">{book.channel === 'email' ? 'Email to send' : 'Message to paste'}</h3>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void copy(msg.subject, 'Subject')}><Copy className="h-4 w-4" aria-hidden />Subject</Button>
                <Button size="sm" onClick={() => void copy(msg.body, 'Message')}><Copy className="h-4 w-4" aria-hidden />Message</Button>
              </div>
            </div>
            <p className="mb-1 text-slate-700"><span className="text-slate-500">Subject:</span> {msg.subject}</p>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-sans text-sm text-slate-800">{msg.body}</pre>
          </section>
        )}
        <section>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">Attach</h3>
            {p.kind === 'reimburse' && <Button size="sm" onClick={() => void downloadList()}><Download className="h-4 w-4" aria-hidden />Download bill list</Button>}
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-slate-800">{book.attach.map((a) => <li key={a}>{a}</li>)}</ol>
        </section>
        <section>
          <h3 className="mb-1 font-semibold text-slate-900">Quarters</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-1.5">In message</th><th>Quarter</th><th className="text-right">TDS</th><th className="text-right">To get back</th><th>Status</th><th /></tr></thead>
            <tbody>
              {p.quarters.map((q) => (
                <tr key={q.quarter} className="border-b border-slate-100">
                  <td className="py-1.5"><input type="checkbox" aria-label={`Put ${q.label} in the message`} checked={pick.includes(q.quarter)} disabled={q.pending <= 0.5}
                    onChange={(e) => setPick((x) => (e.target.checked ? [...x, q.quarter] : x.filter((y) => y !== q.quarter)))} className="h-5 w-5 accent-slate-900" /></td>
                  <td>{q.label}<span className="block text-xs text-slate-500">{q.bills} bills{q.state === 'wait' ? ` · certificate from ${dayLabel(q.certFrom)}` : ''}{q.record?.ref ? ` · ${q.record.ref}` : ''}</span></td>
                  <td className="text-right tabular-nums">{inrFull(q.deducted)}</td>
                  <td className="text-right tabular-nums">{inrFull(q.pending)}</td>
                  <td><StatusPill toneName={STATE[q.state].tone} size="sm">{STATE[q.state].text}</StatusPill></td>
                  <td className="text-right">
                    {p.kind === 'reimburse' && q.state === 'ready' && <Button size="sm" onClick={() => void mark(q, 'claimed')}>Mark as claimed</Button>}
                    {p.kind === 'reimburse' && q.state === 'claimed' && <Button size="sm" onClick={() => void mark(q, 'received')}>Mark as received</Button>}
                    {q.record && <button type="button" className="ml-2 text-xs underline" onClick={() => void mark(q, 'clear')}>Undo</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Modal>
  );
}

function SettingsModal({ api, onClose, reload }: { api: ClaimsApi; onClose: () => void; reload: () => void }) {
  const [s, setS] = useState<ClaimSettings>(api.settings);
  const field = (k: keyof ClaimSettings, label: string) => (
    <label className="block text-sm text-slate-700">{label}
      <input value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" />
    </label>
  );
  return (
    <Modal open onClose={onClose} title="Details for the claim messages"
      footer={<Button variant="primary" onClick={async () => { try { await saveClaimSettings(s); toast('Saved.'); onClose(); reload(); } catch (e) { toast(e instanceof Error ? e.message : 'Not saved.'); } }}>Save</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {field('tan', 'Our TAN')}{field('metaAdAccount', 'Meta ad account ID')}{field('googleCustomerId', 'Google Ads customer ID')}{field('porterAccount', 'Porter account')}
        {field('contactName', 'Your name')}{field('contactPhone', 'Phone')}{field('contactEmail', 'Email')}
      </div>
      <p className="mt-3 text-xs text-slate-500">PAN and GSTIN come from the factory GSTIN {api.company.gstin}.</p>
    </Modal>
  );
}

export function ClaimsView() {
  const { api, error, reload } = useClaims(true);
  const [open, setOpen] = useState<ClaimPlatform | null>(null);
  const [setup, setSetup] = useState(false);
  const reimburse = useMemo(() => api?.platforms.filter((p) => p.kind === 'reimburse') ?? [], [api]);
  const credit = useMemo(() => api?.platforms.filter((p) => p.kind === 'credit') ?? [], [api]);
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!api) return <Loading label="Reading TDS on platform bills" />;
  const current = open ? api.platforms.find((p) => p.id === open.id) ?? open : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="To get back from platforms" value={inrShort(api.totals.pending)} sub={`${reimburse.length} parties · FY ${api.fy}-${String(api.fy + 1).slice(2)}`} />
        <KpiTile label="Claim now" value={inrShort(api.totals.readyNow)} tone={api.totals.readyNow > 0 ? 'warning' : 'default'} sub="Certificate is out" />
        <KpiTile label="Claimed, not received" value={inrShort(api.totals.claimed)} sub="Follow up after 4 weeks" />
        <KpiTile label="Credit in tax return" value={inrShort(api.totals.credit)} sub="TDS deducted from us" />
      </div>
      <Panel title="TDS to get back" count={reimburse.length} flush
        action={<span className="flex items-center gap-1"><InfoTip label="How this is made">TDS on each party&apos;s bills in the Tally Day Books this year, less refunds booked in Tally and amounts marked received here. A party shows when it is a prepaid platform, or when Tally shows it was paid in full.</InfoTip>
          <Button size="sm" onClick={() => setSetup(true)}><Settings className="h-4 w-4" aria-hidden />Details</Button></span>}>
        <div className="p-4">
          <DataTable<ClaimPlatform> label="Parties with TDS to get back" rows={reimburse} rowKey={(p) => p.id} onRow={setOpen} limit={0}
            empty="No platform bill with TDS this year."
            columns={[
              { key: 'name', label: 'Party', main: true, cell: (p) => <span>{p.name}<span className="block text-xs text-slate-500">{playbookFor(p.id).where}</span></span> },
              { key: 'deducted', label: 'TDS this year', num: true, cell: (p) => inrFull(p.deducted), wideOnly: true },
              { key: 'received', label: 'Received', num: true, cell: (p) => inrFull(p.received), wideOnly: true },
              { key: 'pending', label: 'To get back', num: true, emph: true, cell: (p) => inrFull(p.pending) },
              { key: 'state', label: 'Next', cell: (p) => { const s = STATE[worst(p)]; return <StatusPill toneName={s.tone} size="sm">{s.text}</StatusPill>; } },
              { key: 'go', label: '', cell: (p) => <Button size="sm" onClick={(e) => { e.stopPropagation(); setOpen(p); }}>How to claim</Button> },
            ]}
            total={{ pending: inrFull(api.totals.pending) }} />
        </div>
      </Panel>
      {credit.length > 0 && (
        <Panel title="TDS deducted from us: credit in the tax return" count={credit.length} flush>
          <div className="p-4">
            <DataTable<ClaimPlatform> label="TDS deducted from us" rows={credit} rowKey={(p) => p.id} onRow={setOpen} limit={0}
              columns={[
                { key: 'name', label: 'Deducted by', main: true },
                { key: 'pending', label: 'This year', num: true, emph: true, cell: (p) => inrFull(p.pending) },
                { key: 'q', label: 'Quarters', cell: (p) => p.quarters.map((q) => q.label.split(' ')[0]).join(', ') },
                { key: 'go', label: '', cell: (p) => <Button size="sm" onClick={(e) => { e.stopPropagation(); setOpen(p); }}>What to do</Button> },
              ]} />
          </div>
        </Panel>
      )}
      {(api.older.length > 0 || api.missing.length > 0) && (
        <p className="text-xs text-slate-500">
          {api.older.map((o) => `${o.ledger}: ${inrFull(o.opening)} on 1 April, not split by party.`).join(' ')}{' '}
          {api.missing.length ? `No Day Book for ${api.missing.map((m) => dayLabel(m)).join(', ')}.` : ''}
        </p>
      )}
      {current && <ClaimModal p={current} api={api} onClose={() => setOpen(null)} reload={reload} />}
      {setup && <SettingsModal api={api} onClose={() => setSetup(false)} reload={reload} />}
    </div>
  );
}
