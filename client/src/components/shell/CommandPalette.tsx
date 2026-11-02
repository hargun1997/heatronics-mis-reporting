// ⌘K command palette (port of Ops' components/shell/CommandPalette.tsx): jump to any page in nav/config.ts
// (old pages included), pinned and recent pages, and a few commands.
// ARIA: modal dialog with a combobox input controlling a listbox (aria-activedescendant); ↑ ↓ move,
// Enter opens, ⌘/Ctrl+Enter opens in a new tab, Esc closes and focus returns where it was.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CornerDownLeft, History, Moon, PanelLeft, Pin, Search } from 'lucide-react';
import { paletteIndex, searchPalette, whereIs } from '../../nav/config';
import { usePins, useRecents, useTheme } from './prefs';
import { useShell } from './ShellContext';
import { useOverlay } from './useOverlay';
import { cx } from './cx';

interface Row { id: string; label: string; hint?: string; group: string; icon: 'page' | 'recent' | 'pin' | 'cmd'; run: (newTab?: boolean) => void }

const INDEX = paletteIndex();

export function CommandPalette() {
  const { paletteOpen: open, closePalette } = useShell();
  return open ? <Palette close={closePalette} /> : null;
}

function Palette({ close }: { close: () => void }) {
  const navigate = useNavigate();
  const path = useLocation().pathname || '/';
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useOverlay(true, panel, close, { initialFocus: input });
  const recents = useRecents();
  const { pins, isPinned, toggle } = usePins();
  const { next: nextTheme } = useTheme();

  const go = (href: string, newTab?: boolean) => {
    close();
    if (newTab) { try { window.open(href, '_blank', 'noopener'); } catch { /* blocked */ } return; }
    navigate(href);
  };

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    const here = whereIs(path);
    const commands: Row[] = [
      ...(here ? [{ id: 'cmd-pin', label: isPinned(path) ? `Unpin “${here.page.label}”` : `Pin “${here.page.label}” to the sidebar`, group: 'Commands', icon: 'cmd' as const, run: () => { toggle({ href: path, label: here.page.label, context: here.section.label }); close(); } }] : []),
      { id: 'cmd-theme', label: 'Switch theme (light → dark → system)', group: 'Commands', icon: 'cmd', run: () => { nextTheme(); close(); } },
      { id: 'cmd-rail', label: 'Collapse or expand the sidebar', group: 'Commands', icon: 'cmd', run: () => { window.dispatchEvent(new Event('mis:rail')); close(); } },
    ];
    if (!q.trim()) {
      for (const p of pins) out.push({ id: `pin:${p.href}`, label: p.label, hint: p.context || undefined, group: 'Pinned', icon: 'pin', run: (nt) => go(p.href, nt) });
      for (const r of recents.filter((r) => r.href !== path && !pins.some((p) => p.href === r.href)).slice(0, 5)) out.push({ id: `recent:${r.href}`, label: r.label, hint: r.context || undefined, group: 'Recent', icon: 'recent', run: (nt) => go(r.href, nt) });
      for (const it of INDEX.filter((i) => i.section !== 'More').slice(0, 8)) out.push({ id: it.id, label: it.label, hint: it.hint, group: 'Go to', icon: 'page', run: (nt) => go(it.href, nt) });
      out.push(...commands);
      return out;
    }
    for (const it of searchPalette(INDEX, q, 10)) out.push({ id: it.id, label: it.label, hint: it.hint, group: 'Pages', icon: 'page', run: (nt) => go(it.href, nt) });
    out.push(...searchPalette(commands.map((c) => ({ ...c, words: c.label.toLowerCase() })), q, 3));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pins, recents, path]);

  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); rows[active]?.run(e.metaKey || e.ctrlKey); }
  };
  const optId = (i: number) => `cmdk-opt-${i}`;
  let lastGroup = '';

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-scrim/50 px-3 pt-[10vh] backdrop-blur-[2px] sm:pt-[14vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Search or jump to" className="w-full max-w-xl overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl" onKeyDown={onKey}>
        <div className="flex items-center gap-2 border-b border-stone-200 px-3">
          <Search className="h-5 w-5 shrink-0 text-stone-500" aria-hidden />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Jump to a page…"
            role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" aria-activedescendant={rows.length ? optId(active) : undefined} aria-label="Search pages"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-stone-900 placeholder:text-stone-500 focus:outline-none" autoComplete="off" spellCheck={false} />
          <kbd className="hidden rounded border border-stone-200 px-1.5 py-0.5 text-xs text-stone-500 sm:inline" aria-hidden>Esc</kbd>
        </div>
        <ul id="cmdk-list" ref={listRef} role="listbox" aria-label="Results" className="max-h-[min(60vh,28rem)] overflow-y-auto p-1.5">
          {rows.length === 0 && <li role="presentation" className="px-3 py-8 text-center text-sm text-stone-600">No page matches “{q}”. Try “close”, “tally”, “plan” or “invoice”.</li>}
          {rows.map((r, i) => {
            const head = r.group !== lastGroup ? r.group : null; lastGroup = r.group;
            const Icon = r.icon === 'recent' ? History : r.icon === 'pin' ? Pin : r.icon === 'cmd' ? (r.id === 'cmd-theme' ? Moon : r.id === 'cmd-rail' ? PanelLeft : Pin) : ArrowRight;
            return (
              <li key={r.id} role="presentation">
                {head && <div role="presentation" className="px-3 pb-1 pt-2.5 text-xs font-semibold uppercase tracking-wider text-stone-500">{head}</div>}
                <div id={optId(i)} data-i={i} role="option" aria-selected={i === active} onMouseMove={() => setActive(i)} onClick={(e) => r.run(e.metaKey || e.ctrlKey)}
                  className={cx('flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm', i === active ? 'bg-accent-50 text-stone-900' : 'text-stone-700')}>
                  <Icon className={cx('h-4 w-4 shrink-0', i === active ? 'text-accent-600' : 'text-stone-500')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.label}</span>
                    {r.hint && <span className="block truncate text-xs text-stone-500">{r.hint}</span>}
                  </span>
                  {i === active && <CornerDownLeft className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600" aria-hidden>
          <span><kbd className="font-sans">↑ ↓</kbd> move</span><span><kbd className="font-sans">Enter</kbd> open</span><span><kbd className="font-sans">Ctrl/⌘ Enter</kbd> new tab</span>
        </div>
      </div>
    </div>
  );
}
