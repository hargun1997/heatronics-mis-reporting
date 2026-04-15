import { NavCard, Pill } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';

const iconArch = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
  </svg>
);
const iconSop = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);
const iconLedger = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
  </svg>
);
const iconTools = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
);

export function GuideHome() {
  return (
    <>
      <PageHeader
        title="Guide & Tools"
        description="The operating manual for Heatronics accounting — architecture, SOPs, ledger references, and booking assistants."
        accent="violet"
        icon={iconSop}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Four primary areas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NavCard
            to="/guide/architecture"
            title="System Architecture"
            description="How Tranzact, Tally, the Tally Plugin, channels, and banks connect. The map of how data flows into the books."
            icon={iconArch}
            accent="brand"
          />
          <NavCard
            to="/guide/sop"
            title="Accounting SOPs"
            description="Step-by-step standard operating procedures for Sales, Purchase, Expense, Banking, Capital Goods and Job Work."
            icon={iconSop}
            accent="violet"
            badge="Start here"
          />
          <NavCard
            to="/guide/ledgers"
            title="Ledger & Voucher Tree"
            description="Full hierarchy of ledgers and the voucher types / bill series that post to each one. Real-data examples included."
            icon={iconLedger}
            accent="emerald"
          />
          <NavCard
            to="/guide/tools"
            title="Tools"
            description="Invoice booking suggester + data transformation utilities (Amazon → Tranzact, and more to come)."
            icon={iconTools}
            accent="amber"
          />
        </div>

        {/* Context strip */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">What lives where</h3>
          <p className="mt-1 text-xs text-slate-500">
            A quick reminder of which system owns which kind of transaction — most of the SOPs start by answering this question.
          </p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <SystemCard
              color="brand"
              title="Tranzact"
              points={[
                'B2B Sales (incl. Blinkit, distributors)',
                'Raw Material & Packing purchases',
                'Job Work inward / outward',
                'Stock reconciliation across stores',
              ]}
            />
            <SystemCard
              color="emerald"
              title="Tally"
              points={[
                'Books of account & financial statements',
                'Expenses, Payroll, Capital Goods',
                'Bank entries & reconciliation',
                'GST / TDS / ROC compliance',
              ]}
            />
            <SystemCard
              color="violet"
              title="Tally Plugin"
              points={[
                'Pulls invoices from Tranzact → Tally',
                'UPSERT semantics: safe re-sync',
                'Ledger & GST mapping enforced centrally',
                'Channel feeds: Amazon, Shopify, Easebuzz, Snapmint, Shiprocket',
              ]}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill color="sky">ICICI — live Tally feed · petty</Pill>
            <Pill color="sky">Central Bank — manual import · daily</Pill>
            <Pill color="sky">HDFC — manual import · escrow</Pill>
          </div>
        </div>
      </div>
    </>
  );
}

function SystemCard({
  title,
  points,
  color,
}: {
  title: string;
  points: string[];
  color: 'brand' | 'emerald' | 'violet';
}) {
  const cmap: Record<string, string> = {
    brand: 'bg-brand-50 border-brand-100 text-brand-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    violet: 'bg-violet-50 border-violet-100 text-violet-700',
  };
  return (
    <div className={`rounded-lg border p-4 ${cmap[color]}`}>
      <div className="text-sm font-semibold">{title}</div>
      <ul className="mt-2 space-y-1.5">
        {points.map((p) => (
          <li key={p} className="text-xs text-slate-700 flex items-start gap-2">
            <span className="mt-1 w-1 h-1 rounded-full bg-current opacity-60 flex-shrink-0" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
