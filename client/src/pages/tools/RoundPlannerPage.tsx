// Round planner — cap table across Aneesha joining, the Hyperscale Round, the Feb 2027
// Pre-Seed CCPS conversion and the proposed Series A, with the company secretary's working.
// The planner is a self-contained page in public/embed/round-planner.html, embedded here.

import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { BTN } from '../../components/ui/states';

export function RoundPlannerPage() {
  // The planner scrolls inside its own frame, so the page stays 1 screen tall and the header stays in view.
  return (
    <>
      <PageHeader
        title="Round planner"
        description="Cap table from today to Series A. Change a round to see the dilution."
        actions={<>
          <Link to="/planning" className={BTN}>Back to the 5-year plan</Link>
          <a href="/embed/round-planner.html" target="_blank" rel="noreferrer" className={BTN}>Open in a new tab</a>
        </>}
      />
      <iframe
        src="/embed/round-planner.html"
        title="Round planner"
        className="block w-full border-0 border-t border-slate-200"
        style={{ height: 'calc(100dvh - 116px - var(--app-top, 0px))', minHeight: 480 }}
      />
    </>
  );
}
