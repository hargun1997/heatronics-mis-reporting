// Route-level code splitting: one chunk per page (App.tsx), loaded on first visit.
// After a deploy the old hashed chunks are gone, so a tab opened before it fails to import the page:
// reload once (flag in sessionStorage, try/catch: storage can be blocked) to pick up the new index.html.
import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'mis.chunkReloadAt';

function reloadOnce(err: unknown): never {
  let last = 0;
  try { last = Number(sessionStorage.getItem(RELOAD_KEY) || 0); } catch { /* storage blocked */ }
  if (Date.now() - last > 60_000) {
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* storage blocked */ }
    window.location.reload();
  }
  throw err;
}

/** `lazyPage(() => import('./pages/x/Page'), 'Page')` — a lazy component from a module's named export. */
export function lazyPage<M extends Record<string, unknown>, K extends keyof M & string>(
  load: () => Promise<M>,
  name: K,
): ComponentType<M[K] extends ComponentType<infer P> ? P : never> {
  return lazy(() =>
    load().then(
      (m) => ({ default: m[name] as ComponentType<M[K] extends ComponentType<infer P> ? P : never> }),
      reloadOnce,
    ),
  );
}
