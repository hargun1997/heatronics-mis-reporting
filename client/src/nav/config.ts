// The MIS menu — the one source of truth for the sidebar, the ⌘K palette and every page's breadcrumbs
// (design-system/heatronics-mis/MASTER.md "Layout & navigation", same model as Ops' lib/nav/config.ts).
// Two levels only: section → page. Pure (no React), tested in server/test/nav.test.ts.

export type NavIconName =
  | 'live' | 'upload' | 'issues' | 'ai' | 'send' | 'tasks' | 'booking' | 'book' | 'tools'
  | 'plan' | 'rounds' | 'floors' | 'sources' | 'rules' | 'people' | 'tally' | 'old';

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

export const HOME = '/reporting/mis/live';

export const NAV: NavSection[] = [
  {
    id: 'reporting',
    label: 'Reporting',
    pages: [
      { id: 'live', label: 'Live MIS', href: '/reporting/mis/live', icon: 'live', hint: 'This month and last, P&L by channel', words: 'mis dashboard p&l revenue margin run rate' },
      { id: 'ingest', label: 'Month-end close', href: '/reporting/mis/ingest', icon: 'upload', hint: 'Pull or upload each report for the month', words: 'upload data close month end pull reports slots ingest' },
      { id: 'insights', label: 'AI insights', href: '/reporting/mis/insights', icon: 'ai', also: ['/reporting/mis/chat'], hint: 'Ask about the numbers', words: 'chat claude ask analysis' },
    ],
  },
  {
    id: 'accounts',
    label: 'Accounts',
    pages: [
      { id: 'tally', label: 'Tally health', href: '/tally', icon: 'tally', hint: 'Problems in the books and how to fix them in Tally; ask about Tally', words: 'tally ledgers vouchers day book gst gstin errors duplicate ask' },
      { id: 'handbook', label: 'Accounts Handbook', href: '/handbook', icon: 'book', also: ['/guide'], hint: 'SOPs, ledgers and how we book', words: 'sop guide policy ledgers' },
    ],
  },
  {
    id: 'planning',
    label: 'Planning',
    pages: [
      { id: 'plan', label: '5-year plan', href: '/planning', icon: 'plan', hint: 'Projection & deployment plan, levers and scenarios', words: 'projection forecast budget fundraise cash runway' },
      { id: 'rounds', label: 'Round planner', href: '/tools/round-planner', icon: 'rounds', hint: 'Fundraise rounds and dilution', words: 'equity dilution cap table investors' },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    href: '/tools',
    pages: [
      { id: 'send', label: 'Send report', href: '/reporting/mis/send', icon: 'send', hint: 'Email the monthly MIS', words: 'email investors board' },
      { id: 'booking', label: 'Book an invoice', href: '/booking-assistant', icon: 'booking', also: ['/tools/invoice-booking', '/tools/expense-booking'], hint: 'Which ledger, voucher and GST for an invoice', words: 'invoice ledger voucher tally expense booking assistant suggester' },
      { id: 'floors', label: 'Amazon price floors', href: '/tools/price-floors', icon: 'floors', hint: 'Lowest price per SKU that still makes money', words: 'pricing margin asin' },
      { id: 'tranzact', label: 'Amazon → Tranzact', href: '/tools/amazon-to-tranzact', icon: 'tools', hint: 'FBA inventory ledger → Tranzact stock reconciliation upload', words: 'fba inventory ledger stock reconciliation converter' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    pages: [
      { id: 'sources', label: 'Data sources', href: '/reporting/mis/connectors', icon: 'sources', hint: 'Connectors, Tally, scheduled feeds', words: 'connectors api amazon shopify meta google tally setup' },
      { id: 'rulebook', label: 'Data rulebook', href: '/reporting/mis/rulebook', icon: 'rules', hint: 'How each number is built', words: 'rules mapping definitions' },
    ],
  },
  {
    // Not in the sidebar (kept small on purpose): reachable from ⌘K.
    id: 'more',
    label: 'More',
    hidden: true,
    pages: [
      { id: 'issues', label: 'Data issues', href: '/reporting/mis/issues', icon: 'issues', hint: 'What the close checks flagged', words: 'errors warnings checks' },
      { id: 'toolshub', label: 'All tools', href: '/tools', icon: 'tools', exact: true, hint: 'Every tool on one page', words: 'utilities converter tools' },
      { id: 'tasks', label: 'Tasks', href: '/tasks', icon: 'tasks', exact: true, also: ['/work', '/compliance', '/task-tracker', '/tracker'], hint: 'Compliance and close tasks', words: 'todo deadlines gst tds roc' },
      { id: 'people', label: 'People & reminders', href: '/tasks/settings', icon: 'people', also: ['/reporting/mis/ownership'], hint: 'Owners and reminder emails', words: 'team owners settings' },
      { id: 'deck', label: 'MIS deck (old)', href: '/reporting/mis/deck', icon: 'old', hint: 'The first MIS deck', words: 'legacy deck' },
      { id: 'close', label: 'Month close (old)', href: '/reporting/mis/close', icon: 'old', hint: 'Replaced by Month-end close', words: 'legacy close manual figures' },
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
