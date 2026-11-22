/* eslint-disable react-refresh/only-export-components */
// Confirm, Ask (a one-field prompt) and Toast (GUIDE.md "Confirm and undo", "Menus, tips and toasts").
// They replace the browser's alert / confirm / prompt everywhere. Call them from any handler:
//   if (!(await confirmDialog({ title: 'Delete 3 tasks?', confirm: 'Delete', danger: true }))) return;
//   const name = await askText({ title: 'Name this scenario', label: 'Name', initial: 'Plan' });
//   toast('Saved');  toast('Task deleted', { undo: () => restore() });
// <FeedbackHost /> is mounted once in App.tsx. One confirm at a time; toasts queue, bottom centre, 6 s.
import React, { useState, useSyncExternalStore } from 'react';
import { Modal } from './overlays';
import { Button } from './Button';

interface ConfirmOpts {
  title: string;
  /** One line under the title: what happens. */
  body?: React.ReactNode;
  /** The verb on the main button ("Delete", "Send 48 emails"). */
  confirm: string;
  cancel?: string;
  danger?: boolean;
}
interface AskOpts { title: string; label: string; initial?: string; confirm?: string; body?: React.ReactNode }
interface ToastItem { id: number; text: string; undo?: () => void }

type Pending =
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'ask'; opts: AskOpts; resolve: (v: string | null) => void };

let pending: Pending | null = null;
let toasts: ToastItem[] = [];
let seq = 0;
const ASK_ID = 'kit-ask';
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

function cancelPending() {
  const p = pending;
  pending = null;
  if (p?.kind === 'confirm') p.resolve(false);
  else if (p) p.resolve(null);
}

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    cancelPending();
    pending = { kind: 'confirm', opts, resolve };
    emit();
  });
}

export function askText(opts: AskOpts): Promise<string | null> {
  return new Promise((resolve) => {
    cancelPending();
    pending = { kind: 'ask', opts, resolve };
    emit();
  });
}

/** A short line at the bottom centre for 6 s. Use the button's verb in the past: Save → "Saved". */
export function toast(text: string, opts: { undo?: () => void } = {}): void {
  const id = ++seq;
  toasts = [...toasts.slice(-2), { id, text, undo: opts.undo }];
  emit();
  window.setTimeout(() => dismiss(id), 6000);
}
function dismiss(id: number) { toasts = toasts.filter((t) => t.id !== id); emit(); }

function settle(v: boolean | string | null) {
  const p = pending;
  pending = null;
  emit();
  if (!p) return;
  if (p.kind === 'confirm') p.resolve(v === true);
  else p.resolve(typeof v === 'string' ? v : null);
}

function AskBody({ opts, onDone }: { opts: AskOpts; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(opts.initial ?? '');
  const id = ASK_ID;
  return (
    <form id={`${id}-form`} onSubmit={(e) => { e.preventDefault(); if (v.trim()) onDone(v.trim()); }} className="space-y-1.5">
      {opts.body && <div className="text-sm text-slate-700">{opts.body}</div>}
      <label htmlFor={id} className="block text-label font-medium text-slate-700">{opts.label}</label>
      <input id={id} data-autofocus value={v} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.currentTarget.select()}
        className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" />
    </form>
  );
}

export function FeedbackHost() {
  const snap = useSyncExternalStore(subscribe, () => pending, () => null);
  const list = useSyncExternalStore(subscribe, () => toasts, () => toasts);

  return (
    <>
      {snap?.kind === 'confirm' && (
        <Modal open width={400} title={snap.opts.title} onClose={() => settle(false)}
          footer={<>
            <Button onClick={() => settle(false)}>{snap.opts.cancel ?? 'Cancel'}</Button>
            <Button data-autofocus={snap.opts.danger ? undefined : true} variant={snap.opts.danger ? 'danger' : 'primary'} onClick={() => settle(true)}>{snap.opts.confirm}</Button>
          </>}>
          {snap.opts.body ? <div className="text-sm text-slate-700">{snap.opts.body}</div> : <span className="sr-only">{snap.opts.title}</span>}
        </Modal>
      )}
      {snap?.kind === 'ask' && (
        <Modal open dirty width={400} title={snap.opts.title} onClose={() => settle(null)}
          footer={<>
            <Button onClick={() => settle(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form={`${ASK_ID}-form`}>{snap.opts.confirm ?? 'Save'}</Button>
          </>}>
          <AskBody opts={snap.opts} onDone={(v) => settle(v)} />
        </Modal>
      )}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-toast flex flex-col items-center gap-2 px-4 print:hidden">
        {list.map((t) => (
          <div key={t.id} className="pointer-events-auto flex min-h-11 max-w-md items-center gap-3 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-pop animate-toast-in">
            <span>{t.text}</span>
            {t.undo && (
              <button type="button" onClick={() => { t.undo?.(); dismiss(t.id); }}
                className="min-h-9 rounded-md px-2 font-semibold text-heat-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
