// Accounts Handbook search — one search box in two sizes: the large one on
// the handbook home and the compact one in the bar of every collection and
// article page. Results open the exact article (and heading) and highlight
// the match. Press "/" anywhere in the handbook to jump to search.

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
      role="option"
      aria-selected={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(h)}
      className={`w-full text-left rounded-lg px-3 py-2.5 ${active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
        <span className="font-semibold text-slate-900">{h.article.title}</span>
        {h.heading && <span className="text-slate-500">› {h.heading.title}</span>}
        <span className="ml-auto text-[11px] font-medium uppercase tracking-wide text-slate-400">{h.article.collection.title}</span>
      </div>
      <div className="mt-0.5 text-xs leading-relaxed text-slate-500 line-clamp-2">
        {h.before}
        {h.match && <mark className="bg-amber-100 text-slate-900 rounded px-0.5">{h.match}</mark>}
        {h.after}
      </div>
    </button>
  );
}

export function HandbookSearch({ size = 'compact' }: { size?: 'compact' | 'large' }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const hits = useMemo(() => searchHandbook(q), [q]);
  const large = size === 'large';
  const showing = q.trim().length >= 2 && open;

  // "/" focuses search (unless already typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) {
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
          placeholder={large ? 'Search — e.g. Snapmint, option 5, TDS 194C, Journal 53…' : 'Search the handbook…'}
          className={`w-full rounded-xl border bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400 ${
            large ? 'border-slate-300/80 pl-12 pr-14 py-4 text-base shadow-card-lg' : 'border-slate-200 pl-9 pr-10 py-1.5 text-sm'
          }`}
        />
        {!q && (
          <kbd className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-medium text-slate-400">
            /
          </kbd>
        )}
      </div>
      {showing && (
        <div
          role="listbox"
          className={`absolute z-40 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-popover ${
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
  );
}
