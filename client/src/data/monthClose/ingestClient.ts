// ----------------------------------------------------------------------------
// Ingest entry point for the browser.
//
// One call per dropped file. Spreadsheets are parsed in-page by the adapters;
// images go to the server for vision extraction and come back as ledger rows
// that are marked unverified, which is what makes them gate the close.
// ----------------------------------------------------------------------------

import { ingestSpreadsheet, isImage, isSpreadsheet } from './adapters';
import type { FieldValue, LedgerNode, Provenance, SourceKind, UploadedSource } from './schema';

export interface VisionLedgerRow {
  name: string;
  depth: number;
  amount: number;
  confidence: number;
}

export interface VisionResponse {
  rows: VisionLedgerRow[];
  nettProfit: number | null;
  period: string | null;
  warnings: string[];
}

export interface IngestOutcome {
  source: UploadedSource;
  /** Present when a screenshot showed a Nett Profit / Loss we can anchor on. */
  suggestedAnchor?: FieldValue;
  /** Present when a screenshot named its own period. */
  suggestedPeriod?: string;
}

/** Figures the model was less sure of than this are called out individually. */
const SHAKY_READ = 0.9;

export async function checkVisionAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/month-close/capabilities');
    if (!res.ok) return false;
    const body = (await res.json()) as { vision?: boolean };
    return Boolean(body.vision);
  } catch {
    return false;
  }
}

export async function ingestFile(
  file: File,
  forced?: SourceKind,
): Promise<IngestOutcome> {
  const sourceId = `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (isSpreadsheet(file.name)) {
    return { source: await ingestSpreadsheet(file, sourceId, forced) };
  }

  if (isImage(file.name)) {
    return ingestScreenshot(file, sourceId, forced);
  }

  throw new Error(
    `"${file.name}" is neither a spreadsheet nor an image. Export the Tally screen as xlsx, or screenshot it.`,
  );
}

async function ingestScreenshot(
  file: File,
  sourceId: string,
  forced?: SourceKind,
): Promise<IngestOutcome> {
  const imageBase64 = await fileToBase64(file);

  const res = await fetch('/api/month-close/vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType: file.type || 'image/png' }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Could not read "${file.name}" (${res.status}).`);
  }

  const result = (await res.json()) as VisionResponse;
  const nodes = visionRowsToNodes(result.rows, sourceId, file.name);

  const shaky = result.rows.filter((r) => r.confidence < SHAKY_READ);
  const warnings = [...result.warnings];
  if (shaky.length > 0) {
    warnings.push(
      `${shaky.length} figure${shaky.length === 1 ? '' : 's'} read with low confidence — ` +
        `check ${shaky.slice(0, 3).map((r) => `"${r.name}"`).join(', ')}${shaky.length > 3 ? ' and others' : ''} against the screen.`,
    );
  }

  const source: UploadedSource = {
    id: sourceId,
    label: file.name,
    kind: forced ?? 'tallyPnl',
    method: 'vision',
    addedAt: new Date().toISOString(),
    nodes,
    warnings,
  };

  const outcome: IngestOutcome = { source };

  if (result.nettProfit !== null) {
    outcome.suggestedAnchor = {
      value: result.nettProfit,
      provenance: visionProvenance(sourceId, file.name, 1, 'Nett Profit / Loss read from the P&L screen'),
    };
  }
  if (result.period) outcome.suggestedPeriod = result.period;

  return outcome;
}

function visionProvenance(
  sourceId: string,
  label: string,
  confidence: number,
  note?: string,
): Provenance {
  return {
    sourceId,
    sourceLabel: label,
    method: 'vision',
    confidence: 'read',
    // Never born verified. This is the whole safety property of image ingest.
    verified: false,
    note: note ?? (confidence < SHAKY_READ ? `Model confidence ${(confidence * 100).toFixed(0)}%` : undefined),
  };
}

export function visionRowsToNodes(
  rows: VisionLedgerRow[],
  sourceId: string,
  label: string,
): LedgerNode[] {
  const stack: string[] = [];

  const nodes: LedgerNode[] = rows.map((row) => {
    stack.length = row.depth;
    const path = stack.filter((s): s is string => typeof s === 'string' && s.length > 0);
    stack[row.depth] = row.name;

    return {
      name: row.name,
      depth: row.depth,
      path,
      amount: row.amount,
      isLeaf: true,
      provenance: visionProvenance(sourceId, label, row.confidence),
    };
  });

  for (let i = 0; i < nodes.length; i++) {
    const next = nodes[i + 1];
    nodes[i].isLeaf = !next || next.depth <= nodes[i].depth;
  }
  return nodes;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read "${file.name}" off disk.`));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
