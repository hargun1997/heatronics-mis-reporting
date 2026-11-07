// Step 2: type or paste new payees → checks → the Bulk Payee Registration file (Bene_Reg_Format).
import { useState, type ClipboardEvent } from 'react';
import { BENE_REG_SHEET, NICK_MAX } from '../../data/payments/iciciFormats';
import {
  BLANK_NEW_PAYEE, autoNick, buildBeneRows, findExisting, isBlankNewPayee, maskAccount, parsePastedPayees, validateNewPayee,
  type NewPayee, type Payee,
} from '../../data/payments/payees';
import { XLSX_MIME, downloadBlob, textWorkbook, workbookBytes } from '../../data/payments/workbook';
import { Note, btnSecondary, input } from './shared';

const FIELDS: { k: keyof NewPayee; label: string; ph: string; mono?: boolean }[] = [
  { k: 'name', label: 'Name (as in bank)', ph: 'Payee name' },
  { k: 'nick', label: `Nick name (≤ ${NICK_MAX})`, ph: 'Auto from name' },
  { k: 'account', label: 'Account no', ph: 'Digits only', mono: true },
  { k: 'ifsc', label: 'IFSC', ph: 'ABCD0123456', mono: true },
  { k: 'email', label: 'Email (optional)', ph: '' },
  { k: 'mobile', label: 'Mobile (optional)', ph: '10 digits', mono: true },
];

export function NewPayeesSection({ saved }: { saved: Payee[] }) {
  const [rows, setRows] = useState<NewPayee[]>([{ ...BLANK_NEW_PAYEE }, { ...BLANK_NEW_PAYEE }, { ...BLANK_NEW_PAYEE }]);
  const [done, setDone] = useState('');

  const set = (i: number, k: keyof NewPayee, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  function onPaste(i: number, e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(text)) return;
    e.preventDefault();
    const pasted = parsePastedPayees(text);
    setRows((r) => {
      const next = [...r];
      pasted.forEach((p, j) => { next[i + j] = p; });
      return next.map((x) => x ?? { ...BLANK_NEW_PAYEE });
    });
  }

  const filled = rows.map((r, i) => ({ r, i })).filter(({ r }) => !isBlankNewPayee(r));
  const checks = filled.map(({ r, i }) => ({ i, errors: validateNewPayee(r), existing: findExisting(r, saved) }));
  const errorRows = checks.filter((c) => c.errors.length).length;
  const dupRows = checks.filter((c) => c.existing).length;

  function download() {
    const out = buildBeneRows(filled.map(({ r }) => r));
    downloadBlob(workbookBytes(textWorkbook(out, BENE_REG_SHEET)), `Bene_Reg_Format-${new Date().toISOString().slice(0, 10)}.xlsx`, XLSX_MIME);
    setDone(`Downloaded ${filled.length} payee(s). Upload it in CIB → Bulk Payee Registration.`);
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>Type each new payee, or copy rows from Excel and paste into the first box (columns: name, nick name, account, IFSC, email, mobile).</li>
        <li>Fix anything in red.</li>
        <li>Download the file and upload it in CIB → <b>Bulk Payee Registration</b>.</li>
      </ol>
      <Note tone="info">Nick name limit of {NICK_MAX} letters is our guess. If CIB refuses a row, shorten the nick name.</Note>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr><th className="w-8 px-2 py-2">#</th>{FIELDS.map((f) => <th key={f.k} className="px-2 py-2">{f.label}</th>)}<th className="w-10 px-2 py-2"><span className="sr-only">Remove</span></th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              return (
                <tr key={i} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                  {FIELDS.map((f) => (
                    <td key={f.k} className="px-1 py-1.5">
                      <input
                        className={`${input} ${f.mono ? 'font-mono' : ''}`}
                        value={r[f.k]}
                        placeholder={f.k === 'nick' && r.name ? autoNick(r.name) : f.ph}
                        aria-label={`${f.label}, row ${i + 1}`}
                        onChange={(e) => set(i, f.k, e.target.value)}
                        onPaste={(e) => onPaste(i, e)}
                        inputMode={f.k === 'account' || f.k === 'mobile' ? 'numeric' : undefined}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1.5">
                    <button type="button" className="min-h-[40px] min-w-[40px] rounded-lg text-slate-500 hover:bg-slate-100" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>×</button>
                  </td>
                </tr>
              );
            }).flatMap((tr, i) => {
              const c = checks.find((x) => x.i === i);
              if (!c || (!c.errors.length && !c.existing)) return [tr];
              return [tr, (
                <tr key={`m${i}`}><td /><td colSpan={7} className="px-2 pb-2 text-xs">
                  {c.errors.length > 0 && <span className="text-red-700">Fix: {c.errors.join(' · ')}</span>}
                  {c.existing && <span className="ml-2 text-amber-700">Already saved as "{c.existing.name}" ({maskAccount(c.existing.account)})</span>}
                </td></tr>
              )];
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btnSecondary} onClick={() => setRows((r) => [...r, { ...BLANK_NEW_PAYEE }])}>Add row</button>
        <button type="button" className={btnSecondary} onClick={download} disabled={!filled.length || errorRows > 0}>Download Bulk Payee file (.xlsx)</button>
        <span className="text-sm text-slate-600">
          {filled.length} payee(s){errorRows ? <span className="text-red-700"> · {errorRows} to fix</span> : ''}{dupRows ? <span className="text-amber-700"> · {dupRows} already saved</span> : ''}
        </span>
      </div>
      {done && <Note tone="ok">{done}</Note>}
    </div>
  );
}
