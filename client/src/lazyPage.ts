// Route-level code splitting: one chunk per page (App.tsx), loaded on first visit.
// After a deploy the old hashed chunks are gone, so a tab opened before it fails to import the page:
// reload once to pick up the new index.html. The "already reloaded" flag lives in sessionStorage; when storage
// is blocked we can't remember it, so we throw instead of reloading (no reload loop) and MainLayout's
// PageErrorBoundary shows "This page failed to load" with a Reload button.
import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'mis.chunkReloadAt';

function reloadOnce(err: unknown): never {
  let last: number;
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last <= 60_000) throw err; // reloaded a moment ago: the chunk is really gone
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    throw err; // storage blocked (or just reloaded): never reload without the flag saved
  }
  window.location.reload();
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
