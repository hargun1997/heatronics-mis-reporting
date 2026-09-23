// ----------------------------------------------------------------------------
// Adapter registry.
//
// Sits above adapters.ts and platformAdapters.ts so the two can share helpers
// without importing each other. Everything that picks an adapter or turns a
// file into an UploadedSource lives here.
// ----------------------------------------------------------------------------

import * as XLSX from 'xlsx';
import { BASE_ADAPTERS, type SourceAdapter } from './adapters';
import { PLATFORM_ADAPTERS } from './platformAdapters';
import type { SourceKind, UploadedSource } from './schema';

/** Platform adapters first: they are more specific than the generic tables. */
export const ADAPTERS: SourceAdapter[] = [...PLATFORM_ADAPTERS, ...BASE_ADAPTERS];

export interface ClaimResult {
  adapter: SourceAdapter;
  confidence: number;
}

/** Pick the adapter that best fits a workbook, or null when none is plausible. */
export function claimAdapter(
  wb: XLSX.WorkBook,
  fileName: string,
  forced?: SourceKind,
): ClaimResult | null {
  if (forced) {
    const a = ADAPTERS.find((x) => x.kind === forced);
    if (a) return { adapter: a, confidence: 1 };
  }
  const scored = ADAPTERS.map((adapter) => ({ adapter, confidence: adapter.sniff(wb, fileName) })).sort(
    (a, b) => b.confidence - a.confidence,
  );
  return scored[0] && scored[0].confidence >= 0.2 ? scored[0] : null;
}

/** Read a spreadsheet file into an UploadedSource, or throw with a readable reason. */
export async function ingestSpreadsheet(
  file: File,
  sourceId: string,
  forced?: SourceKind,
): Promise<UploadedSource> {
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: 'array' });

  const claim = claimAdapter(workbook, file.name, forced);
  if (!claim) {
    throw new Error(`Could not tell what "${file.name}" is. Pick the source type by hand and re-add it.`);
  }

  const { nodes, skuRows, bomCosts, crossChecks, warnings } = claim.adapter.parse({ file, sourceId, workbook });

  return {
    id: sourceId,
    label: file.name,
    kind: claim.adapter.kind,
    method: 'xlsx',
    addedAt: new Date().toISOString(),
    nodes,
    skuRows: skuRows ?? [],
    bomCosts: bomCosts ?? [],
    crossChecks: crossChecks ?? [],
    warnings:
      claim.confidence < 0.5
        ? [`Source type guessed as "${claim.adapter.label}" — confirm it is right.`, ...warnings]
        : warnings,
  };
}
