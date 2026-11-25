// A small error boundary for one part of a page (a Live MIS section, the chat, the palette). Before, one widget that
// threw blanked the whole page. The part shows what failed and a Try again; the rest of the page keeps working.
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; name: string; quiet?: boolean }
interface State { error: Error | null }

export class PartBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.name} failed`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <div role="alert" className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <p className="font-medium text-slate-900">{this.props.name} could not show.</p>
        <p className="mt-1 text-slate-600">{error.message || 'Error in this part.'}</p>
        <button type="button" onClick={() => this.setState({ error: null })}
          className="mt-2 min-h-11 rounded-lg border border-slate-300 px-3 font-medium text-slate-800 hover:bg-slate-50 sm:min-h-9">
          Try again
        </button>
      </div>
    );
  }
}
