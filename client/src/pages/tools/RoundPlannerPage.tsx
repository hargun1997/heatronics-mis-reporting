// Round planner — cap table across Aneesha joining, the Hyperscale Round, the Feb 2027
// Pre-Seed CCPS conversion and Round 2, with the company secretary's working.
// The planner is a self-contained page in public/embed/round-planner.html, embedded here.

import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';

const icon = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
  </svg>
);

export function RoundPlannerPage() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1800);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const d = e.data as { type?: string; height?: number };
      if (d?.type === 'round-planner-height' && typeof d.height === 'number') setHeight(Math.ceil(d.height) + 8);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return (
    <>
      <PageHeader
        title="Round planner"
        description="Cap table from today through Aneesha joining, the Hyperscale Round, the Feb 2027 CCPS conversion and Round 2 — with the company secretary's working against the signed SSSHA."
        icon={icon}
        accent="violet"
        actions={<a href="/embed/round-planner.html" target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-700 hover:underline">Open full page ↗</a>}
      />
      <iframe
        ref={frame}
        src="/embed/round-planner.html"
        title="Round planner"
        className="block w-full border-0"
        style={{ height }}
      />
    </>
  );
}
