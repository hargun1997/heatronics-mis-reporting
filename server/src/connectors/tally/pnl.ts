// ----------------------------------------------------------------------------
// Tally Profit & Loss A/c over XML → the SAME ledger rows the P&L Excel upload
// gives (client/src/data/liveMis/tallyPnl.ts): {name, depth: 1, amount,
// confidence: 1} per ledger + Nett Profit, so the month close consumes a live
// pull exactly like the file. Pure; tests in server/test/tally.test.ts.
//
// Request: Tally's own "Profit and Loss" report, exploded, for one month. The
// answer (TallyPrime 7.0, Heatronics, checked live 2 Nov 2026) is a
// flat sequence under <ENVELOPE>:
//   <DSPACCNAME>name</DSPACCNAME> <PLAMT><PLSUBAMT/><BSMAINAMT>1000.00</BSMAINAMT></PLAMT>
//        → a top-level P&L group (Sales Accounts, Cost of Sales, Indirect Incomes, Indirect Expenses);
//          income positive, expense negative.
//   <DSPACCNAME>name</DSPACCNAME> <PLAMT><PLSUBAMT>-500.00</PLSUBAMT><BSMAINAMT/></PLAMT>
//        → a line inside the group (Opening Stock, Add: Purchase Accounts, Less: Closing Stock, Direct Expenses).
//   <BSNAME><DSPACCNAME>name</DSPACCNAME></BSNAME> <BSAMT><BSSUBAMT>250.00</BSSUBAMT>…</BSAMT>
//        → a ledger under the line / group above it.
// There is no Nett Profit row: Nett Profit = Σ of the top-level group figures.
// Amounts carry the group's sign, so the figure the Excel shows = value × sign(group): an expense is positive
// under an expense group, a contra ledger (a refund under expenses) negative, Closing Stock positive.
// A line whose ledgers follow it is not booked itself (its ledgers are). Purchase Accounts comes collapsed: it is
// split like the Excel reader does (Stock Transfer leg = the Stock Transfers sale, rest Raw Material Purchases).
// ----------------------------------------------------------------------------

import { decode, escapeXml, tallyDates } from '../sources/tally.js';

export interface TallyLedgerRow { name: string; depth: number; amount: number; confidence: number }
export interface TallyPnlMonth {
  period: string;
  periodLabel: string;
  ledgerRows: TallyLedgerRow[];
  nettProfit: number | null;
  warnings: string[];
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const periodLabel = (p: string) => `${MON[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

export function pnlEnvelope(periodKey: string, company?: string): string {
  const { from, to } = tallyDates(periodKey);
  const c = (company || '').trim();
  return `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY><EXPORTDATA><REQUESTDESC>
    <REPORTNAME>Profit and Loss</REPORTNAME>
    <STATICVARIABLES>
      <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      <SVFROMDATE>${from}</SVFROMDATE>
      <SVTODATE>${to}</SVTODATE>
      <EXPLODEFLAG>Yes</EXPLODEFLAG>
      <ISDETAILED>Yes</ISDETAILED>
      ${c ? `<SVCURRENTCOMPANY>${escapeXml(c)}</SVCURRENTCOMPANY>` : ''}
    </STATICVARIABLES>
  </REQUESTDESC></EXPORTDATA></BODY>
</ENVELOPE>`;
}

/** "1000.00" / "-1,234.00" / "(1234)" → signed number; empty → null. */
function num(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = decode(raw);
  if (!s) return null;
  const neg = /^-/.test(s) || /^\(.*\)$/.test(s);
  const n = parseFloat(s.replace(/[(),₹\s-]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

/** Same renames the Excel reader applies, so the ledgers map identically. */
function renameLedger(name: string): string {
  const n = name.replace(/\s+/g, ' ').trim();
  if (/^(less:?\s*)?closing stock/i.test(n)) return 'Closing Stock';
  if (/^(add:?\s*)?opening stock/i.test(n)) return 'Opening Stock';
  if (/^shipping-amazon-/i.test(n)) return 'Other Income';
  if (/^shipping refund/i.test(n)) return 'Other Income';
  return n.replace(/^(add|less):?\s+/i, '');
}

const r2 = (n: number) => Math.round(n * 100) / 100;
type Item =
  | { kind: 'group'; name: string; main: number }
  | { kind: 'line'; name: string; sub: number }
  | { kind: 'ledger'; name: string; sub: number | null };

/** Flatten the answer into groups / lines / ledgers in order. */
function items(xml: string): Item[] {
  const out: Item[] = [];
  const re = /<BSNAME>\s*<DSPACCNAME>([\s\S]*?)<\/DSPACCNAME>\s*<\/BSNAME>\s*<BSAMT>([\s\S]*?)<\/BSAMT>|<DSPACCNAME>([\s\S]*?)<\/DSPACCNAME>\s*<PLAMT>([\s\S]*?)<\/PLAMT>/g;
  const tag = (s: string, t: string) => new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(s)?.[1];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] != null) {
      const name = decode(tag(m[1], 'DSPDISPNAME') ?? '');
      if (name) out.push({ kind: 'ledger', name, sub: num(tag(m[2], 'BSSUBAMT')) ?? num(tag(m[2], 'BSMAINAMT')) });
    } else {
      const name = decode(tag(m[3], 'DSPDISPNAME') ?? '');
      const main = num(tag(m[4], 'BSMAINAMT'));
      const sub = num(tag(m[4], 'PLSUBAMT'));
      if (!name) continue;
      if (main != null) out.push({ kind: 'group', name, main });
      else if (sub != null) out.push({ kind: 'line', name, sub });
    }
  }
  return out;
}

export function parsePnlXml(xml: string, periodKey: string): TallyPnlMonth {
  const warnings: string[] = [];
  const list = items(xml);
  const ledgerRows: TallyLedgerRow[] = [];
  let sign = 1;
  let net = 0;
  let groups = 0;
  let purchases: number | null = null;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (it.kind === 'group') {
      groups += 1;
      net += it.main;
      sign = it.main < 0 ? -1 : 1;
      continue;
    }
    if (it.kind === 'line') {
      if (list[i + 1]?.kind === 'ledger') continue; // its ledgers carry the figure
      const shown = r2(it.sub * sign);
      if (/purchase accounts/i.test(it.name)) { purchases = shown; continue; }
      ledgerRows.push({ name: renameLedger(it.name), depth: 1, amount: shown, confidence: 1 });
      continue;
    }
    if (it.sub == null || it.sub === 0) continue;
    ledgerRows.push({ name: renameLedger(it.name), depth: 1, amount: r2(it.sub * sign), confidence: 1 });
  }
  if (purchases != null) {
    // Purchase Accounts arrives as one line: split the Stock-Transfer inward leg back out, as the Excel reader does.
    const strOut = ledgerRows.find((x) => x.name.toLowerCase() === 'stock transfers')?.amount ?? 0;
    if (strOut !== 0) {
      ledgerRows.push({ name: 'Stock Transfer', depth: 1, amount: strOut, confidence: 1 });
      ledgerRows.push({ name: 'Raw Material Purchases', depth: 1, amount: r2(purchases - strOut), confidence: 1 });
      warnings.push('Purchase Accounts comes as one line from Tally — the Stock-Transfer inward leg was split from the Stock Transfers sale.');
    } else {
      ledgerRows.push({ name: 'Raw Material Purchases', depth: 1, amount: purchases, confidence: 1 });
    }
  }
  if (!list.length) warnings.push('Tally answered, but not with the P&L rows this reader knows. The raw answer was kept — upload the P&L Excel for this month.');
  else if (!groups) warnings.push('No P&L group totals in the answer — Nett Profit could not be worked out.');
  return { period: periodKey, periodLabel: periodLabel(periodKey), ledgerRows, nettProfit: groups ? r2(net) : null, warnings };
}
