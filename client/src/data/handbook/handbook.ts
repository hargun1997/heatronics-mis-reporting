// ----------------------------------------------------------------------------
// Accounts Handbook — single source of truth.
//
// The handbook lives in ONE file: client/src/content/handbook/handbook.html.
// That same file is published standalone (the shareable Claude artifact), and
// the app renders it as a help center: collections (cards) → articles (one
// focused page each). collections.ts decides the structure; this module
// parses the HTML once and cuts it into those articles. Screenshots live in
// client/public/handbook/img and are referenced as img/... in the HTML.
//
// To change accounting content, edit handbook.html (and re-run
// `node scripts/handbook/build-css.mjs` if its <style> block changed).
// ----------------------------------------------------------------------------

import raw from '../../content/handbook/handbook.html?raw';
import { COLLECTIONS, type ArticleDef, type CollectionAccent } from './collections';

export const HANDBOOK_BASE = '/handbook';
const IMG_BASE = '/handbook/img/';

export interface HbHeading {
  id: string;
  title: string;
  /** Text from this heading to the next one, for search deep links. */
  text: string;
}

export interface HbArticle {
  slug: string;
  title: string;
  summary: string;
  /** Badge such as "Daily · D1 · ~10 min" (from the task tag in the handbook). */
  tag?: string;
  collection: HbCollection;
  /** Source chapter id in handbook.html. */
  chapterId: string;
  html: string;
  text: string;
  /** "On this page" headings. */
  toc: HbHeading[];
  href: string;
}

export interface HbCollection {
  slug: string;
  title: string;
  description: string;
  accent: CollectionAccent;
  icon: string[];
  articles: HbArticle[];
  href: string;
}

export interface Handbook {
  coverHtml: string;
  collections: HbCollection[];
  articles: HbArticle[];
  /** Any element id in the handbook (chapter ids too) → the article that shows it. */
  idToArticle: Map<string, HbArticle>;
  /** Old chapter-style URL segments (e.g. "13-monthly-tasks") → chapter id. */
  legacySlugs: Map<string, string>;
}

const slugify = (t: string) =>
  t.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const clean = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

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
  wrap
    .querySelectorAll('td,th,li,dt,dd,p,div,h2,h3,h4,figcaption,summary,text,span.p,span.ar,span.s,span.nm,span.a,.je>*')
    .forEach((el) => el.after(doc.createTextNode(' ')));
  // External links open in a new tab.
  wrap.querySelectorAll<HTMLAnchorElement>('a[href^="http"]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener';
  });

  // --- chapters --------------------------------------------------------------
  let coverHtml = '';
  const chapters = new Map<string, Element>();
  const chapterOrder: string[] = [];
  const legacySlugs = new Map<string, string>();
  for (const el of Array.from(wrap.children)) {
    if (el.classList.contains('cover')) {
      el.querySelector('#toc')?.remove();
      coverHtml = el.innerHTML;
    } else if (el.classList.contains('chapter') && el.id) {
      chapters.set(el.id, el);
      chapterOrder.push(el.id);
      const no = clean(el.querySelector('.chno')?.textContent).replace(/^0(?=\d)/, '');
      legacySlugs.set(`${slugify(no)}-${slugify(clean(el.querySelector('.chhead h2')?.textContent))}`, el.id);
    }
  }

  // Give every h3/h4 an id so it can be deep-linked and listed "on this page".
  for (const [cid, el] of chapters) {
    el.querySelectorAll('h3,h4').forEach((h) => {
      if (!h.id) {
        let id = `${cid}-${slugify(clean(h.textContent))}`;
        let n = 2;
        while (doc.getElementById(id)) id = `${cid}-${slugify(clean(h.textContent))}-${n++}`;
        h.id = id;
      }
    });
  }

  // --- articles ----------------------------------------------------------------
  const collections: HbCollection[] = [];
  const articles: HbArticle[] = [];
  const idToArticle = new Map<string, HbArticle>();
  const used = new Set<string>();
  const usedSlugs = new Set<string>();

  /** Build an article from a set of top-level chapter nodes. */
  const makeArticle = (
    col: HbCollection,
    chapterId: string,
    nodes: Element[],
    title: string,
    summary: string,
    headingLevel: 'h3' | 'h4',
    /** Source heading text to drop (the page shows the title natively). */
    sourceTitle: string = title,
  ): HbArticle => {
    const box = doc.createElement('div');
    box.className = 'chapter hb-article';
    nodes.forEach((n) => box.appendChild(n.cloneNode(true)));
    // The page shows the title and task tag natively; drop the duplicates.
    let tag: string | undefined;
    const lead = box.querySelector(':scope > .opblock > header, :scope > header');
    if (lead) {
      const t = lead.querySelector('.tag');
      if (t) {
        const txt = clean(t.textContent);
        if (!/^[A-Z]\d+$/.test(txt)) tag = txt; // drop stale internal codes like "A9"
        t.remove();
      }
      const h3 = lead.querySelector('h3');
      if (h3 && clean(h3.textContent) === sourceTitle) h3.remove();
      if (!clean(lead.textContent)) lead.remove();
    }
    const firstH3 = box.querySelector(':scope > h3');
    if (firstH3 && clean(firstH3.textContent) === sourceTitle) firstH3.remove();

    // "On this page": h3s for whole chapters, h4 steps for single sections.
    // Journal-entry captions (.je h4) are not headings a reader navigates by.
    const pick = (sel: string) => Array.from(box.querySelectorAll(sel)).filter((h) => !h.closest('.je'));
    let heads = pick(headingLevel);
    if (heads.length < 2 && headingLevel === 'h3') heads = pick('h4');
    const toc: HbHeading[] = heads
      .filter((h) => h.id && clean(h.textContent))
      .map((h, i, arr) => {
        const range = doc.createRange();
        range.setStartBefore(h);
        if (arr[i + 1]) range.setEndBefore(arr[i + 1]);
        else range.setEndAfter(box.lastChild ?? box);
        return { id: h.id, title: clean(h.textContent), text: clean(range.toString()) };
      });

    let slug = slugify(title) || chapterId;
    while (usedSlugs.has(`${col.slug}/${slug}`)) slug += '-2';
    usedSlugs.add(`${col.slug}/${slug}`);
    const art: HbArticle = {
      slug,
      title,
      summary,
      tag,
      collection: col,
      chapterId,
      html: box.outerHTML,
      text: clean(box.textContent),
      toc,
      href: `${col.href}/${slug}`,
    };
    // Map every id from the source nodes (including headings the page now
    // renders natively) to this article, for deep links and old URLs.
    nodes.forEach((n) => {
      if (n.id) idToArticle.set(n.id, art);
      n.querySelectorAll('[id]').forEach((d) => idToArticle.set(d.id, art));
    });
    return art;
  };

  const addChapter = (col: HbCollection, def: ArticleDef) => {
    const el = chapters.get(def.chapter);
    if (!el) return;
    used.add(def.chapter);
    const chTitle = clean(el.querySelector('.chhead h2')?.textContent);
    const lede = clean(el.querySelector('.chhead .lede')?.textContent);
    const body = Array.from(el.children).filter((c) => !c.classList.contains('chhead'));
    const out: HbArticle[] = [];

    if (!def.split) {
      out.push(makeArticle(col, def.chapter, body, def.title ?? chTitle, def.summary ?? lede, 'h3', chTitle));
    } else {
      // Group: a top-level node that is or contains an h3 starts a new section.
      const intro: Element[] = [];
      const groups: { head: Element; nodes: Element[] }[] = [];
      for (const n of body) {
        const h = n.matches('h3') ? n : n.querySelector('h3');
        if (h) groups.push({ head: h, nodes: [n] });
        else if (groups.length) groups[groups.length - 1].nodes.push(n);
        else intro.push(n);
      }
      const hasIntro = intro.some((n) => clean(n.textContent).length > 0);
      if (hasIntro && def.overviewTitle) {
        out.push(makeArticle(col, def.chapter, intro, def.overviewTitle, def.summary ?? lede, 'h3'));
      } else if (hasIntro && groups[0]) {
        groups[0].nodes.unshift(...intro); // fold a short intro into the first section
      }
      groups.forEach((g, i) => {
        const t = clean(g.head.textContent);
        const sec = def.sections?.[g.head.id] ?? def.sections?.[t] ?? {};
        const target = (sec.collection && colBySlug.get(sec.collection)) || col;
        const sum = sec.summary ?? clean(g.nodes.map((n) => n.textContent).join(' ')).replace(t, '').slice(0, 140).trim() + '…';
        const a = makeArticle(target, def.chapter, g.nodes, sec.title ?? t, sum, 'h4', t);
        if (!def.overviewTitle && i === 0) idToArticle.set(def.chapter, a);
        if (target === col) out.push(a);
        else target.articles.push(a);
      });
    }
    if (out[0]) idToArticle.set(def.chapter, out[0]);
    col.articles.push(...out);
  };

  // Create every collection first, so a split chapter can place a section in
  // another collection (e.g. purchases from the Tranzact chapter).
  const colBySlug = new Map<string, HbCollection>();
  for (const c of COLLECTIONS) {
    const col: HbCollection = {
      slug: c.slug,
      title: c.title,
      description: c.description,
      accent: c.accent,
      icon: c.icon,
      articles: [],
      href: `${HANDBOOK_BASE}/${c.slug}`,
    };
    collections.push(col);
    colBySlug.set(c.slug, col);
  }
  COLLECTIONS.forEach((c) => c.articles.forEach((d) => addChapter(colBySlug.get(c.slug)!, d)));

  // Safety net: any chapter not placed in a collection is still published.
  const leftover = chapterOrder.filter((id) => !used.has(id));
  if (leftover.length) {
    const more: HbCollection = {
      slug: 'more',
      title: 'More',
      description: 'Other handbook chapters.',
      accent: 'brand',
      icon: ['M4 6h16M4 12h16M4 18h16'],
      articles: [],
      href: `${HANDBOOK_BASE}/more`,
    };
    collections.push(more);
    leftover.forEach((id) => addChapter(more, { chapter: id }));
  }

  // Reading order (previous / next) follows the collections.
  articles.push(...collections.flatMap((c) => c.articles));
  cache = { coverHtml, collections, articles, idToArticle, legacySlugs };
  return cache;
}

/** URL for any handbook anchor id (chapter id or any element id inside it). */
export function handbookHref(anchorId?: string): string {
  if (!anchorId || anchorId === 'c0') return HANDBOOK_BASE;
  const a = getHandbook().idToArticle.get(anchorId);
  if (!a) return HANDBOOK_BASE;
  const isWholeTarget = a.chapterId === anchorId || !a.toc.length || a.html.indexOf(`id="${anchorId}"`) < 0;
  return isWholeTarget ? a.href : `${a.href}#${anchorId}`;
}

// --- search ------------------------------------------------------------------

export interface HbSearchHit {
  article: HbArticle;
  heading?: HbHeading;
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
 * Full-text search across every article. Title matches rank first, then the
 * first body match per article, deep-linked to the heading it sits under.
 */
export function searchHandbook(q: string, limit = 40): HbSearchHit[] {
  const v = q.trim().toLowerCase();
  if (v.length < 2) return [];
  const top: HbSearchHit[] = [];
  const rest: HbSearchHit[] = [];
  for (const a of getHandbook().articles) {
    const t = a.title.toLowerCase().indexOf(v);
    if (t >= 0) {
      top.push({ article: a, before: a.title.slice(0, t), match: a.title.slice(t, t + v.length), after: a.title.slice(t + v.length) + ' — ' + a.summary, href: a.href });
      continue;
    }
    const h = a.toc.find((x) => x.title.toLowerCase().includes(v));
    if (h) {
      const i = h.title.toLowerCase().indexOf(v);
      top.push({ article: a, heading: h, before: h.title.slice(0, i), match: h.title.slice(i, i + v.length), after: h.title.slice(i + v.length), href: `${a.href}#${h.id}` });
      continue;
    }
    const i = a.text.toLowerCase().indexOf(v);
    if (i < 0) continue;
    const under = a.toc.find((x) => x.text.toLowerCase().includes(v));
    rest.push({ article: a, heading: under, ...snippet(a.text, i, v.length), href: under ? `${a.href}#${under.id}` : a.href });
  }
  return [...top, ...rest].slice(0, limit);
}

/**
 * The whole handbook as plain text, for the "Ask about the handbook" chat.
 * Built from the same single source, so the chat can never drift from it.
 */
export function handbookChatContext(): string {
  return getHandbook()
    .collections.map(
      (c) =>
        `# ${c.title}\n` +
        c.articles.map((a) => `## ${a.title} (open: ${a.href})\n${a.text}`).join('\n\n'),
    )
    .join('\n\n');
}
