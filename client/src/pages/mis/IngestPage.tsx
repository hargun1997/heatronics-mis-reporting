// ----------------------------------------------------------------------------
// Upload data — the ingestion workspace. Pick a connector pill, see its
// report slots, and for each run the upload → AI checks → review → save →
// ingest flow. Reports are stored durably and overwrite by connector+slot+
// period. (This replaced the earlier per-source list view.)
// ----------------------------------------------------------------------------

import { PageHeader } from '../../components/ui/PageHeader';
import { IngestWorkspace } from '../../components/ingest/IngestWorkspace';

const iconLayers = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 7l8-4 8 4-8 4-8-4zm0 5l8 4 8-4m-16 5l8 4 8-4" />
  </svg>
);

export function IngestPage() {
  return (
    <>
      <PageHeader
        title="Month-end uploads"
        accent="brand"
        icon={iconLayers}
        description="The Live MIS runs by itself; this page is only for the reports with no API (Flipkart settlement + ads, Blinkit, Snapmint, Shopflo) and to freeze a month's automatic pulls. A missing report shows up in Issues with a link here. Locking a month happens on Live MIS → Month close."
        crumbs={[
          { label: 'Reporting', to: '/reporting' },
          { label: 'MIS Reporting', to: '/reporting/mis' },
          { label: 'Upload data' },
        ]}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <IngestWorkspace />
      </div>
    </>
  );
}
