// One place for an ended login and a lost connection (sweep fix, 25 Nov 2026). Before, an expired portal session made
// every page say "Could not load (401)" with no way back, and going offline showed only broken lists.
import { toast } from '../components/ui/feedback';
import { shouldReload } from './sessionRules';

const RELOAD_KEY = 'mis:401-reload';

export function installSessionGuard(): void {
  if (typeof window === 'undefined' || (window as unknown as { __misGuard?: boolean }).__misGuard) return;
  (window as unknown as { __misGuard?: boolean }).__misGuard = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await orig(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let last: number | null = null;
    try { const v = sessionStorage.getItem(RELOAD_KEY); last = v ? Number(v) : null; } catch { /* storage off */ }
    if (shouldReload(res.status, url, window.location.origin, last, Date.now())) {
      try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* storage off */ }
      toast('Your login ended. Opening the login page.');
      setTimeout(() => window.location.reload(), 800);
    }
    return res;
  };
  window.addEventListener('offline', () => toast('No internet connection. The page shows the last numbers it loaded.'));
  window.addEventListener('online', () => toast('Back online.'));
}
