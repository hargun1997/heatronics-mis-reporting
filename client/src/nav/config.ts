// The MIS menu — the one source of truth for the sidebar, the ⌘K palette and every page's breadcrumbs
// (design-system/heatronics-mis/MASTER.md "Layout & navigation", same model as Ops' lib/nav/config.ts).
// Two levels only: section → page. Pure (no React), tested in server/test/nav.test.ts.

export type NavIconName =
  | 'live' | 'upload' | 'issues' | 'ai' | 'send' | 'tasks' | 'booking' | 'book' | 'tools'
  | 'today' | 'cash' | 'plan' | 'rounds' | 'floors' | 'payments' | 'sources' | 'rules' | 'people' | 'tally' | 'tds' | 'old';

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
  today: { role: 'Founder', person: 'Hargun', cadence: 'Daily', job: 'Open this page first. Do the red items. Then read what changed.' },
  live: { role: 'Founder', person: 'Hargun', cadence: 'Weekly', job: 'Read the P&L and the channels. Lock last month after the 10th.' },
  insights: { role: 'Founder', person: 'Hargun', cadence: 'When needed', job: 'Ask why a number moved.' },
  tasks: { role: 'Accounts executive', cadence: 'Daily', job: 'Tick the tasks due today. Clear the Fix list.' },
  booking: { role: 'Accounts executive', cadence: 'Daily', job: 'Check the ledger, voucher and GST before you book an invoice.' },
  payments: { role: 'Accounts executive', cadence: 'Weekly', job: 'Make the ICICI payment file. A second person approves it in the bank.' },
  tds: { role: 'Accounts executive', cadence: 'Monthly', job: 'Pay TDS by the 7th. Prepare the quarter return.' },
  cash: { role: 'Founder', person: 'Hargun', cadence: 'Weekly', job: 'Find the week when net cash goes below 0 or reaches the overdraft limit.' },
  tally: { role: 'Accounts executive', cadence: 'Weekly', job: 'Move each hanging ledger to its correct group in TallyPrime.' },
  handbook: { role: 'Accounts executive', cadence: 'When needed', job: 'Read the SOP before you book something new.' },
  plan: { role: 'Founder', person: 'Hargun', cadence: 'Monthly', job: 'Update the plan. Save the plan you use as a scenario.' },
  floors: { role: 'Founder', person: 'Hargun', cadence: 'Weekly', job: 'Raise the price of each SKU that is below its floor.' },
  sources: { role: 'Accounts executive', cadence: 'Monthly', job: 'Pull or upload each report for last month by the 10th.' },
  send: { role: 'Founder', person: 'Hargun', cadence: 'Monthly', job: 'Send the MIS to investors after you lock the month.' },
  rounds: { role: 'Founder', person: 'Hargun', cadence: 'When needed', job: 'Set the size of a round. Read the dilution.' },
};

/** Home = Today (simplification, 11 Nov 2026): the page the founder opens first. */
export const HOME = '/today';

// Simplified 11 Nov 2026: 4 sections, 13 pages. The Tools section is gone: each tool sits with its job.
// Send report opens from Live MIS, Round planner from the 5-year plan, People and reminders from Tasks and Setup.
export const NAV: NavSection[] = [
  {
    id: 'reporting',
    label: 'Reporting',
    href: HOME,
    pages: [
      { id: 'today', label: 'Today', href: '/today', icon: 'today', hint: 'What to do today, 5 numbers, what changed', words: 'morning brief home overview needs me cash runway fix late' },
      { id: 'live', label: 'Live MIS', href: '/reporting/mis/live', icon: 'live', hint: 'P&L, channels, products, balance sheet', words: 'mis dashboard p&l revenue margin run rate lock close month' },
      { id: 'insights', label: 'AI insights', href: '/reporting/mis/insights', icon: 'ai', also: ['/reporting/mis/chat'], hint: 'Ask about the numbers', words: 'chat claude ask analysis' },
    ],
  },
  {
    id: 'accounts',
    label: 'Accounts',
    pages: [
      { id: 'tasks', label: 'Tasks', href: '/tasks', icon: 'tasks', exact: true, also: ['/work', '/compliance', '/task-tracker', '/tracker', '/reporting/mis/issues'], hint: 'Tasks with a due date and problems to fix in the books', words: 'todo deadlines gst tds roc issues fix problems errors warnings hanging ledgers tie close stock' },
      { id: 'booking', label: 'Book an invoice', href: '/booking-assistant', icon: 'booking', also: ['/tools/invoice-booking', '/tools/expense-booking'], hint: 'Ledger, voucher and GST for an invoice', words: 'invoice ledger voucher tally expense booking assistant suggester' },
      { id: 'payments', label: 'Bulk payments', href: '/tools/bulk-payments', icon: 'payments', hint: 'Payee list and payment file for ICICI', words: 'icici cib bizpay360 bank transfer neft rtgs imps vendor payout beneficiary bene payee upload file' },
      { id: 'tds', label: 'TDS', href: '/accounts/tds', icon: 'tds', hint: 'TDS to pay this month, deductees, quarter return', words: 'tds planning challan 281 26q 24q tax deducted at source deposit section 194c 194j 194h 194i 194q traces form 16a' },
      { id: 'cash', label: 'Cash runway', href: '/accounts/cash-runway', icon: 'cash', hint: 'Net cash for the next 13 weeks', words: 'cash runway overdraft od burn bank liquidity weeks' },
      { id: 'tally', label: 'Tally health', href: '/tally', icon: 'tally', hint: 'Chart of accounts, ledgers, vouchers', words: 'tally ledgers vouchers day book gst gstin chart groups ask hanging' },
      { id: 'handbook', label: 'Handbook', href: '/handbook', icon: 'book', also: ['/guide'], hint: 'SOPs, ledgers, how to book', words: 'accounts handbook sop guide policy ledgers' },
    ],
  },
  {
    id: 'planning',
    label: 'Planning',
    pages: [
      { id: 'plan', label: '5-year plan', href: '/planning', icon: 'plan', hint: 'Plan to FY31, scenarios, plan vs actual', words: 'projection forecast budget fundraise cash runway' },
      { id: 'floors', label: 'Price floors', href: '/tools/price-floors', icon: 'floors', hint: 'Lowest Amazon price per SKU that makes money', words: 'amazon pricing margin asin' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    pages: [
      { id: 'sources', label: 'Setup', href: '/reporting/mis/connectors', icon: 'sources', also: ['/reporting/mis/ingest'], hint: 'Connections and report uploads', words: 'connectors api amazon shopify meta google tally setup data sources upload month end close pull reports slots ingest' },
    ],
  },
  {
    // Not in the sidebar: each opens from the page it belongs to, and from ⌘K.
    id: 'more',
    label: 'More',
    hidden: true,
    href: HOME,
    pages: [
      { id: 'send', label: 'Send report', href: '/reporting/mis/send', icon: 'send', hint: 'Email the monthly MIS (opens from Live MIS)', words: 'email investors board' },
      { id: 'rounds', label: 'Round planner', href: '/tools/round-planner', icon: 'rounds', hint: 'Fundraise rounds and dilution (opens from the 5-year plan)', words: 'equity dilution cap table investors' },
      { id: 'people', label: 'People and reminders', href: '/tasks/settings', icon: 'people', also: ['/reporting/mis/ownership'], hint: 'Owners and reminder emails (opens from Tasks)', words: 'team owners settings' },
      { id: 'rulebook', label: 'Data rulebook', href: '/reporting/mis/rulebook', icon: 'rules', hint: 'How each number is made', words: 'rules mapping definitions' },
      { id: 'tranzact', label: 'Amazon to Tranzact (manual)', href: '/tools/amazon-to-tranzact', icon: 'tools', hint: 'Old manual converter', words: 'fba inventory ledger stock reconciliation converter' },
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
