// ----------------------------------------------------------------------------
// Accounts Handbook — single source of truth.
//
// The handbook lives in ONE file: client/src/content/handbook/handbook.html.
// That same file is published standalone (the shareable Claude artifact), and
// the app renders it natively here: we parse it once, split it into Parts →
// Chapters → sub-sections, and the React pages render each chapter inside the
// app layout with the app's navigation. Screenshots live in
// client/public/handbook/img and are referenced as img/... in the HTML.
//
// To change accounting content, edit handbook.html (and re-run
// `node scripts/handbook/build-css.mjs` if its <style> block changed).
// ----------------------------------------------------------------------------

import raw from '../../content/handbook/handbook.html?raw';

export interface HbSub {
  id: string;
  title: string;
}

export interface HbChapter {
  id: string; // DOM id in handbook.html, e.g. "c6"
  no: string; // displayed number, e.g. "6", "S0", "4b"
  title: string;
  lede: string;
  slug: string; // URL segment, e.g. "6-amazon"
  partId: string;
  html: string; // the chapter <section> outer HTML
  text: string; // plain text, for search
  subs: HbSub[];
}

export interface HbPart {
  id: string;
  eyebrow: string; // "Part I"
  title: string; // "How the books are built"
  blurb: string;
  chapters: HbChapter[];
}

export interface Handbook {
  coverHtml: string;
  parts: HbPart[];
  chapters: HbChapter[];
  bySlug: Map<string, HbChapter>;
  /** Any element id inside the handbook → the chapter that contains it. */
  idToChapter: Map<string, HbChapter>;
}

export const HANDBOOK_BASE = '/handbook';
const IMG_BASE = '/handbook/img/';

const slugify = (t: string) =>
  t.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

let cache: Handbook | null = null;

export function getHandbook(): Handbook {
  if (cache) return cache;
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  const wrap = doc.querySelector('.wrap');
  if (!wrap) throw new Error('handbook.html: .wrap not found');

  // Screenshots: img/x.jpg → /handbook/img/x.jpg (both <img src> and <a href>).
  wrap.querySelectorAll<HTMLElement>('[src^="img/"],[href^="img/"]').forEach((el) => {
    for (const attr of ['src', 'href']) {
      const v = el.getAttribute(attr);
      if (v && v.startsWith('img/')) el.setAttribute(attr, IMG_BASE + v.slice(4));
    }
  });
  // External links open in a new tab.
  wrap.querySelectorAll<HTMLAnchorElement>('a[href^="http"]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener';
  });

  let coverHtml = '';
  const parts: HbPart[] = [];
  const chapters: HbChapter[] = [];
  const bySlug = new Map<string, HbChapter>();
  const idToChapter = new Map<string, HbChapter>();
  let part: HbPart | null = null;

  for (const el of Array.from(wrap.children)) {
    if (el.classList.contains('cover')) {
      el.querySelector('#toc')?.remove(); // the React home renders its own contents grid
      coverHtml = el.innerHTML;
      continue;
    }
    if (el.classList.contains('partband')) {
      part = {
        id: el.id,
        eyebrow: el.querySelector('.eyebrow')?.textContent?.trim() ?? '',
        title: el.querySelector('h2')?.textContent?.trim() ?? '',
        blurb: el.querySelector('p:not(.eyebrow)')?.textContent?.trim() ?? '',
        chapters: [],
      };
      parts.push(part);
      continue;
    }
    if (!el.classList.contains('chapter') || !part) continue;

    const rawNo = el.querySelector('.chno')?.textContent?.trim() ?? '';
    const no = rawNo.replace(/^0(?=\d)/, '');
    const title = el.querySelector('.chhead h2')?.textContent?.trim() ?? el.id;
    const lede = el.querySelector('.chhead .lede')?.textContent?.trim() ?? '';
    const subs: HbSub[] = [];
    el.querySelectorAll('h3').forEach((h) => {
      const t = h.textContent?.trim() ?? '';
      if (!t || t === title) return;
      if (!h.id) h.id = `${el.id}-${slugify(t)}`;
      if (!subs.some((s) => s.id === h.id)) subs.push({ id: h.id, title: t });
    });
    const ch: HbChapter = {
      id: el.id,
      no,
      title,
      lede,
      slug: `${slugify(no)}-${slugify(title)}`,
      partId: part.id,
      html: el.outerHTML,
      text: (el.textContent ?? '').replace(/\s+/g, ' '),
      subs,
    };
    part.chapters.push(ch);
    chapters.push(ch);
    bySlug.set(ch.slug, ch);
    idToChapter.set(ch.id, ch);
    el.querySelectorAll('[id]').forEach((n) => idToChapter.set(n.id, ch));
  }

  cache = { coverHtml, parts: parts.filter((p) => p.chapters.length), chapters, bySlug, idToChapter };
  return cache;
}

/** URL for any handbook anchor id (chapter id or any element id inside it). */
export function handbookHref(anchorId?: string): string {
  if (!anchorId || anchorId === 'c0') return HANDBOOK_BASE;
  const hb = getHandbook();
  const ch = hb.idToChapter.get(anchorId);
  if (!ch) return HANDBOOK_BASE;
  return ch.id === anchorId ? `${HANDBOOK_BASE}/${ch.slug}` : `${HANDBOOK_BASE}/${ch.slug}#${anchorId}`;
}

export interface HbSearchHit {
  chapter: HbChapter;
  snippet: string;
}

export function searchHandbook(q: string, limit = 30): HbSearchHit[] {
  const v = q.trim().toLowerCase();
  if (v.length < 2) return [];
  const hits: HbSearchHit[] = [];
  for (const ch of getHandbook().chapters) {
    const hay = ch.text.toLowerCase();
    const i = hay.indexOf(v);
    const inTitle = ch.title.toLowerCase().includes(v) || ch.no.toLowerCase() === v;
    if (i < 0 && !inTitle) continue;
    const at = Math.max(0, i);
    const start = Math.max(0, at - 50);
    const snippet = (start > 0 ? '…' : '') + ch.text.slice(start, at + v.length + 70).trim() + '…';
    hits.push({ chapter: ch, snippet });
    if (hits.length >= limit) break;
  }
  return hits;
}

/**
 * The whole handbook as plain text, for the "Ask about the handbook" chat.
 * Built from the same single source, so the chat can never drift from it.
 */
export function handbookChatContext(): string {
  const hb = getHandbook();
  return hb.parts
    .map((p) =>
      `# ${p.eyebrow} · ${p.title}\n` +
      p.chapters.map((c) => `## Chapter ${c.no} · ${c.title} (open: ${HANDBOOK_BASE}/${c.slug})\n${c.text}`).join('\n\n'),
    )
    .join('\n\n');
}
