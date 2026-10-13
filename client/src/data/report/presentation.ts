// ----------------------------------------------------------------------------
// Presentation builder — turn the live MIS deck into a single, self-contained,
// animated HTML page that can be emailed, downloaded or opened in a tab. The
// "motion" is pure CSS: sections and bars rise/grow in on load with a staggered
// delay, so the numbers animate the way a built deck would.
//
// Everything is inlined (no external CSS/JS/fonts) so it renders the same in an
// email client, a browser tab or a saved .html file.
// ----------------------------------------------------------------------------

import type { LiveDeckData } from '../misDeck/liveDeck';
import type { MonthlyMIS } from '../misDeck/misDeckData';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : '—');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const MN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (k: string) => { const [y, m] = k.split('-').map(Number); return `${MN[m] ?? m} ${y}`; };

export interface PresentationOptions {
  /** Executive summary (markdown-ish text) to show up top, if any. */
  summary?: string;
  title?: string;
}

function bars(rows: { label: string; value: number }[], color: string): string {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return rows
    .map((r, i) => {
      const w = Math.max(1, (Math.abs(r.value) / max) * 100);
      return `<div class="bar-row" style="animation-delay:${0.05 * i}s">
        <div class="bar-label">${esc(r.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${color}"></div></div>
        <div class="bar-val">${inr(r.value)}</div>
      </div>`;
    })
    .join('');
}

function summaryHtml(summary: string): string {
  // Minimal markdown: headings, bullets, **bold**, paragraphs.
  const inline = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const out: string[] = [];
  let inList = false;
  for (const raw of summary.split('\n')) {
    const line = raw.trim();
    if (/^#{1,6}\s/.test(line)) { if (inList) { out.push('</ul>'); inList = false; } out.push(`<h3>${inline(line.replace(/^#{1,6}\s/, ''))}</h3>`); }
    else if (/^[-*]\s+/.test(line)) { if (!inList) { out.push('<ul>'); inList = true; } out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`); }
    else if (line === '') { if (inList) { out.push('</ul>'); inList = false; } }
    else { if (inList) { out.push('</ul>'); inList = false; } out.push(`<p>${inline(line)}</p>`); }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

function pnlCascade(m: MonthlyMIS): string {
  const rows: { label: string; value: number; strong?: boolean }[] = [
    { label: 'Net Revenue', value: m.netRevenue, strong: true },
    { label: '− COGM', value: -m.cogm },
    { label: 'Gross Margin', value: m.grossMargin, strong: true },
    { label: '− Channel & Fulfilment', value: -m.channelFulfillment },
    { label: 'CM1', value: m.cm1, strong: true },
    { label: '− Sales & Marketing', value: -m.salesMarketing },
    { label: 'CM2', value: m.cm2, strong: true },
    { label: '− Platform & Payment', value: -m.platformCosts },
    { label: 'CM3', value: m.cm3, strong: true },
    { label: '− Operating Expenses', value: -m.opex },
    { label: 'EBITDA', value: m.ebitda, strong: true },
    { label: 'Net Income', value: m.netIncome, strong: true },
  ];
  return rows
    .map((r, i) => `<tr style="animation-delay:${0.04 * i}s" class="${r.strong ? 'strong' : ''}">
      <td>${esc(r.label)}</td>
      <td class="num">${inr(r.value)}</td>
      <td class="num muted">${r.strong ? pct(r.value, m.netRevenue) : ''}</td></tr>`)
    .join('');
}

export function buildPresentationHtml(deck: LiveDeckData, opts: PresentationOptions = {}): string {
  const title = opts.title || 'Heatronics MIS';
  const months = [...deck.months].sort((a, b) => a.key.localeCompare(b.key));
  const last12 = months.slice(-12);
  // Latest fully-closed month, else latest with any data.
  const latestFull = [...months].reverse().find((m) => deck.completeness[m.key]?.level === 'full');
  const latest = latestFull ?? months[months.length - 1];
  const rangeLabel = months.length ? `${monthLabel(months[0].key)} – ${monthLabel(months[months.length - 1].key)}` : '';

  const revBars = bars(last12.map((m) => ({ label: monthLabel(m.key), value: m.netRevenue })), '#2563eb');
  const mkt = latest?.marketingByPlatform ?? {};
  const mktBars = Object.keys(mkt).length
    ? bars(Object.entries(mkt).map(([k, v]) => ({ label: k, value: v })), '#fe4705')
    : '<p class="empty">No ad-platform breakdown for this month.</p>';
  const chan = latest?.netByChannel ?? {};
  const chanBars = Object.keys(chan).length
    ? bars(Object.entries(chan).map(([k, v]) => ({ label: k, value: v as number })), '#0ea5e9')
    : '<p class="empty">No channel split for this month.</p>';

  const kpi = (label: string, value: string, sub = '') =>
    `<div class="kpi"><div class="kpi-v">${value}</div><div class="kpi-l">${esc(label)}</div>${sub ? `<div class="kpi-s">${esc(sub)}</div>` : ''}</div>`;

  const kpis = latest
    ? [
        kpi('Net Revenue', inr(latest.netRevenue), monthLabel(latest.key)),
        kpi('Gross Margin', pct(latest.grossMargin, latest.netRevenue), inr(latest.grossMargin)),
        kpi('CM2', pct(latest.cm2, latest.netRevenue), inr(latest.cm2)),
        latestFull ? kpi('Net Income', inr(latest.netIncome), pct(latest.netIncome, latest.netRevenue)) : kpi('Sales & Marketing', inr(latest.salesMarketing), 'latest month'),
      ].join('')
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; color:#0f172a; background:#f8fafc; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 28px 20px 60px; }
  .hero { background: linear-gradient(135deg,#fe4705,#b5370b); color:#fff; border-radius:20px; padding:28px 26px; }
  .hero h1 { margin:0; font-size:26px; letter-spacing:-0.02em; }
  .hero p { margin:6px 0 0; opacity:.9; font-size:14px; }
  section { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:20px 22px; margin-top:16px;
            opacity:0; transform: translateY(14px); animation: riseIn .5s ease forwards; }
  section:nth-of-type(1){animation-delay:.05s} section:nth-of-type(2){animation-delay:.12s}
  section:nth-of-type(3){animation-delay:.19s} section:nth-of-type(4){animation-delay:.26s}
  section:nth-of-type(5){animation-delay:.33s} section:nth-of-type(6){animation-delay:.40s}
  h2 { font-size:15px; margin:0 0 14px; color:#334155; text-transform:uppercase; letter-spacing:.08em; }
  h3 { font-size:14px; margin:14px 0 6px; }
  .kpis { display:grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap:12px; }
  .kpi { background:#f8fafc; border:1px solid #eef2f7; border-radius:12px; padding:14px; }
  .kpi-v { font-size:22px; font-weight:700; letter-spacing:-0.02em; }
  .kpi-l { font-size:12px; color:#64748b; margin-top:2px; }
  .kpi-s { font-size:11px; color:#94a3b8; margin-top:2px; }
  .bar-row { display:grid; grid-template-columns: 150px 1fr 110px; align-items:center; gap:10px; margin:7px 0;
             opacity:0; transform: translateX(-8px); animation: slideIn .45s ease forwards; }
  .bar-label { font-size:12px; color:#475569; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bar-track { background:#f1f5f9; border-radius:6px; height:16px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:6px; transform-origin:left; animation: grow .7s ease forwards; }
  .bar-val { font-size:12px; text-align:right; font-variant-numeric: tabular-nums; color:#334155; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  td { padding:5px 8px; border-bottom:1px solid #f1f5f9; opacity:0; animation: fadeIn .4s ease forwards; }
  td.num { text-align:right; font-variant-numeric: tabular-nums; }
  td.muted { color:#94a3b8; }
  tr.strong td { font-weight:700; background:#f8fafc; }
  .summary p { font-size:13.5px; line-height:1.6; color:#334155; margin:8px 0; }
  .summary li { font-size:13.5px; line-height:1.55; color:#334155; }
  .empty { color:#94a3b8; font-size:13px; }
  .foot { color:#94a3b8; font-size:11px; margin-top:22px; text-align:center; }
  @keyframes riseIn { to { opacity:1; transform:none; } }
  @keyframes slideIn { to { opacity:1; transform:none; } }
  @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes fadeIn { to { opacity:1; } }
  @media (prefers-reduced-motion: reduce){ *{animation:none!important; opacity:1!important; transform:none!important;} }
</style></head>
<body><div class="wrap">
  <div class="hero">
    <h1>${esc(title)}</h1>
    <p>Management MIS · ${esc(rangeLabel)}${deck.completeThrough ? ` · fully closed through ${esc(monthLabel(deck.completeThrough))}` : ''}</p>
  </div>

  ${opts.summary ? `<section><h2>Executive summary</h2><div class="summary">${summaryHtml(opts.summary)}</div></section>` : ''}

  ${latest ? `<section><h2>Headline — ${esc(monthLabel(latest.key))}</h2><div class="kpis">${kpis}</div></section>` : ''}

  <section><h2>Net revenue by month</h2>${revBars || '<p class="empty">No revenue yet.</p>'}</section>

  <section><h2>Marketing by platform — ${latest ? esc(monthLabel(latest.key)) : ''}</h2>${mktBars}</section>

  <section><h2>Revenue by channel — ${latest ? esc(monthLabel(latest.key)) : ''}</h2>${chanBars}</section>

  ${latest ? `<section><h2>P&amp;L — ${esc(monthLabel(latest.key))}</h2><table><tbody>${pnlCascade(latest)}</tbody></table></section>` : ''}

  <div class="foot">Generated from the Heatronics MIS · figures are management, not statutory.</div>
</div></body></html>`;
}
