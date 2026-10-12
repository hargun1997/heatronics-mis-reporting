// ----------------------------------------------------------------------------
// Data readiness — the ingestion workspace. Pick a connector pill, see its
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
        title="Data readiness"
        accent="brand"
        icon={iconLayers}
        description="Pick a source, follow the steps to export its report, then upload — the file is checked, you review what was read, and it's saved and ingested into the MIS. Green dots are up to date; orange need a fresh report."
        crumbs={[
          { label: 'Reporting', to: '/reporting' },
          { label: 'MIS Reporting', to: '/reporting/mis' },
          { label: 'Data readiness' },
        ]}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <IngestWorkspace />
      </div>
    </>
  );
}
