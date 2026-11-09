// Catches a page that throws while loading or rendering (e.g. a lazy chunk that is gone after a deploy and could not
// reload itself: lazyPage.ts) so the shell stays usable. MainLayout keys it by path: moving to another page resets it.
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { failed: boolean }

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page failed to load', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="m-6 max-w-md rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-medium text-slate-900">This page failed to load</p>
        <p className="mt-1 text-sm text-slate-600">Reload to try again. If it keeps failing, the app may have just been updated.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 min-h-[44px] rounded-lg bg-cta px-4 text-sm font-medium text-on-cta hover:bg-cta-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          Reload
        </button>
      </div>
    );
  }
}
