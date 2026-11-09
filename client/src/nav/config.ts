// The MIS menu — the one source of truth for the sidebar, the ⌘K palette and every page's breadcrumbs
// (design-system/heatronics-mis/MASTER.md "Layout & navigation", same model as Ops' lib/nav/config.ts).
// Two levels only: section → page. Pure (no React), tested in server/test/nav.test.ts.

export type NavIconName =
  | 'live' | 'upload' | 'issues' | 'ai' | 'send' | 'tasks' | 'booking' | 'book' | 'tools'
  | 'today' | 'plan' | 'rounds' | 'floors' | 'payments' | 'sources' | 'rules' | 'people' | 'tally' | 'tds' | 'old';

export interface NavPage {
  id: string;
  label: string;
  href: string;
  icon: NavIconName;
  /** Other paths that belong to this page (sub-routes, old addresses). Prefix match. */
  also?: string[];
  /** Exact-match only (a hub whose sub-paths are other pages). */
  exact?: boolean;
  /** One line for the palette. */
  hint?: string;
  /** Extra search words for the palette. */
  words?: string;
}
export interface NavSection {
  id: string;
  label: string;
  pages: NavPage[];
  /** Not in the sidebar (palette only). */
  hidden?: boolean;
  /** Where the section's breadcrumb links (default: its first page). */
  href?: string;
}

/** Who runs each page, what they must do there and how often (founder, 9 Nov 2026: "every section shows its owner,
 * what they must do, and how often"). Person names that are not set yet say "set in People & reminders". */
export type Cadence = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'When needed';
export interface PageOwner { role: string; person?: string; cadence: Cadence; job: string }
export const PAGE_OWNER: Record<string, PageOwner> = {
  today: { role: 'Founder', person: 'Hargun', cadence: 'Daily', job: 'Open first. Act on anything red, then check what changed.' },
  live: { role: 'Founder', person: 'Hargun', cadence: 'Weekly', job: 'Read the P&L and channels. Close and lock last month after the 10th.' },
  insights: { role: 'Founder', person: 'Hargun', cadence: 'When needed', job: 'Ask why a number moved.' },
  tasks: { role: 'Accounts executive', cadence: 'Daily', job: 'Tick tasks due today. Clear the Fix list.' },
  cash: { role: 'Founder', person: 'Hargun', cadence: 'Weekly', job: 'Check the week cash goes below zero or hits the overdraft limit. Set the limit.' },
  tally: { role: 'Accounts executive', cadence: 'Weekly', job: 'Fix hanging ledgers and wrong groups in TallyPrime.' },
  tds: { role: 'Accounts executive', cadence: 'Monthly', job: 'Pay TDS by the 7th. Prepare the quarter return.' },
  handbook: { role: 'Accounts executive', cadence: 'When needed', job: 'Follow the SOP before booking something new.' },
  plan: { role: 'Founder', person: 'Hargun', cadence: 'Monthly', job: 'Update the plan. Pin the one you run on.' },
  send: { role: 'Founder', person: 'Hargun', cadence: 'Monthly', job: 'Send the MIS to investors after the month is locked.' },
  booking: { role: 'Accounts executive', cadence: 'Daily', job: 'Check ledger, voucher and GST before booking an invoice.' },
  rounds: { role: 'Founder', person: 'Hargun', cadence: 'When needed', job: 'Size a round and see dilution.' },
  floors: { role: 'Founder', person: 'Hargun', cadence: 'Weekly', job: 'Raise any SKU priced below its floor.' },
  payments: { role: 'Accounts executive', cadence: 'Weekly', job: 'Make the ICICI payment file. A second person approves in the bank.' },
  sources: { role: 'Accounts executive', cadence: 'Monthly', job: 'Pull or upload every report for last month by the 10th.' },
};

export const HOME = '/reporting/mis/live';

export const NAV: NavSection[] = [
  {
    id: 'reporting',
    label: 'Reporting',
    href: HOME,
    pages: [
      { id: 'today', label: 'Today', href: '/today', icon: 'today', hint: 'What needs you today, five key numbers, what changed since yesterday', words: 'morning brief home overview needs me cash runway fix late' },
      { id: 'live', label: 'Live MIS', href: '/reporting/mis/live', icon: 'live', hint: 'This month and last, P&L by channel', words: 'mis dashboard p&l revenue margin run rate' },
      { id: 'insights', label: 'AI insights', href: '/reporting/mis/insights', icon: 'ai', also: ['/reporting/mis/chat'], hint: 'Ask about the numbers', words: 'chat claude ask analysis' },
    ],
  },
  {
    id: 'accounts',
    label: 'Accounts',
    pages: [
      { id: 'tasks', label: 'Tasks', href: '/tasks', icon: 'tasks', exact: true, also: ['/work', '/compliance', '/task-tracker', '/tracker', '/reporting/mis/issues'], hint: 'Everything to do and to fix: recurring accounts tasks + what the books and the MIS need a person for', words: 'todo deadlines gst tds roc issues fix problems errors warnings hanging ledgers tie close stock' },
      { id: 'tally', label: 'Tally health', href: '/tally', icon: 'tally', hint: 'Chart of accounts, hanging ledgers, ledgers, vouchers, ask about Tally', words: 'tally ledgers vouchers day book gst gstin chart groups ask' },
      { id: 'tds', label: 'TDS planning', href: '/accounts/tds', icon: 'tds', hint: 'TDS to pay this month by section, deductees, 26Q / 24Q working, how to pay and file', words: 'tds challan 281 26q 24q tax deducted at source deposit section 194c 194j 194h 194i 194q traces form 16a' },
      { id: 'handbook', label: 'Accounts Handbook', href: '/handbook', icon: 'book', also: ['/guide'], hint: 'SOPs, ledgers and how we book', words: 'sop guide policy ledgers' },
    ],
  },
  {
    id: 'planning',
    label: 'Planning',
    pages: [
      { id: 'plan', label: '5-year plan', href: '/planning', icon: 'plan', hint: 'Projection & deployment plan, levers and scenarios', words: 'projection forecast budget fundraise cash runway' },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    href: '/tools',
    pages: [
      { id: 'send', label: 'Send report', href: '/reporting/mis/send', icon: 'send', hint: 'Email the monthly MIS', words: 'email investors board' },
      { id: 'booking', label: 'Book an invoice', href: '/booking-assistant', icon: 'booking', also: ['/tools/invoice-booking', '/tools/expense-booking'], hint: 'Which ledger, voucher and GST for an invoice', words: 'invoice ledger voucher tally expense booking assistant suggester' },
      { id: 'rounds', label: 'Round planner', href: '/tools/round-planner', icon: 'rounds', hint: 'Fundraise rounds and dilution', words: 'equity dilution cap table investors' },
      { id: 'floors', label: 'Amazon price floors', href: '/tools/price-floors', icon: 'floors', hint: 'Lowest price per SKU that still makes money', words: 'pricing margin asin' },
      { id: 'payments', label: 'Bulk payments (ICICI)', href: '/tools/bulk-payments', icon: 'payments', hint: 'Payee list, bulk payee file and bulk payment file for ICICI CIB', words: 'icici cib bizpay360 bank transfer neft rtgs imps vendor payout beneficiary bene payee upload file' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    pages: [
      { id: 'sources', label: 'Setup', href: '/reporting/mis/connectors', icon: 'sources', also: ['/reporting/mis/ingest'], hint: 'Connections + report uploads in one place', words: 'connectors api amazon shopify meta google tally setup data sources upload month end close pull reports slots ingest' },
    ],
  },
  {
    // Not in the sidebar (kept small on purpose): reachable from ⌘K.
    id: 'more',
    label: 'More',
    hidden: true,
    pages: [
      { id: 'rulebook', label: 'Data rulebook', href: '/reporting/mis/rulebook', icon: 'rules', hint: 'How each number is built', words: 'rules mapping definitions' },
      { id: 'tranzact', label: 'Amazon → Tranzact (manual)', href: '/tools/amazon-to-tranzact', icon: 'tools', hint: 'Old manual converter — the closing-stock task now makes the Tranzact file from live data', words: 'fba inventory ledger stock reconciliation converter' },
      { id: 'toolshub', label: 'All tools', href: '/tools', icon: 'tools', exact: true, hint: 'Every tool on one page', words: 'utilities converter tools' },
      { id: 'people', label: 'People & reminders', href: '/tasks/settings', icon: 'people', also: ['/reporting/mis/ownership'], hint: 'Owners and reminder emails', words: 'team owners settings' },
      { id: 'close', label: 'Month close (old)', href: '/reporting/mis/close', icon: 'old', hint: 'Replaced by Setup + Live MIS close', words: 'legacy close manual figures' },
    ],
  },
];

export interface Crumb { label: string; href?: string }
export interface Where { section: NavSection; page: NavPage }

const clean = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
const under = (path: string, base: string) => path === base || path.startsWith(base + '/');

/** The page (and its section) a path belongs to — longest match wins. */
export function whereIs(path: string): Where | null {
  const p = clean(path.split('?')[0].split('#')[0]);
  let best: Where | null = null;
  let len = -1;
  for (const section of NAV) {
    for (const page of section.pages) {
      const bases = [page.href, ...(page.also ?? [])];
      for (const b of bases) {
        const hit = page.exact && b === page.href ? p === b : under(p, b);
        if (hit && b.length > len) { best = { section, page }; len = b.length; }
      }
    }
  }
  return best;
}

/** Section › Page (the section links to its first page). */
export function breadcrumbsFor(path: string): Crumb[] {
  const w = whereIs(path);
  if (!w) return [];
  const first = w.section.href ?? w.section.pages[0].href;
  return [
    { label: w.section.label, href: first === w.page.href ? undefined : first },
    { label: w.page.label, href: clean(path) === w.page.href ? undefined : w.page.href },
  ];
}

/** Sections shown in the sidebar (the old pages live in the palette only). */
export const sidebarSections = () => NAV.filter((s) => !s.hidden);

export interface PaletteItem { id: string; label: string; href: string; hint?: string; section: string; words: string }
export function paletteIndex(): PaletteItem[] {
  return NAV.flatMap((s) => s.pages.map((p) => ({
    id: p.id, label: p.label, href: p.href, hint: p.hint ? `${s.label} · ${p.hint}` : s.label, section: s.label,
    words: `${p.label} ${s.label} ${p.words ?? ''} ${p.hint ?? ''}`.toLowerCase(),
  })));
}

/** Every query word must appear; label hits rank first. */
export function searchPalette<T extends { label: string; words: string }>(items: T[], q: string, limit = 10): T[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return items.slice(0, limit);
  const scored = items
    .map((it) => {
      const label = it.label.toLowerCase();
      if (!terms.every((t) => it.words.includes(t) || label.includes(t))) return null;
      const score = (label.startsWith(terms[0]) ? 3 : 0) + terms.filter((t) => label.includes(t)).length;
      return { it, score };
    })
    .filter((x): x is { it: T; score: number } => !!x);
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.it);
}
