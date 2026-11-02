// ----------------------------------------------------------------------------
// Tally Trial Balance over XML → closing debit / credit per group (and ledger,
// when Tally explodes them) at the month end. Pure; tests in server/test/tally.test.ts.
//
// Tally's "Trial Balance" export (checked live 2 Nov 2026 on Heatronics' TallyPrime) answers a flat sequence:
//   <DSPACCNAME><DSPDISPNAME>name</DSPDISPNAME></DSPACCNAME>
//   <DSPACCINFO><DSPCLDRAMT><DSPCLDRAMTA>-1234.00</DSPCLDRAMTA></DSPCLDRAMT>
//               <DSPCLCRAMT><DSPCLCRAMTA>5678.00</DSPCLCRAMTA></DSPCLCRAMT></DSPACCINFO>
// (closing Dr is negative, Cr positive). Exploded, the ledgers come in the SAME shape right after their group, so
// the poll asks twice: EXPLODEFLAG No = the groups (their names + the totals), Yes = groups + ledgers; a row whose name is
// one of the groups is a group, the rest are ledgers. Totals use the groups only, so nothing counts twice. A
// <BSNAME>-wrapped row is a ledger too. The raw exploded answer is kept at tally/tb-raw-last; Dr ≠ Cr or no rows = warning.
// The TB is a record + a check; the close's numbers come from the P&L slot (liveDeck ignores TB rows).
// ----------------------------------------------------------------------------

import { decode, escapeXml, tallyDates } from '../sources/tally.js';

export interface TbRow { name: string; level: 'group' | 'ledger'; debit: number; credit: number }
export interface TallyTbMonth {
  period: string;
  rows: TbRow[];
  totalDebit: number;
  totalCredit: number;
  /** Dr − Cr of the groups; 0 when the TB balances. */
  difference: number;
  warnings: string[];
}

export function tbEnvelope(periodKey: string, company?: string, explode = true): string {
  const { from, to } = tallyDates(periodKey);
  const c = (company || '').trim();
  return `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY><EXPORTDATA><REQUESTDESC>
    <REPORTNAME>Trial Balance</REPORTNAME>
    <STATICVARIABLES>
      <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      <SVFROMDATE>${from}</SVFROMDATE>
      <SVTODATE>${to}</SVTODATE>
      <EXPLODEFLAG>${explode ? 'Yes' : 'No'}</EXPLODEFLAG>
      <ISDETAILED>${explode ? 'Yes' : 'No'}</ISDETAILED>
      ${c ? `<SVCURRENTCOMPANY>${escapeXml(c)}</SVCURRENTCOMPANY>` : ''}
    </STATICVARIABLES>
  </REQUESTDESC></EXPORTDATA></BODY>
</ENVELOPE>`;
}

const amt = (s: string | undefined): number => {
  if (s == null) return 0;
  const t = decode(s);
  if (!t) return 0;
  const neg = /^-/.test(t) || /^\(.*\)$/.test(t);
  const n = parseFloat(t.replace(/[(),₹\s-]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** `groupNames` = the names in the groups-only answer; without it every plain row is a group (a groups-only answer). */
export function parseTbXml(xml: string, periodKey: string, groupNames?: Set<string>): TallyTbMonth {
  const rows: TbRow[] = [];
  const tag = (s: string, t: string) => new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(s)?.[1];
  const re = /(<BSNAME>\s*)?<DSPACCNAME>([\s\S]*?)<\/DSPACCNAME>(\s*<\/BSNAME>)?\s*<DSPACCINFO>([\s\S]*?)<\/DSPACCINFO>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const name = decode(tag(m[2], 'DSPDISPNAME') ?? m[2]);
    if (!name) continue;
    const dr = amt(tag(m[4], 'DSPCLDRAMTA') ?? tag(m[4], 'DSPCLDRAMT'));
    const cr = amt(tag(m[4], 'DSPCLCRAMTA') ?? tag(m[4], 'DSPCLCRAMT'));
    if (dr === 0 && cr === 0) continue;
    rows.push({ name, level: m[1] || (groupNames && !groupNames.has(name)) ? 'ledger' : 'group', debit: r2(Math.abs(dr)), credit: r2(Math.abs(cr)) });
  }
  const groups = rows.filter((r) => r.level === 'group');
  const totalDebit = r2(groups.reduce((s, r) => s + r.debit, 0));
  const totalCredit = r2(groups.reduce((s, r) => s + r.credit, 0));
  const difference = r2(totalDebit - totalCredit);
  const warnings: string[] = [];
  if (!rows.length) warnings.push('Tally answered, but not with Trial Balance rows this reader knows. The raw answer was kept — upload the screenshot for this month.');
  else if (Math.abs(difference) >= 1) warnings.push(`Trial Balance doesn't tie: Dr ₹${totalDebit.toLocaleString('en-IN')} vs Cr ₹${totalCredit.toLocaleString('en-IN')} (difference ₹${difference.toLocaleString('en-IN')}).`);
  return { period: periodKey, rows, totalDebit, totalCredit, difference, warnings };
}
