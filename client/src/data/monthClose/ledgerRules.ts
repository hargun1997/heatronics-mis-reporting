// ----------------------------------------------------------------------------
// Ledger NAME-PATTERN rules — the data-driven, editable twin of SEED_LEDGER_MAP.
//
// The exact-name map only knows the ledgers it was seeded with; a Tally ledger booked under another
// name ("Blinkit - Sales", "Zepto Sales Account", "Brand Film Shoot") fell through as unmapped and its
// revenue/cost vanished (Quick Commerce showed 0 although Blinkit sold). These rules catch such names:
//   rev_blinkit  Quick Commerce sales (Blinkit, Zepto, Instamart …)
//   rev_flipkart Flipkart sales (only when Tally ledgers it separately — never splits a combined ledger)
//   pf_platform  Brand investment (CM2→CM3 line), carved out of marketing / admin
//   nl_fundraising Cost of fundraising (below EBITDA)
// Order matters: the first enabled match wins. The table is stored (objectStore `tally/ledger-rules`,
// edited on the Tally health page); DEFAULT_LEDGER_RULES is used until one is saved. Pure; no network.
// Matched against the lower-cased, whitespace-collapsed ledger name (and its Tally group when known).
// ----------------------------------------------------------------------------

export type RuleLine = 'rev_blinkit' | 'rev_flipkart' | 'pf_platform' | 'nl_fundraising';

export const RULE_LINES: { id: RuleLine; label: string }[] = [
  { id: 'rev_blinkit', label: 'Quick Commerce sales' },
  { id: 'rev_flipkart', label: 'Flipkart sales' },
  { id: 'pf_platform', label: 'Brand investment' },
  { id: 'nl_fundraising', label: 'Cost of fundraising' },
];

export interface LedgerRule {
  id: string;
  line: RuleLine;
  /** Regex source, matched case-insensitively against the ledger name. */
  pattern: string;
  /** Optional regex source for the Tally group — checked only when the group is known. */
  group?: string;
  /** Why this rule exists, shown on the Tally health page. */
  note?: string;
  enabled?: boolean;
}

const QC = '(blinkit|grofers|hyperpure|zepto|instamart|swiggy|big ?basket|quick[ -]?commerce)';
// Words that make a name a cost / balance, not a sale: "Blinkit Channel Fees", "Blinkit Receivable".
const NOT_SALE = '(?!.*\\b(fees?|commission|ads?|advert\\w*|tds|tcs|receivables?|debtors?|expenses?|payable)\\b)';

export const DEFAULT_LEDGER_RULES: LedgerRule[] = [
  { id: 'qc-sales', line: 'rev_blinkit', group: 'sales', note: 'Blinkit / Zepto / Instamart sales and their credit notes',
    pattern: `^${NOT_SALE}(?=.*${QC})(?=.*\\b(sales?|revenue|credit notes?|returns?)\\b)` },
  { id: 'fk-sales', line: 'rev_flipkart', group: 'sales', note: 'Only a ledger named for Flipkart; a combined "Ecommerce Sales" is never split',
    pattern: `^${NOT_SALE}(?=.*\\bflipkart\\b)(?=.*\\b(sales?|revenue|credit notes?|returns?)\\b)` },
  { id: 'brand-agency', line: 'pf_platform', group: 'expenses', note: 'Content / creative / brand agencies and shoots',
    pattern: 'content creation|creative (agency|production|services)|brand (agency|film|shoot|campaign|activation|building|identity|investment)|branding|photo ?shoot|video ?shoot|videograph|influencer|creator (fees|payout)|celebrity|endorsement|public relations|\\bpr agency|logo design|packaging design' },
  { id: 'fundraising', line: 'nl_fundraising', group: 'expenses', note: 'Investor-round costs: bankers, legal for the round, valuation, allotment filings',
    pattern: 'business development|fund ?rais|investment bank|merchant bank|ib mandate|mandate fee|placement (fee|agent)|term sheet|due diligence|valuation (fee|report|charges)|share (allotment|issue)|roc.*(allot|share)|stamp duty.*(share|allot)|pitch deck|data ?room|investor (relations|deck)|cap table' },
];

const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const compiled = new Map<string, RegExp | null>();
function re(src: string | undefined): RegExp | null {
  if (!src) return null;
  if (!compiled.has(src)) {
    let r: RegExp | null = null;
    try { r = new RegExp(src, 'i'); } catch { r = null; }
    compiled.set(src, r);
  }
  return compiled.get(src) ?? null;
}

/** First enabled rule matching a ledger name (and group when known). `group` 'sales' / 'expenses' are families. */
export function matchLedgerRule(name: string, group: string | null | undefined, rules: LedgerRule[] = DEFAULT_LEDGER_RULES): LedgerRule | null {
  const n = norm(name);
  if (!n) return null;
  for (const r of rules) {
    if (r.enabled === false) continue;
    const rx = re(r.pattern);
    if (!rx || !rx.test(n)) continue;
    if (group && r.group) {
      const g = norm(group);
      const fam = r.group === 'sales' ? /sales|income|revenue/ : r.group === 'expenses' ? /expense|direct|indirect/ : re(r.group);
      if (fam && !fam.test(g)) continue;
    }
    return r;
  }
  return null;
}

/** Validate / clean a rule table from the wire. Bad regexes and unknown lines are dropped with a reason. */
export function sanitizeRules(input: unknown): { rules: LedgerRule[]; dropped: string[] } {
  const rules: LedgerRule[] = [];
  const dropped: string[] = [];
  const lines = new Set<string>(RULE_LINES.map((l) => l.id));
  const seen = new Set<string>();
  for (const raw of Array.isArray(input) ? input.slice(0, 200) : []) {
    const r = (raw ?? {}) as Partial<LedgerRule>;
    const id = String(r.id ?? '').trim().slice(0, 60);
    const pattern = String(r.pattern ?? '').trim().slice(0, 600);
    if (!id || !pattern || !lines.has(String(r.line))) { dropped.push(id || '(no id)'); continue; }
    if (seen.has(id)) { dropped.push(`${id} (duplicate id)`); continue; }
    try { new RegExp(pattern, 'i'); if (r.group) new RegExp(String(r.group), 'i'); } catch { dropped.push(`${id} (invalid pattern)`); continue; }
    seen.add(id);
    rules.push({
      id, line: r.line as RuleLine, pattern,
      ...(r.group ? { group: String(r.group).slice(0, 120) } : {}),
      ...(r.note ? { note: String(r.note).slice(0, 200) } : {}),
      ...(r.enabled === false ? { enabled: false } : {}),
    });
  }
  return { rules, dropped };
}

/** Rule for ONE exact ledger name the founder confirmed on the review list. */
export function exactNameRule(name: string, line: RuleLine): LedgerRule {
  const esc = norm(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { id: `confirmed:${norm(name)}`.slice(0, 60), line, pattern: `^${esc}$`, note: 'Confirmed by the founder' };
}

// ---- Active table (set once the stored rules are loaded; defaults until then) ----

let ACTIVE: LedgerRule[] = DEFAULT_LEDGER_RULES;
export function setLedgerRules(rules: LedgerRule[] | null | undefined): void {
  ACTIVE = rules && rules.length ? rules : DEFAULT_LEDGER_RULES;
}
export const activeLedgerRules = () => ACTIVE;

// ---- The Tally health note -------------------------------------------------

export interface LedgerIn { name: string; group?: string; amount?: number }
export interface NarrationIn { date: string; type: string; number: string; ledger: string; amount: number; narration: string }
export interface RuleHit { name: string; group: string; line: RuleLine; ruleId: string; amount: number | null; via: 'rule' | 'map' }
export interface LedgerRulesReport {
  /** Ledgers that feed each line, from the exact map or a rule. */
  matched: RuleHit[];
  byLine: Record<RuleLine, { count: number; total: number }>;
  /** Sales-group ledgers (and P&L rows that look like sales) that no revenue line claims — review these. */
  unmatchedSales: LedgerIn[];
  /** Expense ledgers a looser keyword set flags as maybe-brand / maybe-fundraising: founder decides. */
  candidates: (LedgerIn & { line: RuleLine })[];
  /** Voucher narrations on expense ledgers that mention brand / fundraising words (listed, never auto-applied). */
  narrations: (NarrationIn & { line: RuleLine })[];
}

const LOOSE: { line: RuleLine; rx: RegExp }[] = [
  { line: 'nl_fundraising', rx: /fund|invest(or|ment)|round|legal|valuation|roc\b|mca\b|compan(y|ies) secretary|\bcs\b|advisory|consult|banker|equity|allot|shares?/i },
  { line: 'pf_platform', rx: /brand|creative|content|agency|design|shoot|video|photo|influenc|creator|pr\b|campaign|launch|event|sponsor/i },
];

/**
 * Build the report. `exact(name)` is the seed-map lookup (line key or null) so rules never re-claim what the map
 * already owns; `isStructural(name)` skips group / total rows.
 */
export function ledgerRulesReport(
  ledgers: LedgerIn[],
  narrations: NarrationIn[],
  rules: LedgerRule[],
  exact: (name: string) => string | null,
  isStructural: (name: string) => boolean = () => false,
): LedgerRulesReport {
  const matched: RuleHit[] = [];
  const unmatchedSales: LedgerIn[] = [];
  const candidates: (LedgerIn & { line: RuleLine })[] = [];
  const seen = new Set<string>();
  for (const l of ledgers) {
    const key = norm(l.name);
    if (!key || seen.has(key) || isStructural(l.name)) continue;
    seen.add(key);
    const group = l.group ?? '';
    const ex = exact(l.name);
    const lines = new Set<string>(RULE_LINES.map((x) => x.id));
    if (ex && lines.has(ex)) { matched.push({ name: l.name, group, line: ex as RuleLine, ruleId: 'seed map', amount: l.amount ?? null, via: 'map' }); continue; }
    if (ex) continue; // the map owns it (another line, or deliberately ignored)
    const hit = matchLedgerRule(l.name, group || null, rules);
    if (hit) { matched.push({ name: l.name, group, line: hit.line, ruleId: hit.id, amount: l.amount ?? null, via: 'rule' }); continue; }
    if (/sales|revenue/i.test(group) || /\b(sales?|revenue)\b/i.test(l.name)) { unmatchedSales.push(l); continue; }
    if (/expense/i.test(group) || group === '') {
      const loose = LOOSE.find((x) => x.rx.test(l.name));
      if (loose && /expense|^$/i.test(group || '')) candidates.push({ ...l, line: loose.line });
    }
  }
  const byLine = Object.fromEntries(RULE_LINES.map((x) => [x.id, { count: 0, total: 0 }])) as LedgerRulesReport['byLine'];
  for (const m of matched) { byLine[m.line].count++; byLine[m.line].total += m.amount ?? 0; }
  const narr: (NarrationIn & { line: RuleLine })[] = [];
  for (const v of narrations) {
    if (exact(v.ledger) === 'pf_platform' || exact(v.ledger) === 'nl_fundraising') continue;
    if (matchLedgerRule(v.ledger, null, rules)?.line === 'pf_platform' || matchLedgerRule(v.ledger, null, rules)?.line === 'nl_fundraising') continue;
    const hit = matchLedgerRule(v.narration, null, rules.filter((r) => r.line === 'pf_platform' || r.line === 'nl_fundraising'));
    if (hit) narr.push({ ...v, line: hit.line });
  }
  return { matched, byLine, unmatchedSales, candidates: candidates.slice(0, 80), narrations: narr.slice(0, 80) };
}
