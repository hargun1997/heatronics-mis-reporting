// ----------------------------------------------------------------------------
// Tally Profit & Loss A/c over XML → the SAME ledger rows the P&L Excel upload
// gives (client/src/data/liveMis/tallyPnl.ts): {name, depth: 1, amount,
// confidence: 1} per ledger + Nett Profit, so the month close consumes a live
// pull exactly like the file. Pure; tests in server/test/tally.test.ts.
//
// The request is Tally's own "Profit and Loss" report, exploded to ledgers, for
// one calendar month. Tally answers with repeating
//   <DSPACCNAME><DSPDISPNAME>name</DSPDISPNAME></DSPACCNAME>
//   <PLAMT><PLSUBAMT>ledger figure</PLSUBAMT><BSMAINAMT>group figure</BSMAINAMT></PLAMT>
// pairs (the same two columns the Excel export has: ledger and group). The tag
// set is Tally's default TDL; a different shape degrades to "no rows" and the
// close page falls back to the upload. The first live pull keeps the raw XML
// (tally/raw-last) so the parser can be matched to it.
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

/** "1,23,456.00" / "-1234" / "(1234)" / "1234 Cr" → signed number (null = empty cell). */
function num(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = decode(raw);
  if (!s) return null;
  let sign = 1;
  if (/^-/.test(s) || /^\(.*\)$/.test(s)) sign = -1;
  const n = parseFloat(s.replace(/[(),₹\s-]/g, '').replace(/(dr|cr)$/i, ''));
  return Number.isFinite(n) ? sign * Math.abs(n) : null;
}

/** Same renames the Excel reader applies, so the ledgers map identically. */
function renameLedger(name: string): string {
  const n = name.replace(/\s+/g, ' ').trim();
  if (/^(less:\s*)?closing stock/i.test(n)) return 'Closing Stock';
  if (/^(add:\s*)?opening stock/i.test(n)) return 'Opening Stock';
  if (/^shipping-amazon-/i.test(n)) return 'Other Income';
  if (/^shipping refund/i.test(n)) return 'Other Income';
  return n.replace(/^(add|less):\s*/i, '');
}

const SKIP = /^(gross (profit|loss)|nett (profit|loss)|total|c\/o|b\/f)/i;

/**
 * Tally shows a ledger in the P&L with the sign of its nature: a ledger opposite to its group (a return under Sales,
 * a credit under an expense group) is negative there. XML amounts carry Dr / Cr signs instead, so a ledger whose sign
 * differs from its group's is negated relative to the group — the figure the Excel export shows.
 */
export function parsePnlXml(xml: string, periodKey: string): TallyPnlMonth {
  const warnings: string[] = [];
  const ledgerRows: TallyLedgerRow[] = [];
  let nettProfit: number | null = null;
  const re = /<DSPACCNAME>([\s\S]*?)<\/DSPACCNAME>\s*<PLAMT>([\s\S]*?)<\/PLAMT>/g;
  let m: RegExpExecArray | null;
  let groupSign = 1;
  let any = false;
  while ((m = re.exec(xml)) !== null) {
    any = true;
    const name = decode(/<DSPDISPNAME>([\s\S]*?)<\/DSPDISPNAME>/.exec(m[1])?.[1] ?? '');
    const sub = num(/<PLSUBAMT>([\s\S]*?)<\/PLSUBAMT>/.exec(m[2])?.[1]);
    const main = num(/<BSMAINAMT>([\s\S]*?)<\/BSMAINAMT>/.exec(m[2])?.[1]);
    if (!name) continue;
    if (/^nett (profit|loss)/i.test(name)) {
      const v = main ?? sub;
      if (v != null) nettProfit = Math.abs(v) * (/loss/i.test(name) ? -1 : 1);
      continue;
    }
    if (SKIP.test(name)) continue;
    if (sub == null) {
      // A group line (main figure only). Stock lines carry their value here and are ledgers in the Excel too.
      if (main != null && /opening stock|closing stock/i.test(name)) {
        ledgerRows.push({ name: renameLedger(name), depth: 1, amount: Math.abs(main), confidence: 1 });
      }
      if (main != null && main !== 0) groupSign = Math.sign(main);
      continue;
    }
    const shown = Math.sign(sub) === groupSign || sub === 0 ? Math.abs(sub) : -Math.abs(sub);
    ledgerRows.push({ name: renameLedger(name), depth: 1, amount: Math.round(shown * 100) / 100, confidence: 1 });
  }
  if (!any) warnings.push('Tally answered, but not with the P&L rows this reader knows (DSPACCNAME / PLAMT). The raw answer was kept — upload the P&L Excel for this month and share it so the reader can be matched.');
  else if (!ledgerRows.length) warnings.push('Tally sent the P&L without ledger-level rows — is the report collapsed? (EXPLODEFLAG)');
  if (nettProfit == null && any) warnings.push('No Nett Profit / Nett Loss line in the answer.');
  return { period: periodKey, periodLabel: periodLabel(periodKey), ledgerRows, nettProfit, warnings };
}
