import { Pill } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';

const iconArch = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
  </svg>
);

export function SystemArchitecture() {
  return (
    <>
      <PageHeader
        title="System Architecture"
        description="How accounting data flows from sales channels and operations into Tranzact, through the Tally Plugin, and finally into Tally — the books of record."
        accent="brand"
        icon={iconArch}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <ArchitectureDiagram />
        <KeyPrinciples />
        <ChannelTable />
        <BankTable />
      </div>
    </>
  );
}

/* ─────────────────────────── Diagram ─────────────────────────── */

function ArchitectureDiagram() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 overflow-x-auto">
      <h3 className="text-sm font-semibold text-slate-900">End-to-end data flow</h3>
      <p className="text-xs text-slate-500 mt-1">
        Every sale, purchase and payment eventually lands in Tally. The path it takes depends on the channel.
      </p>

      <svg viewBox="0 0 980 620" className="w-full h-auto mt-5 min-w-[860px]" role="img" aria-label="System architecture diagram">
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#64748b" />
          </marker>
          <linearGradient id="brand" x1="0" x2="1">
            <stop offset="0%" stopColor="#eef2ff" />
            <stop offset="100%" stopColor="#e0e7ff" />
          </linearGradient>
          <linearGradient id="emerald" x1="0" x2="1">
            <stop offset="0%" stopColor="#ecfdf5" />
            <stop offset="100%" stopColor="#d1fae5" />
          </linearGradient>
          <linearGradient id="violet" x1="0" x2="1">
            <stop offset="0%" stopColor="#f5f3ff" />
            <stop offset="100%" stopColor="#ede9fe" />
          </linearGradient>
          <linearGradient id="amber" x1="0" x2="1">
            <stop offset="0%" stopColor="#fffbeb" />
            <stop offset="100%" stopColor="#fef3c7" />
          </linearGradient>
          <linearGradient id="sky" x1="0" x2="1">
            <stop offset="0%" stopColor="#f0f9ff" />
            <stop offset="100%" stopColor="#e0f2fe" />
          </linearGradient>
        </defs>

        {/* Columns labels */}
        <text x="90" y="28" fontSize="11" fill="#64748b" fontWeight="600">CHANNELS</text>
        <text x="380" y="28" fontSize="11" fill="#64748b" fontWeight="600">OPERATIONS LAYER</text>
        <text x="640" y="28" fontSize="11" fill="#64748b" fontWeight="600">INTEGRATION</text>
        <text x="850" y="28" fontSize="11" fill="#64748b" fontWeight="600">BOOKS</text>

        {/* ——— Channel nodes ——— */}
        <ChannelNode x={20} y={50}  w={220} h={60} title="Amazon" sub="MTR · STR · Settlement · B2B + B2C" fill="url(#amber)" stroke="#fcd34d" />
        <ChannelNode x={20} y={125} w={220} h={60} title="Shopify (D2C)" sub="Prepaid + COD orders" fill="url(#amber)" stroke="#fcd34d" />
        <ChannelNode x={20} y={200} w={220} h={60} title="Easebuzz" sub="Prepaid · card / UPI capture" fill="url(#sky)" stroke="#7dd3fc" />
        <ChannelNode x={20} y={275} w={220} h={60} title="Snapmint" sub="Prepaid · EMI / BNPL" fill="url(#sky)" stroke="#7dd3fc" />
        <ChannelNode x={20} y={350} w={220} h={60} title="Shiprocket" sub="COD collection for Shopify" fill="url(#sky)" stroke="#7dd3fc" />
        <ChannelNode x={20} y={425} w={220} h={60} title="Blinkit (B2B)" sub="Quick-commerce B2B orders" fill="url(#emerald)" stroke="#6ee7b7" />
        <ChannelNode x={20} y={500} w={220} h={60} title="RM / Job Work / B2B" sub="Direct B2B purchases & sales" fill="url(#emerald)" stroke="#6ee7b7" />

        {/* ——— Operations layer (Tranzact) ——— */}
        <BigNode x={300} y={180} w={240} h={160} title="Tranzact" sub="Operations & Inventory · B2B Sales, RM, Job Work" fill="url(#brand)" stroke="#a5b4fc" />
        {/* Expenses direct-to-Tally bypasses Tranzact */}
        <BigNode x={300} y={420} w={240} h={70} title="Expenses (direct)" sub="Rent · Utilities · Ads · Services" fill="url(#violet)" stroke="#c4b5fd" />

        {/* ——— Integration (Tally Plugin) ——— */}
        <BigNode x={600} y={230} w={200} h={100} title="Tally Plugin" sub="UPSERT · Ledger + GST mapping" fill="url(#violet)" stroke="#c4b5fd" />
        <BigNode x={600} y={430} w={200} h={60} title="Bank Statement Import" sub="Manual · Central + HDFC" fill="url(#sky)" stroke="#7dd3fc" />

        {/* ——— Tally ——— */}
        <BigNode x={840} y={240} w={120} h={200} title="Tally" sub="Books of Account" fill="url(#emerald)" stroke="#6ee7b7" />

        {/* ——— Arrows ——— */}
        {/* Channels → Tranzact */}
        <ArrowLine d="M240 80  C 270 80, 270 220, 300 220" />
        <ArrowLine d="M240 155 C 275 155, 275 240, 300 240" />
        <ArrowLine d="M240 230 C 280 230, 280 260, 300 260" />
        <ArrowLine d="M240 305 C 280 305, 280 280, 300 280" />
        <ArrowLine d="M240 380 C 280 380, 280 300, 300 300" />
        <ArrowLine d="M240 455 C 280 455, 280 320, 300 320" />
        <ArrowLine d="M240 530 C 280 530, 280 340, 300 340" />

        {/* Tranzact → Plugin */}
        <ArrowLine d="M540 260 L 600 265" />
        <ArrowLine d="M540 290 L 600 290" />

        {/* Plugin → Tally */}
        <ArrowLine d="M800 260 L 840 275" />
        <ArrowLine d="M800 290 L 840 310" />

        {/* Expenses → Tally (direct) */}
        <ArrowLine d="M540 455 C 620 455, 720 400, 840 400" />

        {/* Banks → Tally (ICICI direct; Central/HDFC via import) */}
        <ArrowLine d="M800 450 L 840 420" />
        <g>
          <rect x="600" y="500" width="200" height="60" rx="8" fill="url(#sky)" stroke="#7dd3fc" />
          <text x="700" y="525" textAnchor="middle" fontSize="13" fontWeight="600" fill="#0f172a">ICICI Bank</text>
          <text x="700" y="545" textAnchor="middle" fontSize="11" fill="#475569">Live Tally integration · petty</text>
        </g>
        <ArrowLine d="M800 520 C 830 520, 830 430, 840 430" />

        {/* Labels on edges */}
        <EdgeLabel x={270} y={210} text="B2B + B2C sync" />
        <EdgeLabel x={570} y={250} text="UPSERT" />
        <EdgeLabel x={820} y={270} text="Ledger + GST" />
        <EdgeLabel x={670} y={395} text="Expenses go direct to Tally" />
        <EdgeLabel x={830} y={445} text="Manual import" />
        <EdgeLabel x={830} y={507} text="Bank feed" />
      </svg>

      <div className="mt-5 flex flex-wrap gap-2">
        <Pill color="amber">Amazon</Pill>
        <Pill color="sky">Shopify · Easebuzz · Snapmint · Shiprocket</Pill>
        <Pill color="emerald">Blinkit · B2B / RM / Job Work</Pill>
        <Pill color="brand">Tranzact</Pill>
        <Pill color="violet">Tally Plugin · UPSERT</Pill>
        <Pill color="emerald">Tally (Books)</Pill>
      </div>
    </div>
  );
}

/* ─────────────────────── SVG helpers ─────────────────────── */
interface NodeProps {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  fill: string;
  stroke: string;
}
function ChannelNode({ x, y, w, h, title, sub, fill, stroke }: NodeProps) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke={stroke} />
      <text x={x + 12} y={y + 24} fontSize="13" fontWeight="600" fill="#0f172a">{title}</text>
      <text x={x + 12} y={y + 44} fontSize="11" fill="#475569">{sub}</text>
    </g>
  );
}
function BigNode({ x, y, w, h, title, sub, fill, stroke }: NodeProps) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={fill} stroke={stroke} strokeWidth="1.5" />
      <text x={x + w / 2} y={y + 28} textAnchor="middle" fontSize="15" fontWeight="700" fill="#0f172a">{title}</text>
      <text x={x + w / 2} y={y + 52} textAnchor="middle" fontSize="11" fill="#475569">{sub}</text>
    </g>
  );
}
function ArrowLine({ d }: { d: string }) {
  return <path d={d} stroke="#64748b" strokeWidth="1.3" fill="none" markerEnd="url(#arr)" />;
}
function EdgeLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text x={x} y={y} fontSize="10" fill="#64748b" fontStyle="italic">
      {text}
    </text>
  );
}

/* ─────────────────────── Supporting sections ─────────────────────── */
function KeyPrinciples() {
  const principles = [
    {
      title: 'UPSERT, not duplicate',
      body:
        'The Tally Plugin uses UPSERT semantics — re-syncing the same invoice updates rather than duplicates it. This lets us re-run imports safely after master-data fixes.',
    },
    {
      title: 'Series → Voucher → Ledger',
      body:
        'Each bill series in Tranzact / Tally is mapped to a specific voucher type, which in turn is mapped to a specific set of sales/purchase ledgers and GST ledgers. Mappings live centrally.',
    },
    {
      title: 'Expenses bypass Tranzact',
      body:
        'Operating expenses (rent, utilities, ads, freight, services) are booked directly in Tally — Tranzact is used only for inventory-linked transactions.',
    },
    {
      title: 'Bank integration varies',
      body:
        'ICICI is a live bank feed into Tally and is used for petty payments. Central Bank (daily) and HDFC (escrow) require manual Excel statement import into Tally.',
    },
    {
      title: 'Clearing for marketplaces',
      body:
        'Sales on Amazon, Shopify, Easebuzz, Snapmint and Shiprocket are parked in clearing ledgers until the actual settlement. Settlement journals net commissions, fees, TCS/TDS and remit the balance to HDFC / Central.',
    },
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-900">Key principles</h3>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        {principles.map((p) => (
          <div key={p.title} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-900">{p.title}</div>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">{p.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChannelTable() {
  const rows = [
    { channel: 'Amazon', flow: 'MTR / STR / Settlement', modes: 'B2B + B2C', system: 'Tranzact → Plugin → Tally', clearing: 'Amazon Unsettled Receivable', bank: 'HDFC Escrow' },
    { channel: 'Shopify', flow: 'Order → Payment capture → Ship', modes: 'B2C', system: 'Tranzact → Plugin → Tally', clearing: 'Easebuzz / Snapmint / Shiprocket COD', bank: 'Central Bank' },
    { channel: 'Easebuzz', flow: 'Prepaid capture', modes: 'B2C', system: 'Shopify + Tranzact', clearing: 'Easebuzz Clearing', bank: 'Central Bank' },
    { channel: 'Snapmint', flow: 'Prepaid EMI / BNPL', modes: 'B2C', system: 'Shopify + Tranzact', clearing: 'Snapmint Clearing', bank: 'Central Bank' },
    { channel: 'Shiprocket', flow: 'COD collection', modes: 'B2C', system: 'Shopify + Tranzact', clearing: 'Shiprocket COD Remittance', bank: 'Central Bank' },
    { channel: 'Blinkit', flow: 'B2B orders', modes: 'B2B', system: 'Tranzact → Plugin → Tally', clearing: 'Blinkit Receivable', bank: 'Central Bank' },
    { channel: 'B2B Distributor', flow: 'Direct B2B sales', modes: 'B2B', system: 'Tranzact → Plugin → Tally', clearing: 'Sundry Debtors', bank: 'Central Bank' },
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">Channel matrix</h3>
        <p className="text-xs text-slate-500 mt-1">For each channel — where it books, what clearing ledger it uses, and where the final cash settles.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Channel</th>
              <th className="text-left px-4 py-2 font-medium">Flow</th>
              <th className="text-left px-4 py-2 font-medium">Modes</th>
              <th className="text-left px-4 py-2 font-medium">System path</th>
              <th className="text-left px-4 py-2 font-medium">Clearing ledger</th>
              <th className="text-left px-4 py-2 font-medium">Settles into</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.channel} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium text-slate-900">{r.channel}</td>
                <td className="px-4 py-2 text-slate-600">{r.flow}</td>
                <td className="px-4 py-2 text-slate-600">{r.modes}</td>
                <td className="px-4 py-2 text-slate-600">{r.system}</td>
                <td className="px-4 py-2 text-slate-600">{r.clearing}</td>
                <td className="px-4 py-2 text-slate-600">{r.bank}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BankTable() {
  const rows = [
    { bank: 'ICICI Bank', use: 'Petty / day-to-day payments', integration: 'Live Tally bank feed', reconciliation: 'Auto via Tally' },
    { bank: 'Central Bank of India', use: 'Daily transactions — channel payouts, B2B receipts', integration: 'Manual statement import (Excel)', reconciliation: 'Monthly BRS in Tally' },
    { bank: 'HDFC Bank', use: 'Escrow for marketplace settlements (Amazon, Shopify)', integration: 'Manual statement import (Excel)', reconciliation: 'Monthly BRS in Tally' },
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">Bank accounts</h3>
        <p className="text-xs text-slate-500 mt-1">Only one bank has a live Tally feed — the rest need manual imports each month.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Bank</th>
              <th className="text-left px-4 py-2 font-medium">Use</th>
              <th className="text-left px-4 py-2 font-medium">Tally integration</th>
              <th className="text-left px-4 py-2 font-medium">Reconciliation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.bank} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium text-slate-900">{r.bank}</td>
                <td className="px-4 py-2 text-slate-600">{r.use}</td>
                <td className="px-4 py-2 text-slate-600">{r.integration}</td>
                <td className="px-4 py-2 text-slate-600">{r.reconciliation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
