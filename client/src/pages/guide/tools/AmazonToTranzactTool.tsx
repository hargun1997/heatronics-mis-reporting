import { useState, useCallback } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  transformAmazonToTranzact,
  generateTranzactExcel,
  TransformResult,
  OutputRow,
} from '../../../utils/amazonToTranzact';

const icon = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9" />
  </svg>
);

export function AmazonToTranzactTool() {
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
      setResult(transformAmazonToTranzact(amazonText));
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
    <>
      <PageHeader
        title="Amazon → Tranzact"
        description="Convert the Amazon FBA Inventory Report into a Tranzact Bulk Manual Adjustment file — ready for Physical Stock Reconciliation."
        accent="amber"
        icon={icon}
      />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* How it works */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">How it works</h3>
          <div className="mt-4 space-y-4">
            <Step n={1} title="Download from Amazon Seller Central">
              <p>
                Go to{' '}
                <a className="text-brand-600 hover:text-brand-700 underline underline-offset-2" href="https://sellercentral.amazon.in/listing/reports/ref=xx_invreport_dnav_xx" target="_blank" rel="noopener noreferrer">Inventory Reports</a>
                , select <b>Inventory Report</b>, and download the <code className="bg-slate-100 px-1 rounded">.txt</code> file.
              </p>
            </Step>
            <Step n={2} title="Upload & transform here">
              <p>Upload the .txt file below — SKUs are auto-mapped to FG Items. Review the output preview and then download the Excel.</p>
            </Step>
            <Step n={3} title="Upload to Tranzact">
              <p>
                In Tranzact go to{' '}
                <a className="text-brand-600 hover:text-brand-700 underline underline-offset-2" href="https://app.letstranzact.com/v3/inventory/?section=item_master" target="_blank" rel="noopener noreferrer">Inventory → Item Master</a>
                {' '}→ Actions → <b>Physical Stock Reconciliation</b>. Pick Category "Finished Goods", Store "Amazon (Pan-India)", drop the file and submit.
              </p>
            </Step>
          </div>
        </div>

        {/* File Upload */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 max-w-md">
          <label className="block text-sm font-medium text-slate-900 mb-2">Amazon FBA Inventory Report</label>
          <input
            type="file"
            accept=".txt,.tsv"
            onChange={handleAmazonFile}
            className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 file:cursor-pointer cursor-pointer"
          />
          <p className="mt-1.5 text-[11px] text-slate-500">Tab-separated .txt file from Amazon Seller Central</p>
          {amazonFile && <p className="mt-1.5 text-[11px] text-emerald-600">Selected: {amazonFile.name}</p>}
        </div>

        {/* Transform */}
        <div>
          <button
            onClick={handleTransform}
            disabled={!amazonFile || processing}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {processing ? 'Processing…' : 'Transform'}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Summary</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryCard label="FG Items" value={result.totalFgItems} color="emerald" />
                <SummaryCard label="Units Mapped" value={result.totalUnitsMapped} color="brand" />
                <SummaryCard label="Unsellable (skipped)" value={result.totalUnsellable} color="slate" />
                <SummaryCard label="FBM Skipped" value={result.skippedFbm} color="slate" />
              </div>
              {result.unmatchedSkus.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-100">
                  <p className="text-xs font-medium text-amber-700">Unmatched Amazon SKUs ({result.unmatchedSkus.length})</p>
                  <p className="mt-1 text-xs font-mono text-amber-700/80">{result.unmatchedSkus.join(', ')}</p>
                </div>
              )}
              {result.missingFgItems.length > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-orange-50 border border-orange-100">
                  <p className="text-xs font-medium text-orange-700">FG Items missing from master ({result.missingFgItems.length})</p>
                  <p className="mt-1 text-xs font-mono text-orange-700/80">{result.missingFgItems.join(', ')}</p>
                </div>
              )}
            </div>

            {result.outputRows.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-900">Output Preview ({result.outputRows.length} rows)</h3>
                  <button onClick={handleDownload} className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition-colors">
                    Download Excel
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Item ID</th>
                        <th className="text-left px-4 py-2 font-medium">Item Name</th>
                        <th className="text-left px-4 py-2 font-medium">UOM</th>
                        <th className="text-right px-4 py-2 font-medium">Physical Stock</th>
                        <th className="text-left px-4 py-2 font-medium">Comment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.outputRows.map((row: OutputRow) => (
                        <tr key={row.itemId} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-700 font-mono">{row.itemId}</td>
                          <td className="px-4 py-2 text-slate-700">{row.itemName}</td>
                          <td className="px-4 py-2 text-slate-500">{row.uom}</td>
                          <td className="px-4 py-2 text-right text-slate-900 font-medium">{row.physicalStock}</td>
                          <td className="px-4 py-2 text-slate-500 text-[11px]">{row.comment}</td>
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
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[10px] font-bold">{n}</span>
        <span className="text-sm font-medium text-slate-900">{title}</span>
      </div>
      <div className="ml-7 text-xs text-slate-600 leading-relaxed">{children}</div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: 'emerald' | 'brand' | 'amber' | 'slate' }) {
  const m: Record<string, string> = { emerald: 'text-emerald-600', brand: 'text-brand-600', amber: 'text-amber-600', slate: 'text-slate-500' };
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
      <p className="text-[11px] text-slate-500 mb-0.5">{label}</p>
      <p className={`text-lg font-semibold ${m[color]}`}>{value}</p>
    </div>
  );
}
