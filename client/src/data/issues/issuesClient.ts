// Issues client — fetch the cross-month anomaly scan from the server.

export type IssueSeverity = 'high' | 'medium' | 'low';

export interface Issue {
  id: string;
  severity: IssueSeverity;
  category: string;
  period: string;
  title: string;
  detail: string;
}

export interface AnomalyScanResult {
  issues: Issue[];
  scannedAt: string;
  monthsCovered: string[];
}

export async function fetchIssues(): Promise<AnomalyScanResult> {
  const res = await fetch('/api/issues');
  const body = (await res.json().catch(() => ({}))) as Partial<AnomalyScanResult> & { error?: string };
  if (!res.ok) throw new Error(body.error || `Issue scan failed (${res.status}).`);
  return {
    issues: Array.isArray(body.issues) ? body.issues : [],
    scannedAt: body.scannedAt ?? new Date().toISOString(),
    monthsCovered: Array.isArray(body.monthsCovered) ? body.monthsCovered : [],
  };
}
