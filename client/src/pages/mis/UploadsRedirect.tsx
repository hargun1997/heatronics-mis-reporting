// The old Month-end close / Upload data address (/reporting/mis/ingest) now lives in Setup → Uploads.
// Keeps the hash (#<connectorId> = the source to open) so old links and Issues links still land on the right slot.
import { Navigate, useLocation } from 'react-router-dom';

export function UploadsRedirect() {
  const { hash } = useLocation();
  return <Navigate to={`/reporting/mis/connectors?view=uploads${hash}`} replace />;
}
