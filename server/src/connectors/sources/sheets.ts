// ----------------------------------------------------------------------------
// Google Sheets reader — the Tranzact daily feed.
//
// Tranzact's Recurring Reports write one Google Sheet per report into the Drive
// folder "Tranzact feed", shared as Viewer with the project's default compute
// service account (559416687588-compute@developer.gserviceaccount.com), which is
// the identity this Cloud Run service runs as. So no secret is needed: the token
// comes from the metadata server with the spreadsheets.readonly scope.
//
// READ ONLY: GET spreadsheets.values.get only (asserted).
// ----------------------------------------------------------------------------

const META = 'http://metadata.google.internal/computeMetadata/v1';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

/** Tranzact feed sheets (ids are not secrets: the sheet is readable only by the shared accounts). */
export const TRANZACT_SHEETS = {
  salesInvoiceRegister: '1Ze3E5WLTMUaVkTOvtOsbuh0caj4IT6-Eze8nsAB1gPQ',
  productPriceInventory: '1iIfOcwoT0J0FUY6kmOASW639voA9XCSzKbnlCkqgUpU',
  purchaseInvoiceRegister: '1jvVrV54oLtPevCuvmUW8rZoq1jFD0-7MKgSc-OQiEiE',
} as const;

export function assertSheetsReadOnly(method: string, url: string): void {
  if (method === 'GET' && /^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/[A-Za-z0-9_-]+\/values\//.test(url)) return;
  // tab list only (sheet properties, no cell data)
  if (method === 'GET' && /^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/[A-Za-z0-9_-]+\?fields=sheets\.properties/.test(url)) return;
  throw new Error(`Blocked: ${method} ${url.split('?')[0]} is not a Sheets values read.`);
}

let tok: { value: string; exp: number } | null = null;
async function sheetsToken(): Promise<string> {
  if (process.env.GCP_ACCESS_TOKEN) return process.env.GCP_ACCESS_TOKEN; // local testing only
  if (tok && Date.now() < tok.exp - 60_000) return tok.value;
  let r: Response | null = null;
  try {
    r = await fetch(`${META}/instance/service-accounts/default/token?scopes=${encodeURIComponent(SCOPE)}`, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    r = null;
  }
  if (!r?.ok) throw new Error('Not on Cloud Run — no service-account token to read the Tranzact sheet (set GCP_ACCESS_TOKEN to test locally).');
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  tok = { value: j.access_token, exp: Date.now() + (Number(j.expires_in) || 300) * 1000 };
  return tok.value;
}

const filled = (rows: unknown[][]) => rows.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim())).length;

async function sheetsGet(url: string): Promise<Response> {
  assertSheetsReadOnly('GET', url);
  return fetch(url, { headers: { Authorization: `Bearer ${await sheetsToken()}` } });
}

/**
 * All values of the tab that holds the report. Tranzact's recurring reports write into a tab of their own ("Daily <report>")
 * next to an empty "Sheet1" and a "TranZact" access note (seen 3 Nov 2026), so every visible tab (≤ 8) is read and the one with
 * the most filled rows wins; when the tab list can't be read, the first tab as before. Dates as serial numbers, numbers unformatted.
 */
export async function readSheet(spreadsheetId: string): Promise<unknown[][]> {
  let tabs: string[] = [];
  try {
    const t = await sheetsGet(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(title,index,hidden)`);
    if (t.ok) {
      const j = (await t.json()) as { sheets?: { properties?: { title?: string; index?: number; hidden?: boolean } }[] };
      tabs = (j.sheets || []).map((x) => x.properties).filter((p): p is { title: string; index?: number } => !!p && !p.hidden && typeof p.title === 'string')
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((p) => p.title).slice(0, 8);
    }
  } catch { tabs = []; }
  let best: unknown[][] = [];
  for (const tab of tabs.length ? tabs : [null]) {
    const range = tab ? `'${tab.replace(/'/g, "''")}'!A:ZZ` : 'A:ZZ';
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}` +
      `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=ROWS`;
    const res = await sheetsGet(url);
    if (res.status === 403 || res.status === 404) {
      throw new Error(
        `Google Sheets ${res.status}: the Tranzact sheet isn't readable by this service — share it (or the "Tranzact feed" folder) ` +
          'as Viewer with 559416687588-compute@developer.gserviceaccount.com, and enable the Google Sheets API in the project.',
      );
    }
    if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { values?: unknown[][] };
    const rows = Array.isArray(j.values) ? j.values : [];
    if (filled(rows) > filled(best)) best = rows;
  }
  return best;
}
