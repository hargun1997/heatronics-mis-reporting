// The task detail panel and the task editor load when a row or the Add task modal opens, not with the Tasks page:
// they pull the handbook (250 kB), the TDS parts and the Excel writer (419 kB). Loading-time pass, 11 Nov 2026.
import { Suspense, lazy, type ComponentProps } from 'react';

const Panel = lazy(() => import('./TaskPanel').then((m) => ({ default: m.TaskPanel })));
const Editor = lazy(() => import('./TaskEditor').then((m) => ({ default: m.TaskEditor })));
const wait = <p role="status" className="px-4 py-3 text-sm text-slate-600">Loading…</p>;

export function TaskPanel(props: ComponentProps<typeof Panel>) {
  return <Suspense fallback={wait}><Panel {...props} /></Suspense>;
}
export function TaskEditor(props: ComponentProps<typeof Editor>) {
  return <Suspense fallback={wait}><Editor {...props} /></Suspense>;
}
