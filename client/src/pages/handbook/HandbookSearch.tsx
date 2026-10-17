// Accounts Handbook search — one search box used in two sizes: the large one
// on the handbook home and the compact one in the reading bar of every
// chapter. Results deep-link to the exact section and highlight the match.
// Press "/" anywhere in the handbook to jump to search.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchHandbook, type HbSearchHit } from '../../data/handbook/handbook';

const searchIcon = (cls: string) => (
  <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15z" />
  </svg>
);

function Hit({ h, active, onPick }: { h: HbSearchHit; active: boolean; onPick: (h: HbSearchHit) => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(h)}
      className={`w-full text-left rounded-lg px-3 py-2.5 ${active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
    >
      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-mono text-xs text-brand-700 min-w-[26px]">{h.chapter.no}</span>
        <span className="font-semibold text-slate-900">{h.chapter.title}</span>
        {h.sub && <span className="text-slate-500 truncate">› {h.sub.title}</span>}
      </div>
      <div className="mt-0.5 pl-[34px] text-xs leading-relaxed text-slate-500 line-clamp-2">
        {h.before}
        {h.match && <mark className="bg-amber-100 text-slate-900 rounded px-0.5">{h.match}</mark>}
        {h.after}
      </div>
    </button>
  );
}

export function HandbookSearch({ size = 'compact', autoFocusKey = true }: { size?: 'compact' | 'large'; autoFocusKey?: boolean }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const hits = useMemo(() => searchHandbook(q), [q]);
  const large = size === 'large';
  const showing = q.trim().length >= 2 && (large || open);

  // "/" focuses search (unless already typing somewhere).
  useEffect(() => {
    if (!autoFocusKey) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [autoFocusKey]);

  const pick = (h: HbSearchHit) => {
    setOpen(false);
    if (!large) setQ('');
    inputRef.current?.blur();
    navigate(h.href);
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

  const results = (
    <div role="listbox" aria-label="Search results">
      <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {hits.length ? `${hits.length}${hits.length === 40 ? '+' : ''} result${hits.length > 1 ? 's' : ''}` : `No results for “${q.trim()}”`}
      </div>
      {hits.map((h, i) => (
        <Hit key={h.href + i} h={h} active={i === active} onPick={pick} />
      ))}
    </div>
  );

  return (
    <div className={`relative ${large ? 'w-full' : 'w-full max-w-sm'}`}>
      <div className="relative">
        <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400`}>
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
          placeholder={large ? 'Search the handbook — e.g. Snapmint, option 5, TDS 194C, Journal 53…' : 'Search the handbook…'}
          aria-label="Search the handbook"
          className={`w-full rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300 ${
            large ? 'pl-11 pr-14 py-3.5 text-[15px] shadow-card' : 'pl-9 pr-10 py-1.5 text-sm'
          }`}
        />
        <kbd className={`hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 text-[11px] text-slate-400 ${q ? 'sm:hidden' : ''}`}>/</kbd>
      </div>
      {showing &&
        (large ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-card">{results}</div>
        ) : (
          <div className="absolute right-0 z-40 mt-2 w-[min(560px,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-popover">
            {results}
          </div>
        ))}
    </div>
  );
}
