import type { TallyMaster } from './useTallyMaster';

// ---------------------------------------------------------------------------
// Browser-side normalizer for raw Tally exports.
//
// Tally Prime exports its masters as JSON inside a top-level `tallymessage`
// array. Each entry is verbose (35+ fields per ledger) and the whole file
// can run to several MB — too noisy to send straight to the AI.
//
// This reducer turns that into a slim shape (~50 KB) keeping only what the
// expense-booking AI needs: ledgers (name + group), groups (name + parent),
// voucher types, cost categories and centres, currencies.
//
// It also accepts an already-reduced master and passes it through, so the
// "Replace master" UI works whether the user uploads a raw Tally export or
// a previously-saved slim JSON.
// ---------------------------------------------------------------------------

const CONTROL_CHAR_RE = /[\x00-\x1f]/g;

function clean(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s.replace(CONTROL_CHAR_RE, '').trim();
}

function isReducedMaster(obj: unknown): obj is TallyMaster {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return Array.isArray(o.ledgers) && Array.isArray(o.voucherTypes);
}

function isRawTallyExport(obj: unknown): obj is { tallymessage: unknown[] } {
  if (!obj || typeof obj !== 'object') return false;
  return Array.isArray((obj as Record<string, unknown>).tallymessage);
}

export interface ReduceStats {
  groups: number;
  ledgers: number;
  voucherTypes: number;
  costCentres: number;
  costCategories: number;
  currencies: number;
}

export interface ReduceResult {
  master: TallyMaster;
  stats: ReduceStats;
  source: 'raw-tally' | 'already-reduced';
}

export function reduceTallyExport(raw: unknown): ReduceResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('File is not a JSON object.');
  }

  if (isReducedMaster(raw)) {
    return {
      master: raw,
      source: 'already-reduced',
      stats: {
        groups: raw.groups?.length || 0,
        ledgers: raw.ledgers?.length || 0,
        voucherTypes: raw.voucherTypes?.length || 0,
        costCentres: raw.costCentres?.length || 0,
        costCategories: raw.costCategories?.length || 0,
        currencies: raw.currencies?.length || 0,
      },
    };
  }

  if (!isRawTallyExport(raw)) {
    throw new Error(
      'Unrecognised format. Expected either a slim master (with "ledgers", "voucherTypes" arrays) or a raw Tally export with a top-level "tallymessage" array.'
    );
  }

  // Tally exports each master twice (original + amended). Dedupe by name —
  // later entries win, since they reflect the most recent state.
  const groupMap = new Map<string, { name: string; parent: string | null; isRevenue: boolean }>();
  const ledgerMap = new Map<string, { name: string; group: string | null; gst?: boolean; tds?: boolean; supplyType?: string }>();
  const voucherTypeMap = new Map<string, { name: string; parent: string | null }>();
  const costCategorySet = new Set<string>();
  const costCentreMap = new Map<string, { name: string; category: string | null; parent?: string | null }>();
  const currencySet = new Set<string>();

  for (const m of raw.tallymessage) {
    if (!m || typeof m !== 'object') continue;
    const msg = m as Record<string, any>;
    if (msg.isdeleted) continue;

    const meta = msg.metadata;
    const name = clean(meta?.name);
    if (!name) continue;
    const type = clean(meta?.type);

    switch (type) {
      case 'Group':
        groupMap.set(name, {
          name,
          parent: clean(msg.parent) || null,
          isRevenue: msg.isrevenue === true,
        });
        break;

      case 'Ledger': {
        const supplyType = clean(msg.gsttypeofsupply);
        ledgerMap.set(name, {
          name,
          group: clean(msg.parent) || null,
          gst: msg.isgstapplicable === true,
          tds: msg.istdsapplicable === true,
          ...(supplyType ? { supplyType } : {}),
        });
        break;
      }

      case 'Voucher Type':
        voucherTypeMap.set(name, {
          name,
          parent: clean(msg.parent) || null,
        });
        break;

      case 'Cost Category':
        costCategorySet.add(name);
        break;

      case 'Cost Centre':
        costCentreMap.set(name, {
          name,
          category: clean(msg.category) || null,
          parent: clean(msg.parent) || null,
        });
        break;

      case 'Currency':
        currencySet.add(name);
        break;

      default:
        break;
    }
  }

  const sortByName = <T extends { name: string }>(arr: T[]) =>
    arr.sort((a, b) => a.name.localeCompare(b.name));

  const master: TallyMaster = {
    generatedAt: new Date().toISOString(),
    company: 'Heatronics',
    groups: sortByName([...groupMap.values()]),
    ledgers: sortByName([...ledgerMap.values()]),
    voucherTypes: sortByName([...voucherTypeMap.values()]),
    costCategories: [...costCategorySet].sort(),
    costCentres: sortByName([...costCentreMap.values()]),
    currencies: [...currencySet].sort(),
  };

  return {
    master,
    source: 'raw-tally',
    stats: {
      groups: master.groups!.length,
      ledgers: master.ledgers!.length,
      voucherTypes: master.voucherTypes!.length,
      costCentres: master.costCentres!.length,
      costCategories: master.costCategories!.length,
      currencies: master.currencies!.length,
    },
  };
}

// Decode an uploaded file as text. Tally's JSON exports are UTF-16 LE with
// a BOM; we also accept UTF-16 BE and UTF-8 with or without a BOM.
export async function readFileAsText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  return new TextDecoder('utf-8').decode(bytes);
}
