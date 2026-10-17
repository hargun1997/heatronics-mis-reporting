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
  /** Plain text of this section (from its heading to the next one), for search. */
  text: string;
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
  // Word gaps between block-level cells so extracted text (search, chat) reads
  // "Creditors 5,36,027.61", not "Creditors5,36,027.61". Whitespace between
  // these elements does not change how the page renders.
  wrap.querySelectorAll('td,th,li,dt,dd,p,div,h2,h3,h4,figcaption,summary,text,span.p,span.ar,span.s,span.nm,span.a,h4,.je>*').forEach((el) => {
    el.after(doc.createTextNode(' '));
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
      if (!subs.some((s) => s.id === h.id)) subs.push({ id: h.id, title: t, text: '' });
    });
    // Section text = from each h3 to the next h3 (or the end of the chapter).
    subs.forEach((s, i) => {
      const start = doc.getElementById(s.id);
      if (!start) return;
      const range = doc.createRange();
      range.setStartBefore(start);
      const next = subs[i + 1] && doc.getElementById(subs[i + 1].id);
      if (next) range.setEndBefore(next);
      else range.setEndAfter(el.lastChild ?? el);
      s.text = range.toString().replace(/\s+/g, ' ');
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
  /** The section the match is in, when it is inside one. */
  sub?: HbSub;
  /** Snippet split around the match so the UI can highlight it. */
  before: string;
  match: string;
  after: string;
  href: string;
}

function snippet(text: string, at: number, len: number) {
  const start = Math.max(0, at - 60);
  const end = Math.min(text.length, at + len + 90);
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, at),
    match: text.slice(at, at + len),
    after: text.slice(at + len, end) + (end < text.length ? '…' : ''),
  };
}

/**
 * Full-text search across every chapter and section. Title matches rank
 * first, then body matches; each hit deep-links to the exact section.
 */
export function searchHandbook(q: string, limit = 40): HbSearchHit[] {
  const v = q.trim().toLowerCase();
  if (v.length < 2) return [];
  const titleHits: HbSearchHit[] = [];
  const bodyHits: HbSearchHit[] = [];
  for (const ch of getHandbook().chapters) {
    const chHref = `${HANDBOOK_BASE}/${ch.slug}`;
    if (ch.title.toLowerCase().includes(v) || ch.no.toLowerCase() === v) {
      const i = ch.title.toLowerCase().indexOf(v);
      titleHits.push({
        chapter: ch,
        before: i >= 0 ? ch.title.slice(0, i) : ch.title,
        match: i >= 0 ? ch.title.slice(i, i + v.length) : '',
        after: (i >= 0 ? ch.title.slice(i + v.length) : '') + (ch.lede ? ' — ' + ch.lede : ''),
        href: chHref,
      });
    }
    let matchedSection = false;
    for (const sub of ch.subs) {
      const href = `${chHref}#${sub.id}`;
      if (sub.title.toLowerCase().includes(v)) {
        titleHits.push({ chapter: ch, sub, ...snippet(sub.text, sub.text.toLowerCase().indexOf(v), v.length), href });
        matchedSection = true;
        continue;
      }
      const i = sub.text.toLowerCase().indexOf(v);
      if (i >= 0) {
        bodyHits.push({ chapter: ch, sub, ...snippet(sub.text, i, v.length), href });
        matchedSection = true;
      }
    }
    if (!matchedSection) {
      const i = ch.text.toLowerCase().indexOf(v);
      if (i >= 0 && !titleHits.some((h) => h.chapter === ch && !h.sub)) {
        bodyHits.push({ chapter: ch, ...snippet(ch.text, i, v.length), href: chHref });
      }
    }
  }
  return [...titleHits, ...bodyHits].slice(0, limit);
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
