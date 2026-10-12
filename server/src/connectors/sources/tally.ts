// ----------------------------------------------------------------------------
// Tally connector — the book of record, via XML over HTTP (port 9000).
//
// Tally Prime exposes no REST API and no webhooks: an integration POSTs an XML
// request envelope to http://<host>:<port> and Tally answers in XML, provided
// it is running with the company loaded and set to act as Server. On Tally
// Cloud the host is the provider's machine, so this only works if they expose
// the port to us (whitelisted IP / VPN) or we run close to it.
//
// This fetches the month's Trial Balance and flattens it to LedgerNode[]. The
// exact tag shape of a Tally export depends on the TDL in play, so the parse
// is best-effort and every pull is marked for reconciliation against Tally's
// own P&L screen — which the close already enforces through the Nett Profit
// anchor. File/XML upload stays the trusted path until a live pull is verified.
// ----------------------------------------------------------------------------

import type { ConnectorDef, Credentials, FetchResult, TestResult } from '../types.js';
import { connectorProvenance, type ConnectorSource, type LedgerNode } from '../schema.js';

function endpoint(creds: Credentials): string {
  let host = (creds.host || '').trim();
  if (!host) throw new Error('Tally host is required (e.g. http://127.0.0.1 or the cloud host).');
  if (!/^https?:\/\//.test(host)) host = `http://${host}`;
  host = host.replace(/\/+$/, '');
  const port = (creds.port || '9000').trim();
  // Only add the port when the host does not already carry one.
  return /:\d+$/.test(host) ? host : `${host}:${port}`;
}

/** Tally wants dates as YYYYMMDD. */
function tallyDates(periodKey: string): { from: string; to: string } {
  const [y, m] = periodKey.split('-').map((n) => parseInt(n, 10));
  if (!y || !m) throw new Error(`Bad period "${periodKey}" — expected YYYY-MM.`);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}${mm}01`, to: `${y}${mm}${String(last).padStart(2, '0')}` };
}

function trialBalanceEnvelope(creds: Credentials, periodKey: string): string {
  const { from, to } = tallyDates(periodKey);
  const company = (creds.company || '').trim();
  const companyLine = company
    ? `<SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY>`
    : '';
  return `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Trial Balance</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>${from}</SVFROMDATE>
          <SVTODATE>${to}</SVTODATE>
          <EXPLODEFLAG>Yes</EXPLODEFLAG>
          ${companyLine}
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
}

function companyListEnvelope(): string {
  return `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY><EXPORTDATA><REQUESTDESC>
    <REPORTNAME>List of Companies</REPORTNAME>
    <STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
  </REQUESTDESC></EXPORTDATA></BODY>
</ENVELOPE>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string,
  );
}

async function post(creds: Credentials, xml: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(endpoint(creds), {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml;charset=utf-8' },
      body: xml,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Tally returned ${res.status}: ${text.slice(0, 200)}`);
    return text;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        'Tally did not respond within 30s. Check it is running, the company is loaded, ' +
          'and the host/port is reachable from this server (Tally Cloud must expose port 9000).',
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

/** Rupees out of a Tally amount tag: credits parenthesised or suffixed. */
function amount(raw: string | undefined): number {
  if (!raw) return 0;
  let s = decode(raw);
  let sign = 1;
  if (/^\(.*\)$/.test(s) || /\bcr\b/i.test(s)) sign = -1;
  s = s.replace(/[(),₹\s]/g, '').replace(/\b(dr|cr)\b/gi, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? sign * Math.abs(n) : 0;
}

/**
 * Pull (name, closing amount) rows out of a Trial Balance XML export. Tolerant
 * by design: it matches the common DSPACCNAME / DSPCLDRAMT shape and ignores
 * anything it does not recognise, so a TDL variation degrades to fewer rows
 * plus a warning rather than a hard failure.
 */
function parseTrialBalance(xml: string): { nodes: Partial<LedgerNode>[]; matched: boolean } {
  const rows: Partial<LedgerNode>[] = [];
  const blockRe = /<DSPACCNAME>([\s\S]*?)<\/DSPACCNAME>([\s\S]*?)(?=<DSPACCNAME>|$)/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const nameM = /<DSPDISPNAME>([\s\S]*?)<\/DSPDISPNAME>/.exec(m[1]);
    const name = nameM ? decode(nameM[1]) : '';
    if (!name) continue;
    const rest = m[2];
    const dr = /<DSPCLDRAMT>[\s\S]*?<DSPCLDRAMTA>([\s\S]*?)<\/DSPCLDRAMTA>/.exec(rest);
    const cr = /<DSPCLCRAMT>[\s\S]*?<DSPCLCRAMTA>([\s\S]*?)<\/DSPCLCRAMTA>/.exec(rest);
    const amt = dr ? amount(dr[1]) : cr ? -Math.abs(amount(cr[1])) : 0;
    rows.push({ name, amount: amt });
  }
  return { nodes: rows, matched: rows.length > 0 };
}

const tally: ConnectorDef = {
  implemented: true,
  id: 'tally',
  label: 'Tally Prime',
  group: 'book',
  fetchMode: 'xmlhttp',
  bookOfRecord: true,
  credentialFields: [
    {
      key: 'host',
      label: 'Tally host',
      type: 'text',
      placeholder: 'http://127.0.0.1  or  https://your-tally-cloud-host',
      help: 'Where Tally is reachable. On Tally Cloud this is the provider host — the port must be exposed to this server.',
    },
    { key: 'port', label: 'Port', type: 'text', placeholder: '9000', optional: true, help: 'Default 9000.' },
    {
      key: 'company',
      label: 'Company name',
      type: 'text',
      optional: true,
      help: 'Exact company name in Tally. Leave blank to use the loaded company.',
    },
  ],
  note: 'XML over HTTP. Tally must be running with the company loaded and set to act as Server; Tally Cloud must expose port 9000 to this server. File/XML upload stays available as the trusted fallback.',

  async test(creds: Credentials): Promise<TestResult> {
    const xml = await post(creds, companyListEnvelope());
    if (/<ENVELOPE|<COMPANY|<TALLYMESSAGE/i.test(xml)) {
      const name = /<SVCURRENTCOMPANY>([\s\S]*?)<\/SVCURRENTCOMPANY>/i.exec(xml)?.[1];
      return { ok: true, detail: name ? `Reached Tally (company ${decode(name)}).` : 'Reached Tally.' };
    }
    return { ok: false, detail: 'Host answered but did not look like Tally XML.' };
  },

  async fetchPeriod(creds: Credentials, periodKey: string): Promise<FetchResult> {
    const xml = await post(creds, trialBalanceEnvelope(creds, periodKey));
    const { nodes: partial, matched } = parseTrialBalance(xml);

    const warnings: string[] = [
      'Tally figures were pulled live and must be reconciled against the Tally P&L screen ' +
        'before the close is trusted — the Nett Profit anchor enforces this.',
    ];
    if (!matched) {
      warnings.push(
        'Could not recognise any ledger rows in the Trial Balance XML. The TDL export shape may ' +
          'differ on this instance — fall back to the Tally xlsx/XML upload on the close page, and ' +
          'share a sample response so the parser can be matched to it.',
      );
    }

    const nodes: LedgerNode[] = partial.map((p) => ({
      name: p.name ?? '',
      depth: 0,
      path: [],
      amount: p.amount ?? 0,
      isLeaf: true,
      provenance: connectorProvenance('tally', `Tally Trial Balance ${periodKey}`, 'exact'),
    }));

    const source: ConnectorSource = {
      label: `Tally Trial Balance ${periodKey}`,
      kind: 'tallyPnl',
      method: 'connector',
      nodes,
      skuRows: [],
      bomCosts: [],
      crossChecks: [],
      warnings,
    };
    return { sources: [source], warnings };
  },
};

export default tally;
