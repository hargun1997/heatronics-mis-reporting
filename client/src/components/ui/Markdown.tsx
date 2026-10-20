// ----------------------------------------------------------------------------
// Minimal, dependency-free Markdown renderer for Claude replies — headings,
// bullet / numbered lists, paragraphs, **bold**, `code`, [links](/path), bare
// /handbook#… paths and pipe tables. Shared by AI Insights, the floating chat
// widget, the Booking assistant and anywhere else we show a model answer.
// ----------------------------------------------------------------------------

import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

// One pass over a line: [text](href) · **bold** · *italic* · `code` · bare /handbook… path.
const INLINE = /(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(`[^`]+`)|((?<![\w/])\/handbook(?:[/#][\w\-/#.]*)?)/g;

function renderLink(label: ReactNode, href: string, key: string | number): ReactNode {
  const cls = 'font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800';
  if (href.startsWith('/')) return <Link key={key} to={href} className={cls}>{label}</Link>;
  if (/^https?:\/\//.test(href)) return <a key={key} href={href} target="_blank" rel="noreferrer" className={cls}>{label}</a>;
  return <span key={key}>{label}</span>;
}

/** Render inline markup within a line. */
function inlineMarkdown(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  // A fresh regex per call — link labels recurse, and a shared /g lastIndex would loop forever.
  const re = new RegExp(INLINE.source, 'g');
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<span key={`t${last}`}>{text.slice(last, m.index)}</span>);
    const tok = m[0];
    if (m[1]) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      out.push(renderLink(inlineMarkdown(lm[1]), lm[2], m.index));
    } else if (m[2]) {
      out.push(<strong key={m.index} className="font-semibold text-slate-900">{tok.slice(2, -2)}</strong>);
    } else if (m[3]) {
      out.push(<em key={m.index}>{tok.slice(1, -1)}</em>);
    } else if (m[4]) {
      out.push(<code key={m.index} className="font-mono text-[0.92em] rounded bg-slate-100 px-1 py-px text-slate-900">{tok.slice(1, -1)}</code>);
    } else {
      out.push(renderLink(tok, tok, m.index));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(<span key={`t${last}`}>{text.slice(last)}</span>);
  return out;
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableRule = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
// Right-align columns that are mostly numbers / amounts.
const looksNumeric = (s: string) => /^[-−(]?\s*(₹|rs\.?|inr|\$)?\s*[\d,]+(\.\d+)?\)?\s*%?$/i.test(s.replace(/\*\*/g, ''));

function Table({ rows, keyBase }: { rows: string[][]; keyBase: number }) {
  const [head, ...body] = rows;
  const numericCol = head.map((_, ci) => {
    const vals = body.map((r) => r[ci] ?? '').filter((v) => v && v !== '—' && v !== '-');
    return vals.length > 0 && vals.filter(looksNumeric).length / vals.length >= 0.6;
  });
  return (
    <div key={`tb${keyBase}`} className="md-table my-2 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50">
            {head.map((h, ci) => (
              <th key={ci} className={`border-b border-slate-200 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 ${numericCol[ci] ? 'text-right' : ''}`}>
                {inlineMarkdown(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri} className="border-b border-slate-100 last:border-0">
              {head.map((_, ci) => (
                <td key={ci} className={`px-3 py-1.5 align-top text-slate-800 ${numericCol[ci] ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>
                  {inlineMarkdown(r[ci] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    // Pipe table: a header row followed by a |---|---| rule.
    if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      flush();
      const rows: string[][] = [cells(line)];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j])) rows.push(cells(lines[j++]));
      out.push(<Table key={`tb${i}`} rows={rows} keyBase={i} />);
      i = j - 1;
      continue;
    }
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
  }
  flush();
  return <div>{out}</div>;
}
