// Accounts Handbook search — one search box in two sizes: the large one on
// the handbook home and the compact one in the bar of every collection and
// article page. Results open the exact article (and heading) and highlight
// the match. Press "/" anywhere in the handbook to jump to search.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchHandbook, type HbSearchHit } from '../../data/handbook/handbook';
import { useHandbookOpen } from './handbookNav';

const searchIcon = (cls: string) => (
  <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15z" />
  </svg>
);

// Plain-language questions ("how do I book a Shopflo invoice") rarely match
// as one phrase. When the phrase finds little, fall back to the articles that
// contain the most of the meaningful words, best match first.
const STOP = new Set(
  'a an and are at be book booked booking by can do does for from get how i in into is it me my of on or should the this to we what when where which who why with you your'.split(' '),
);

function smartSearch(q: string): HbSearchHit[] {
  const phrase = searchHandbook(q);
  const words = q
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));
  if (phrase.length >= 5 || words.length < 2) return phrase.length || words.length !== 1 ? phrase : searchHandbook(words[0]);
  const score = new Map<string, { hit: HbSearchHit; n: number; title: number }>();
  for (const w of words) {
    for (const h of searchHandbook(w, 200)) {
      const k = h.article.href;
      const cur = score.get(k);
      const inTitle = h.article.title.toLowerCase().includes(w) ? 1 : 0;
      if (cur) {
        cur.n += 1;
        cur.title += inTitle;
      } else score.set(k, { hit: h, n: 1, title: inTitle });
    }
  }
  const seen = new Set(phrase.map((h) => h.article.href));
  const extra = [...score.values()]
    .filter((x) => !seen.has(x.hit.article.href) && x.n >= Math.min(2, words.length))
    .sort((a, b) => b.n - a.n || b.title - a.title)
    .map((x) => x.hit);
  return [...phrase, ...extra].slice(0, 40);
}

function Hit({ h, active, onPick }: { h: HbSearchHit; active: boolean; onPick: (h: HbSearchHit) => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(h)}
      className={`w-full text-left rounded-lg px-3 py-2.5 ${active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
        <span className="font-semibold text-slate-900">{h.article.title}</span>
        {h.heading && <span className="text-slate-500">› {h.heading.title}</span>}
        <span className="ml-auto text-[11px] font-medium uppercase tracking-wide text-slate-500">{h.article.collection.title}</span>
      </div>
      <div className="mt-0.5 text-xs leading-relaxed text-slate-500 line-clamp-2">
        {h.before}
        {h.match && <mark className="bg-amber-100 text-slate-900 rounded px-0.5">{h.match}</mark>}
        {h.after}
      </div>
    </button>
  );
}

export function HandbookSearch({
  size = 'compact',
  autoFocus = false,
  examples,
}: {
  size?: 'compact' | 'large';
  /** Focus on mount (desktop only — on phones it would pop the keyboard). */
  autoFocus?: boolean;
  /** Plain-language example searches shown under the box. */
  examples?: string[];
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const openInReader = useHandbookOpen();
  const hits = useMemo(() => smartSearch(q), [q]);
  const large = size === 'large';
  const showing = q.trim().length >= 2 && open;

  useEffect(() => {
    if (autoFocus && window.matchMedia('(min-width: 1024px)').matches) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  // "/" focuses search (unless already typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // Several boxes can be mounted (home + reader bar); only a visible one takes "/".
      if (e.key === '/' && inputRef.current?.offsetParent && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (h: HbSearchHit) => {
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    if (openInReader) openInReader(h.href);
    else navigate(h.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault();
      pick(hits[active]);
    } else if (e.key === 'Escape') {
      setQ('');
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className={`relative ${large ? 'w-full' : 'w-full max-w-sm'}`}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
          {searchIcon(large ? 'h-5 w-5' : 'h-4 w-4')}
        </span>
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showing}
          aria-label="Search the handbook"
          placeholder={large ? 'What do you need to do? e.g. Shopflo invoice' : 'Search the handbook…'}
          className={`w-full rounded-xl border bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-500 ${
            large ? 'border-slate-300 pl-12 pr-14 py-4 text-[17px] shadow-soft' : 'border-slate-200 pl-9 pr-10 py-2 text-sm'
          }`}
        />
        {!q && (
          <kbd className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-medium text-slate-500">
            /
          </kbd>
        )}
        {showing && (
          <div
            role="listbox"
            className={`absolute top-full z-40 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-popover ${
              large ? 'left-0 right-0' : 'right-0 w-[min(580px,calc(100vw-2rem))]'
            }`}
          >
            <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {hits.length ? `${hits.length}${hits.length === 40 ? '+' : ''} result${hits.length > 1 ? 's' : ''}` : `No results for “${q.trim()}”`}
            </div>
            {hits.map((h, i) => (
              <Hit key={h.href + i} h={h} active={i === active} onPick={pick} />
            ))}
          </div>
        )}
      </div>
      {examples && examples.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-slate-600">
          <span className="mr-1">Try:</span>
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQ(ex);
                setActive(0);
                setOpen(true);
                inputRef.current?.focus();
              }}
              className="min-h-[40px] rounded-lg px-2.5 font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:bg-slate-100 hover:text-brand-700 hover:decoration-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
