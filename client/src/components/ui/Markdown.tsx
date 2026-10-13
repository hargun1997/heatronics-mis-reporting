// ----------------------------------------------------------------------------
// Minimal, dependency-free Markdown renderer for Claude replies — headings,
// bullet / numbered lists, paragraphs and **bold**. Shared by AI Insights, the
// floating chat widget and anywhere else we show a model answer.
// ----------------------------------------------------------------------------

import { type ReactNode } from 'react';

/** Render inline **bold** spans within a line. */
function inlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>,
  );
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  let ordered = false;
  const flush = () => {
    if (!list.length) return;
    const items = list; list = [];
    if (ordered) out.push(<ol key={`l${out.length}`} className="list-decimal pl-5 space-y-0.5 my-1.5">{items}</ol>);
    else out.push(<ul key={`l${out.length}`} className="list-disc pl-5 space-y-0.5 my-1.5">{items}</ul>);
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const isBullet = /^\s*[-*]\s+/.test(line);
    const isNumber = /^\s*\d+\.\s+/.test(line);
    if (/^#{1,6}\s/.test(line)) {
      flush();
      out.push(<h4 key={i} className="text-sm font-semibold text-slate-800 mt-3 mb-1">{inlineMarkdown(line.replace(/^#{1,6}\s/, ''))}</h4>);
    } else if (isBullet || isNumber) {
      // Switching list type starts a fresh list so markers stay correct.
      if (list.length && ordered !== isNumber) flush();
      ordered = isNumber;
      list.push(<li key={i} className="text-sm text-slate-700">{inlineMarkdown(line.replace(/^\s*(?:[-*]|\d+\.)\s+/, ''))}</li>);
    } else if (line.trim() === '') {
      flush();
    } else {
      flush();
      out.push(<p key={i} className="text-sm text-slate-700 leading-relaxed my-1">{inlineMarkdown(line)}</p>);
    }
  });
  flush();
  return <div>{out}</div>;
}
