// Chart of accounts (pure, READ ONLY): Tally's groups → sub-groups → ledgers as one cascading tree, plus "hanging" ledgers —
// ledgers sitting where they shouldn't (on a parent group that has sub-groups, in a carry-over / old group, with no group, or
// in another channel's group) — each with where it should move and why. Nothing here writes to Tally: the fix is done by
// hand in TallyPrime (Alt+G → Alter → Ledger → "Under").
import type { TallyGroup, TallyLedger, TallyMasters } from './books.js';

export interface ChartNode {
  name: string;
  kind: 'group' | 'ledger';
  /** Closing balance Dr − Cr (₹) from the newest stored Trial Balance; for a group, the sum of everything under it. */
  closing: number | null;
  /** Ledgers under this node (all levels). */
  ledgers: number;
  /** Hanging ledgers under this node (all levels). */
  hanging: number;
  children: ChartNode[];
}

export type HangKind = 'catch_all' | 'legacy' | 'no_group' | 'channel_mismatch';
export interface Hanging {
  ledger: string;
  group: string;
  primary: string;
  kind: HangKind;
  why: string;
  /** Where it should move (an existing group), or null when nothing fits well enough — pick by hand. */
  suggest: { group: string; path: string; why: string; confidence: 'high' | 'medium' } | null;
  closing: number | null;
}
export interface ChartReport {
  tree: ChartNode[];
  hanging: Hanging[];
  emptyGroups: string[];
  summary: { groups: number; ledgers: number; hanging: number; byKind: Record<HangKind, number> };
}

export const HANG_LABEL: Record<HangKind, string> = {
  catch_all: 'On a parent group that has sub-groups',
  legacy: 'In a carry-over / old group',
  no_group: 'No group',
  channel_mismatch: "In another channel's group",
};

const LEGACY = /carry ?over|\bbusy\b|\(old\)|\bold\b|suspense|temporary|\btemp\b/i;
/** Ledger names that may sit on a primary group by design. */
const ALLOWED_TOP = /^(profit & loss a\/c|cash|opening stock|closing stock)$/i;
/** Groups where ledgers sit directly by design even when sub-groups exist (parties, taxes, banks). */
const DIRECT_OK = /^(sundry debtors|sundry creditors|duties & taxes|bank accounts|bank od a\/c|provisions|cash-in-hand|stock-in-hand)$/i;

/** Name → existing group (first that exists in the masters wins). Ordered: specific before general. */
export const MOVE_RULES: { re: RegExp; to: string[]; why: string }[] = [
  // channel fees / costs
  { re: /\bfba\b|fulfil+ment by amazon|amazon.*(fee|charge|commission|closing|storage|shipment|pickup)/i, to: ['Amazon Channel Fees'], why: 'Amazon / FBA fee' },
  { re: /amazon.*(damage|refund)|reimburse/i, to: ['Amazon Damage Refunds', 'Other Income'], why: 'Amazon reimbursement / damage' },
  { re: /flipkart.*(fee|charge|commission|collection|shipping)/i, to: ['Flipkart Channel Fees'], why: 'Flipkart fee' },
  { re: /(blinkit|zepto|instamart|swiggy).*(fee|charge|commission|margin)/i, to: ['Blinkit Channel Fees'], why: 'Quick-commerce fee' },
  { re: /inward freight|freight inward|freight in\b/i, to: ['Inward Freight'], why: 'Freight on purchases' },
  { re: /delhivery|shiprocket|blue ?dart|porter|courier|ecom express|xpressbees|dtdc|freight|transport/i, to: ['D2C Logistics'], why: 'Outward freight / courier' },
  { re: /razorpay|easebuzz|payu|cashfree|snapmint|gateway|\bmdr\b/i, to: ['D2C Payment Gateway'], why: 'Payment gateway charges' },
  { re: /shopflo|gokwik|checkout/i, to: ['D2C Checkout'], why: 'Checkout app' },
  { re: /\bsms\b|whatsapp|interakt|wati|email marketing|communication/i, to: ['D2C Communication Fees'], why: 'Customer messaging' },
  { re: /shopify|app subscription/i, to: ['D2C Platform Subscriptions'], why: 'Store platform' },
  { re: /google ads|meta ads|facebook|instagram|performance marketing/i, to: ['D2C Marketing'], why: 'Website ads' },
  { re: /influencer|shoot|photo|video|agency|branding|content|advertis/i, to: ['Brand & Content Marketing'], why: 'Brand / content marketing' },
  { re: /warranty|after.?sales|replacement|repair.*customer/i, to: ['After-Sales & Warranty'], why: 'Warranty / after-sales' },
  // finance, people, compliance
  { re: /interest|late payment|penal/i, to: ['Finance Costs'], why: 'Interest / late payment' },
  { re: /bank charge|bank fee|processing fee/i, to: ['Bank Charges'], why: 'Bank charges' },
  { re: /director.*(remuneration|salary)/i, to: ["Directors' Remuneration"], why: 'Director pay' },
  { re: /salary|salaries|wages|bonus|staff welfare|stipend|incentive|gratuity/i, to: ['Employee Cost - Indirect'], why: 'Staff cost' },
  { re: /audit|chartered|\bca\b/i, to: ['Professional Fees - CA'], why: 'CA / audit fee' },
  { re: /company secretary|\bcs\b|\broc\b|\bmca\b/i, to: ['Professional Fees - CS'], why: 'CS / ROC' },
  { re: /legal|advocate|lawyer|trademark/i, to: ['Legal Fees'], why: 'Legal' },
  { re: /\bbis\b|\biso\b|cdsco|certif|nsdl|govt|government|licen[cs]e|compliance|registration fee/i, to: ['Compliance & Certification'], why: 'Compliance / certification / govt fee' },
  { re: /tally|zoho|software subscription|saas|google workspace|tranzact|subscription/i, to: ['Operations Platform Subscriptions'], why: 'Software subscription' },
  { re: /machine repair|repair & maint|maintenance|dyeing|factory|electricity|power|diesel|generator/i, to: ['Factory Overheads'], why: 'Factory running cost' },
  { re: /insurance|conveyance|office|printing|stationery|telephone|mobile|internet|travel|rent|misc|admin|courier charges office/i, to: ['Admin & General Expenses'], why: 'Office / admin cost' },
  // fixed assets
  { re: /laptop|computer|software|intangible|cctv|printer|\btv\b|monitor|headphone|ipad|tablet/i, to: ['Computer and IT Equipment'], why: 'IT equipment' },
  { re: /air conditioner|\bac\b|water dispenser|coffee|inverter|battery|batteries|refrigerator|fridge/i, to: ['Office Equipments'], why: 'Office equipment' },
  { re: /furniture|fixture|fan\b|rack|shelv|chair|table|almirah|trolly|trolley|pallet/i, to: ['Furniture and Furnishings'], why: 'Furniture / fixtures' },
  { re: /\bcar\b|vehicle|bike|scooter|truck\b/i, to: ['Vehicles and Transport'], why: 'Vehicle' },
  { re: /machine|\bdie\b|mould|mold|meter|gun|screw ?driver|sealing|cutting|tester|oven|press\b|jig/i, to: ['Plant and Machinery'], why: 'Production machine / tooling' },
  // sales
  { re: /blinkit|zepto|instamart/i, to: ['Blinkit Sales'], why: 'Quick-commerce sale' },
  { re: /flipkart|amazon|ecommerce|e-commerce|website|shopify|d2c/i, to: ['Ecommerce Sales'], why: 'Online sale' },
  { re: /\boem\b|b2b/i, to: ['OEM Sales'], why: 'OEM / B2B sale' },
  { re: /general trade|\bgt\b|dealer|distributor/i, to: ['General Trade (GT) Sales'], why: 'GT sale' },
];

const CHANNELS: [string, RegExp][] = [
  ['amazon', /\bamazon\b|\bfba\b/i], ['flipkart', /flipkart/i], ['blinkit', /blinkit|zepto|instamart/i], ['d2c', /\bd2c\b|shopify|website/i], ['oem', /\boem\b/i],
];
const channelOf = (s: string) => CHANNELS.filter(([, re]) => re.test(s)).map(([c]) => c);

const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'for', 'to', 'in', 'on', 'exp', 'expense', 'expenses', 'charges', 'charge', 'a/c', 'ac', 'account', 'ltd', 'pvt', 'private', 'limited', 'busy', 'asset', 'assets', 'fee', 'fees']);
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w)));
const jaccard = (a: Set<string>, b: Set<string>) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n ? n / (a.size + b.size - n) : 0; };

/** Closing Dr − Cr per ledger name from a stored TB's ledger rows. */
export function closingByLedger(rows: { name: string; level: string; debit: number; credit: number }[] | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows ?? []) if (r.level === 'ledger') m.set(r.name, (m.get(r.name) ?? 0) + (r.debit || 0) - (r.credit || 0));
  return m;
}

export function buildChart(masters: Pick<TallyMasters, 'groups' | 'ledgers'>, closing?: Map<string, number> | null): ChartReport {
  const groups = new Map<string, TallyGroup>(masters.groups.map((g) => [g.name, g]));
  const kids = new Map<string, string[]>();
  for (const g of masters.groups) if (g.parent && groups.has(g.parent)) (kids.get(g.parent) ?? kids.set(g.parent, []).get(g.parent)!).push(g.name);
  const ledgersIn = new Map<string, TallyLedger[]>();
  for (const l of masters.ledgers) (ledgersIn.get(l.group) ?? ledgersIn.set(l.group, []).get(l.group)!).push(l);
  const path = (g: string) => { const out: string[] = []; let cur: string | undefined = g; for (let i = 0; cur && i < 20; i++) { out.unshift(cur); cur = groups.get(cur)?.parent || undefined; } return out.join(' › '); };
  const primaryOf = (g: string) => groups.get(g)?.primary || g;
  const isLegacy = (g: string) => { let cur: string | undefined = g; for (let i = 0; cur && i < 20; i++) { if (LEGACY.test(cur)) return true; cur = groups.get(cur)?.parent || undefined; } return false; };

  // Learned fallback: words of every ledger in each (non-legacy) group, to place a ledger next to its look-alikes.
  const groupWords = new Map<string, Set<string>[]>();
  for (const l of masters.ledgers) if (l.group && !isLegacy(l.group) && !(kids.get(l.group)?.length)) (groupWords.get(l.group) ?? groupWords.set(l.group, []).get(l.group)!).push(words(l.name));

  const suggestFor = (l: TallyLedger, avoid: string): Hanging['suggest'] => {
    const prim = primaryOf(l.group) || l.primary;
    for (const r of MOVE_RULES) {
      if (!r.re.test(l.name)) continue;
      const to = r.to.find((g) => groups.has(g) && g !== l.group && g !== avoid && !isLegacy(g));
      if (!to) continue;
      // keep the ledger on the same side of the books (an expense stays an expense) unless it has no group at all
      if (prim && primaryOf(to) !== prim && !samePnlSide(prim, primaryOf(to))) continue;
      return { group: to, path: path(to), why: r.why, confidence: 'high' };
    }
    const w = words(l.name);
    if (!w.size) return null;
    let best: { g: string; s: number } | null = null;
    for (const [g, sets] of groupWords) {
      if (g === l.group || g === avoid) continue;
      if (prim && primaryOf(g) !== prim && !samePnlSide(prim, primaryOf(g))) continue;
      const s = Math.max(...sets.map((x) => jaccard(w, x)), jaccard(w, words(g)) * 0.9);
      if (s > (best?.s ?? 0)) best = { g, s };
    }
    return best && best.s >= 0.34 ? { group: best.g, path: path(best.g), why: 'Ledgers with similar names sit there', confidence: 'medium' } : null;
  };

  const hanging: Hanging[] = [];
  for (const l of masters.ledgers) {
    const c = closing?.has(l.name) ? closing.get(l.name)! : null;
    const base = { ledger: l.name, group: l.group, primary: l.primary, closing: c };
    if (!l.group) {
      if (ALLOWED_TOP.test(l.name)) continue;
      hanging.push({ ...base, kind: 'no_group', why: 'The ledger has no group, so it is left out of every report.', suggest: suggestFor(l, '') });
      continue;
    }
    if (isLegacy(l.group) || / - busy$/i.test(l.name)) {
      hanging.push({ ...base, kind: 'legacy', why: `"${l.group}" is a carry-over / old group: the ledger was never placed in the current chart.`, suggest: suggestFor(l, l.group) });
      continue;
    }
    if (kids.get(l.group)?.length && !DIRECT_OK.test(l.group) && !ALLOWED_TOP.test(l.name)) {
      hanging.push({ ...base, kind: 'catch_all', why: `"${l.group}" has sub-groups (${kids.get(l.group)!.slice(0, 4).join(', ')}${kids.get(l.group)!.length > 4 ? '…' : ''}) but this ledger sits on it directly, so it lands in no MIS line of its own.`, suggest: suggestFor(l, l.group) });
      continue;
    }
    const lc = channelOf(l.name), gc = channelOf(path(l.group));
    if (lc.length === 1 && gc.length === 1 && lc[0] !== gc[0]) {
      hanging.push({ ...base, kind: 'channel_mismatch', why: `The name says ${lc[0]} but it sits in a ${gc[0]} group, so its money shows on the wrong channel.`, suggest: suggestFor(l, l.group) });
    }
  }
  const hangSet = new Set(hanging.map((h) => h.ledger));

  const node = (g: string, depth: number): ChartNode => {
    const childGroups = depth > 20 ? [] : (kids.get(g) ?? []).slice().sort((a, b) => a.localeCompare(b)).map((k) => node(k, depth + 1));
    const leaves: ChartNode[] = (ledgersIn.get(g) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((l) => ({
      name: l.name, kind: 'ledger', closing: closing?.has(l.name) ? closing.get(l.name)! : null, ledgers: 1, hanging: hangSet.has(l.name) ? 1 : 0, children: [],
    }));
    const children = [...childGroups, ...leaves];
    const known = children.filter((c) => c.closing !== null);
    return {
      name: g, kind: 'group', closing: known.length ? known.reduce((s, c) => s + (c.closing ?? 0), 0) : null,
      ledgers: children.reduce((s, c) => s + c.ledgers, 0), hanging: children.reduce((s, c) => s + c.hanging, 0), children,
    };
  };
  const roots = masters.groups.filter((g) => !g.parent || !groups.has(g.parent)).map((g) => g.name);
  const tree = roots.sort((a, b) => ORDER(a) - ORDER(b) || a.localeCompare(b)).map((r) => node(r, 0));
  const orphans = (ledgersIn.get('') ?? []).filter((l) => !ALLOWED_TOP.test(l.name));
  if (orphans.length) tree.push({ name: '(no group)', kind: 'group', closing: null, ledgers: orphans.length, hanging: orphans.length, children: orphans.map((l) => ({ name: l.name, kind: 'ledger', closing: closing?.get(l.name) ?? null, ledgers: 1, hanging: 1, children: [] })) });

  const emptyGroups = masters.groups.filter((g) => !(kids.get(g.name)?.length) && !(ledgersIn.get(g.name)?.length) && g.parent).map((g) => g.name).sort();
  const byKind = { catch_all: 0, legacy: 0, no_group: 0, channel_mismatch: 0 } as Record<HangKind, number>;
  for (const h of hanging) byKind[h.kind]++;
  hanging.sort((a, b) => Math.abs(b.closing ?? 0) - Math.abs(a.closing ?? 0) || a.ledger.localeCompare(b.ledger));
  return { tree, hanging, emptyGroups, summary: { groups: masters.groups.length, ledgers: masters.ledgers.length, hanging: hanging.length, byKind } };
}

const BS_ASSET = /current assets|fixed assets|investments|misc\. expenses \(asset\)|branch|stock-in-hand|bank accounts|cash-in-hand|deposits|loans & advances \(asset\)|sundry debtors/i;
const BS_LIAB = /capital account|current liabilities|loans \(liability\)|suspense|reserves|duties & taxes|provisions|sundry creditors|secured|unsecured|bank od/i;
const PNL_EXP = /expenses|purchase/i;
const PNL_INC = /income|sales/i;
const side = (p: string) => (BS_ASSET.test(p) ? 'asset' : BS_LIAB.test(p) ? 'liab' : PNL_EXP.test(p) ? 'exp' : PNL_INC.test(p) ? 'inc' : p);
/** Direct ↔ Indirect expenses (or income) count as one side: a direct cost wrongly in Indirect may move across. */
function samePnlSide(a: string, b: string) { return side(a) === side(b); }

/** Balance sheet first, then P&L, like Tally's own order. */
const ORDER_LIST = ['Capital Account', 'Loans (Liability)', 'Current Liabilities', 'Fixed Assets', 'Investments', 'Current Assets', 'Suspense A/c', 'Sales Accounts', 'Direct Incomes', 'Indirect Incomes', 'Purchase Accounts', 'Direct Expenses', 'Indirect Expenses'];
const ORDER = (g: string) => { const i = ORDER_LIST.indexOf(g); return i < 0 ? 99 : i; };
