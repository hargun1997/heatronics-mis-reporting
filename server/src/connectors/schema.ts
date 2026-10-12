// ----------------------------------------------------------------------------
// Connector output schema — a server-side mirror of the client's month-close
// canonical shapes (client/src/data/monthClose/schema.ts).
//
// A connector's job is to turn a live source into exactly what a dropped file
// would have produced: an UploadedSource carrying LedgerNode[] / SkuRow[] /
// CrossCheck[] / BomCost[]. The browser then feeds it into the same cascade,
// so computeClose / emitClose never learn a figure came from an API instead of
// a spreadsheet. These interfaces must stay structurally identical to the
// client's; the `method: 'connector'` is the only new provenance value.
// ----------------------------------------------------------------------------

export type IngestMethod = 'xlsx' | 'vision' | 'manual' | 'derived' | 'connector';
export type Confidence = 'exact' | 'read' | 'estimated';

export interface Provenance {
  sourceId: string;
  sourceLabel: string;
  method: IngestMethod;
  confidence: Confidence;
  verified: boolean;
  note?: string;
}

export interface LedgerNode {
  name: string;
  depth: number;
  path: string[];
  amount: number;
  group?: string;
  isLeaf: boolean;
  provenance: Provenance;
}

// Mirrors the client's SkuPlatform union.
export type SkuPlatform = 'amazon' | 'shopify' | 'blinkit' | 'shiprocket' | 'offline' | 'oem';

export interface SkuRow {
  platform: SkuPlatform;
  key: string;
  keyKind?: 'sku' | 'title';
  name?: string;
  revenue: number;
  units: number;
  fees: number;
  provenance: Provenance;
}

export interface CrossCheck {
  label: string;
  amount: number;
  against?: string;
  note?: string;
}

export interface BomCost {
  fgId: string;
  bomNumber: string;
  bomName: string;
  costPerUnit: number;
  provenance: Provenance;
}

// Mirrors the client's SourceKind union.
export type SourceKind =
  | 'tallyPnl'
  | 'tallyGroupSummary'
  | 'channelRevenue'
  | 'adSpend'
  | 'skuPnl'
  | 'amazonSettlement'
  | 'amazonSales'
  | 'shopifySales'
  | 'blinkitSettlement'
  | 'shiprocketFreight'
  | 'tranzactBom';

/**
 * What a connector hands back for one source. The client assigns `id` and
 * `addedAt` when it adopts it into a session, so they are omitted here.
 */
export interface ConnectorSource {
  label: string;
  kind: SourceKind;
  method: 'connector';
  nodes: LedgerNode[];
  skuRows: SkuRow[];
  bomCosts: BomCost[];
  crossChecks: CrossCheck[];
  warnings: string[];
}

export function connectorProvenance(
  sourceId: string,
  sourceLabel: string,
  confidence: Confidence = 'exact',
  note?: string,
): Provenance {
  return {
    sourceId,
    sourceLabel,
    method: 'connector',
    confidence,
    // API figures are machine-read, so born verified — same as an xlsx cell.
    verified: confidence === 'exact',
    note,
  };
}
