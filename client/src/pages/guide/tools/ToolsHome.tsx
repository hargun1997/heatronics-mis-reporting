import { NavCard } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';

const iconBooking = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const iconConvert = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

export function ToolsHome() {
  return (
    <>
      <PageHeader
        title="Tools"
        description="Interactive utilities the accounting team uses every day — from booking suggestions to data format conversions."
        accent="amber"
        icon={iconConvert}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NavCard
            to="/guide/tools/invoice-booking"
            title="Invoice Booking Suggester"
            description="Answer a few questions — Sales / Purchase, B2B / B2C, Channel, Party, HSN — and get the exact voucher type, ledger mapping, bill series and journal entry to book."
            icon={iconBooking}
            accent="brand"
            badge="New"
          />
          <NavCard
            to="/guide/tools/amazon-to-tranzact"
            title="Amazon → Tranzact"
            description="Convert the Amazon FBA Inventory Report into a Tranzact Bulk Manual Adjustment Excel file."
            icon={iconConvert}
            accent="amber"
          />
        </div>
      </div>
    </>
  );
}
