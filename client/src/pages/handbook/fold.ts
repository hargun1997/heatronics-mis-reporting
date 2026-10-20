// ----------------------------------------------------------------------------
// Foldable sections for handbook articles — a presentation layer only.
//
// The article HTML comes untouched from handbook.html. After it is mounted,
// enhanceArticle() finds each "On this page" heading, works out which nodes
// belong to it (everything after the heading up to the next heading, at any
// nesting level), and adds a chevron button to the heading. Folding only
// toggles a CSS class on those nodes, so no content is ever removed.
// ----------------------------------------------------------------------------

export interface FoldCtl {
  /** Number of foldable sections in the article. */
  count: number;
  /** Open or fold every section; `details` also opens/closes FAQ answers. */
  setAll(open: boolean, details?: boolean): void;
  /** Open the section holding this element id (or heading id). */
  reveal(id: string): void;
  isOpen(id: string): boolean;
}

interface Section {
  head: HTMLElement;
  body: HTMLElement[];
  open: boolean;
}

const CHEVRON =
  '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" width="16" height="16"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>';

const byRoot = new WeakMap<HTMLElement, FoldCtl>();
const byKey = new Map<string, FoldCtl>();

/** The fold controller of a mounted article (keyed by article href). */
export const getFold = (key: string) => byKey.get(key);
export const allFolds = () => byKey.values();

const esc = (id: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/[^\w-]/g, '\\$&'));

export function enhanceArticle(root: HTMLElement, key: string, headIds: string[], startOpen: boolean): FoldCtl {
  const existing = byRoot.get(root);
  if (existing) {
    byKey.set(key, existing);
    return existing;
  }
  const art = root.querySelector<HTMLElement>('.hb-article') ?? root;
  const heads = headIds
    .map((id) => art.querySelector<HTMLElement>('#' + esc(id)))
    .filter((h): h is HTMLElement => !!h);
  const headCount = (el: Element) => heads.reduce((n, h) => n + (el === h || el.contains(h) ? 1 : 0), 0);

  const sections: Section[] = [];
  for (const head of heads) {
    // Climb to the largest ancestor that holds only this heading.
    let sec: HTMLElement = head;
    while (sec.parentElement && sec.parentElement !== art && headCount(sec.parentElement) === 1) sec = sec.parentElement;
    const body: HTMLElement[] = [];
    // Everything after the heading inside its own block…
    for (let n: HTMLElement = head; n !== sec && n.parentElement; n = n.parentElement) {
      for (let s = n.nextElementSibling; s; s = s.nextElementSibling) body.push(s as HTMLElement);
    }
    // …then the following blocks, up to the next heading.
    for (let s = sec.nextElementSibling; s && headCount(s) === 0; s = s.nextElementSibling) body.push(s as HTMLElement);
    if (!body.length) continue;
    sections.push({ head, body, open: true });
  }

  const apply = (s: Section) => {
    s.body.forEach((b) => b.classList.toggle('hbf-hide', !s.open));
    s.head.dataset.open = s.open ? 'true' : 'false';
    s.head.querySelector('.hbf-btn')?.setAttribute('aria-expanded', String(s.open));
  };

  for (const s of sections) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hbf-btn';
    btn.setAttribute('aria-label', 'Show or hide this section');
    btn.innerHTML = CHEVRON;
    s.head.prepend(btn);
    s.head.classList.add('hbf-head');
    s.head.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('a')) return;
      s.open = !s.open;
      apply(s);
    });
    s.open = startOpen;
    apply(s);
  }

  const ctl: FoldCtl = {
    count: sections.length,
    setAll(open, details) {
      sections.forEach((s) => {
        s.open = open;
        apply(s);
      });
      if (details) art.querySelectorAll('details').forEach((d) => (d.open = open));
    },
    reveal(id) {
      const el = art.querySelector('#' + esc(id));
      if (!el) return;
      for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true;
      sections.forEach((s) => {
        if (!s.open && (s.head === el || s.body.some((b) => b === el || b.contains(el)))) {
          s.open = true;
          apply(s);
        }
      });
    },
    isOpen(id) {
      return sections.find((s) => s.head.id === id)?.open ?? true;
    },
  };
  byRoot.set(root, ctl);
  byKey.set(key, ctl);
  return ctl;
}
