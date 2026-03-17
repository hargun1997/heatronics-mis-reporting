import React, { useState, useCallback } from 'react';
import {
  transformAmazonToTranzact,
  generateTranzactExcel,
  TransformResult,
  OutputRow,
} from '../utils/amazonToTranzact';

type ToolId = 'amazon-to-tranzact';

interface ToolOption {
  id: ToolId;
  name: string;
  description: string;
}

const tools: ToolOption[] = [
  {
    id: 'amazon-to-tranzact',
    name: 'Amazon Inventory → Tranzact',
    description:
      'Convert Amazon FBA Inventory Report into a Tranzact Bulk Manual Adjustment Excel file.',
  },
];

export function Tools() {
  const [selectedTool, setSelectedTool] = useState<ToolId>('amazon-to-tranzact');

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Tools</h1>
        <p className="mt-1 text-slate-400 text-sm">
          Select a tool to transform and process your data
        </p>
      </div>

      {/* Tool Selector Dropdown */}
      <div className="mb-6">
        <label htmlFor="tool-select" className="block text-sm font-medium text-slate-300 mb-2">
          Select Tool
        </label>
        <select
          id="tool-select"
          value={selectedTool}
          onChange={(e) => setSelectedTool(e.target.value as ToolId)}
          className="w-full sm:w-80 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
        >
          {tools.map((tool) => (
            <option key={tool.id} value={tool.id}>
              {tool.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-slate-500">
          {tools.find((t) => t.id === selectedTool)?.description}
        </p>
      </div>

      {/* Tool Content */}
      {selectedTool === 'amazon-to-tranzact' && <AmazonToTranzactTool />}
    </div>
  );
}

// ─── Amazon to Tranzact Tool Component ───────────────────────────────────────

function AmazonToTranzactTool() {
  const [amazonFile, setAmazonFile] = useState<File | null>(null);
  const [result, setResult] = useState<TransformResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleAmazonFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAmazonFile(e.target.files?.[0] || null);
    setResult(null);
    setError(null);
  }, []);

  const handleTransform = useCallback(async () => {
    if (!amazonFile) return;

    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const amazonText = await amazonFile.text();
      const transformResult = transformAmazonToTranzact(amazonText);
      setResult(transformResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setProcessing(false);
    }
  }, [amazonFile]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const blob = generateTranzactExcel(result.outputRows);
    const today = new Date().toISOString().split('T')[0];
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tranzact_Adjustment_${today}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  return (
    <div className="space-y-6">
      {/* How it works */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
        <h3 className="text-sm font-medium text-slate-200 mb-3">How it works</h3>
        <div className="space-y-4">
          {/* Step 1: Download from Amazon */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">1</span>
              <span className="text-xs font-medium text-slate-200">Download from Amazon Seller Central</span>
            </div>
            <div className="ml-7 space-y-1 text-xs text-slate-400">
              <p>Go to{' '}
                <a href="https://sellercentral.amazon.in/listing/reports/ref=xx_invreport_dnav_xx" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline underline-offset-2">
                  Inventory Reports
                </a>
              </p>
              <p>Select <span className="text-slate-300 font-medium">"Inventory Report"</span> from the dropdown and click Request Report</p>
              <p>Once generated, download the <span className="text-slate-300 font-medium">.txt</span> file</p>
            </div>
          </div>

          {/* Step 2: Upload & Transform */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">2</span>
              <span className="text-xs font-medium text-slate-200">Upload & Transform here</span>
            </div>
            <div className="ml-7 space-y-1 text-xs text-slate-400">
              <p>Upload the .txt file below — SKUs are auto-mapped to FG Items</p>
              <p>Review the output preview, then click <span className="text-slate-300 font-medium">Download Excel</span></p>
            </div>
          </div>

          {/* Step 3: Upload to Tranzact */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">3</span>
              <span className="text-xs font-medium text-slate-200">Upload to Tranzact</span>
            </div>
            <div className="ml-7 space-y-1 text-xs text-slate-400">
              <p>Go to{' '}
                <a href="https://app.letstranzact.com/v3/inventory/?section=item_master" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline underline-offset-2">
                  Inventory → Item Master
                </a>
                {' '}→ Actions → <span className="text-slate-300 font-medium">Physical Stock Reconciliation</span>
              </p>
              <p>Select Item Category: <span className="text-slate-300 font-medium">Finished Goods</span>, Store: <span className="text-slate-300 font-medium">Amazon (Pan-India)</span></p>
              <p>Drag & drop the downloaded Excel file and click <span className="text-slate-300 font-medium">Submit</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* File Upload */}
      <div className="max-w-md">
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Amazon FBA Inventory Report
          </label>
          <input
            type="file"
            accept=".txt,.tsv"
            onChange={handleAmazonFile}
            className="block w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600 file:cursor-pointer cursor-pointer"
          />
          <p className="mt-1.5 text-[11px] text-slate-500">Tab-separated .txt file from Amazon Seller Central</p>
          {amazonFile && (
            <p className="mt-1.5 text-[11px] text-emerald-400">
              Selected: {amazonFile.name}
            </p>
          )}
        </div>
      </div>

      {/* Transform Button */}
      <div>
        <button
          onClick={handleTransform}
          disabled={!amazonFile || processing}
          className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {processing ? 'Processing...' : 'Transform'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
            <h3 className="text-sm font-medium text-slate-200 mb-3">Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard label="FG Items" value={result.totalFgItems} color="emerald" />
              <SummaryCard label="Units Mapped" value={result.totalUnitsMapped} color="blue" />
              <SummaryCard label="Unsellable (skipped)" value={result.totalUnsellable} color="slate" />
              <SummaryCard label="FBM Skipped" value={result.skippedFbm} color="slate" />
            </div>

            {result.unmatchedSkus.length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-xs font-medium text-yellow-400 mb-1">
                  Unmatched Amazon SKUs ({result.unmatchedSkus.length})
                </p>
                <p className="text-xs text-yellow-400/70 font-mono">
                  {result.unmatchedSkus.join(', ')}
                </p>
              </div>
            )}

            {result.missingFgItems.length > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <p className="text-xs font-medium text-orange-400 mb-1">
                  FG Items in mapping but missing from master ({result.missingFgItems.length})
                </p>
                <p className="text-xs text-orange-400/70 font-mono">
                  {result.missingFgItems.join(', ')}
                </p>
              </div>
            )}
          </div>

          {/* Preview Table */}
          {result.outputRows.length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
                <h3 className="text-sm font-medium text-slate-200">
                  Output Preview ({result.outputRows.length} rows)
                </h3>
                <button
                  onClick={handleDownload}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  Download Excel
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      <th className="text-left px-4 py-2 font-medium">Item ID</th>
                      <th className="text-left px-4 py-2 font-medium">Item Name</th>
                      <th className="text-left px-4 py-2 font-medium">UOM</th>
                      <th className="text-right px-4 py-2 font-medium">Physical Stock</th>
                      <th className="text-left px-4 py-2 font-medium">Comment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.outputRows.map((row: OutputRow) => (
                      <tr key={row.itemId} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="px-4 py-2 text-slate-300 font-mono">{row.itemId}</td>
                        <td className="px-4 py-2 text-slate-300">{row.itemName}</td>
                        <td className="px-4 py-2 text-slate-400">{row.uom}</td>
                        <td className="px-4 py-2 text-right text-slate-100 font-medium">{row.physicalStock}</td>
                        <td className="px-4 py-2 text-slate-400 text-[11px]">{row.comment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared UI Components ────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'emerald' | 'blue' | 'amber' | 'slate';
}) {
  const colorMap = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    slate: 'text-slate-400',
  };

  return (
    <div className="rounded-lg bg-slate-700/40 p-3">
      <p className="text-[11px] text-slate-500 mb-0.5">{label}</p>
      <p className={`text-lg font-semibold ${colorMap[color]}`}>{value}</p>
    </div>
  );
}
