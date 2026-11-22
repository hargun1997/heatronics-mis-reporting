import { useState, useCallback } from 'react';
import { PageBody, PageHeader } from '../../../components/ui/PageHeader';
import { ErrorBox, Panel, StepNo } from '../../../components/ui/states';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
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

  const handleDownload = useCallback(async () => {
    if (!result) return;
    const blob = await generateTranzactExcel(result.outputRows);
    const today = new Date().toISOString().split('T')[0];
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tranzact_StockReconciliation_${today}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  return (
    <>
      <PageHeader
        title="Amazon to Tranzact (manual)"
        description="Change the Amazon FBA Inventory Ledger into a Tranzact stock upload file."
        accent="amber"
        icon={icon}
      />
      <PageBody>
        {/* How it works */}
        <Panel title="How to do it">
          <ol className="space-y-5">
            <Step n={1} title="Download the Inventory Ledger from Amazon">
              <p>Open <a className="font-medium text-accent-700 underline underline-offset-2" href="https://sellercentral.amazon.in/reportcentral/LEDGER_REPORT/1" target="_blank" rel="noopener noreferrer">Reports, Fulfilment, Inventory Ledger</a>. Select the <b>Download</b> tab.</p>
              <p>Set these 4 fields:</p>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>Type of report: <b>Summary view</b>.</li>
                <li>Aggregate by location: <b>Country</b>.</li>
                <li>Aggregate by time period: <b>Monthly</b>.</li>
                <li>Date range: the month to check. Keep ASIN, FNSKU and MSKU empty to get all products.</li>
              </ul>
              <p>Select <b>Request .txt Download</b>. Do not use .csv: a .csv file removes the first zeros of MSKUs and ASINs, and then the SKUs do not match.</p>
              <p>When the report shows a <b>Download</b> button, download the <code className="rounded bg-slate-100 px-1">.txt</code> file.</p>
              <p className="text-slate-600">The older <b>Manage Inventory</b> report also works. The tool finds which report it is. Both use the <b>SELLABLE</b> closing quantity.</p>
            </Step>
            <Step n={2} title="Make the file here">
              <p>Upload the .txt file below. The tool matches each SKU to its FG item. Check the preview, then download the Excel file.</p>
            </Step>
            <Step n={3} title="Upload the file to Tranzact">
              <p>In Tranzact, open <a className="font-medium text-accent-700 underline underline-offset-2" href="https://app.letstranzact.com/v3/inventory/?section=item_master" target="_blank" rel="noopener noreferrer">Inventory, Item Master</a>. Then open Actions, <b>Physical Stock Reconciliation</b>.</p>
              <p>Do not use the <b>Download Template</b> part at the top. The file from this tool has the same columns.</p>
              <p>Set these 4 fields:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li><b>Store</b>: <b>Amazon (Pan-India)</b>. <span className="font-medium text-red-700">The default is Raw Material Store. Change it, or the Amazon stock goes into the factory store.</span></li>
                <li><b>As on Date</b>: the last day of the month (for example 31/07/2026 for the July ledger). Do not use the date of today.</li>
                <li><b>Final Stock Valuation</b>: <b>Use system price</b>. Tranzact then uses the prices in its item master. Use &quot;Use uploaded price&quot; only for the prices in this file. These prices come from the FG list in this tool and can be old.</li>
                <li><b>Allow Final Stock at 0 Price</b>: <b>No</b>. Tranzact then stops on an item with no price. It does not book that stock at ₹0, which makes the closing stock too low. Select Yes only after you find why an item has no price.</li>
              </ul>
              <p>Put the file in <b>Update Stock Details</b> and submit it. The file has all the SELLABLE stock of the Amazon store. An item in that store that is not in the file has zero stock.</p>
            </Step>
          </ol>
        </Panel>

        {/* File Upload */}
        <Panel title="Amazon FBA Inventory Report" className="max-w-md">
          <input
            type="file"
            aria-label="Amazon FBA Inventory Report"
            accept=".txt,.tsv"
            onChange={handleAmazonFile}
            className="block w-full cursor-pointer text-sm text-slate-600 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border file:border-slate-200 file:bg-white file:px-3 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-50"
          />
          <p className="mt-1.5 text-xs text-slate-600">The .txt file from Amazon Seller Central (tab-separated).</p>
          {amazonFile && <p className="mt-1.5 text-xs text-slate-700">✓ {amazonFile.name}</p>}
          <Button className="mt-3" variant={result ? 'secondary' : 'primary'} onClick={handleTransform} disabled={!amazonFile || processing} busy={processing} busyLabel="Making the file">
            Make the file
          </Button>
        </Panel>

        {error && <ErrorBox>{error}</ErrorBox>}

        {result && (
          <div className="space-y-4">
            <Panel title="Summary" action={result.period ? <span className="text-xs text-slate-600">Inventory Ledger, {result.period}</span> : undefined}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryCard label="FG items" value={result.totalFgItems} />
                <SummaryCard label="Units matched" value={result.totalUnitsMapped} />
                <SummaryCard label="Unsellable (not counted)" value={result.totalUnsellable} />
                <SummaryCard label="FBM (not counted)" value={result.skippedFbm} />
              </div>
              {result.unmatchedSkus.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-800">! Amazon SKUs with no FG item ({result.unmatchedSkus.length})</p>
                  <p className="mt-1 font-mono text-xs text-amber-800">{result.unmatchedSkus.join(', ')}</p>
                </div>
              )}
              {result.missingFgItems.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-800">! FG items not in the master list ({result.missingFgItems.length})</p>
                  <p className="mt-1 font-mono text-xs text-amber-800">{result.missingFgItems.join(', ')}</p>
                </div>
              )}
            </Panel>

            {result.outputRows.length > 0 && (
              <Panel title="File preview" count={result.outputRows.length} action={<Button size="sm" onClick={() => void handleDownload()}>Download Excel</Button>}>
                <DataTable label="File preview" rows={result.outputRows} rowKey={(r: OutputRow) => r.itemId} columns={[
                  { key: 'itemId', label: 'Item ID', cell: (r: OutputRow) => <span className="font-mono">{r.itemId}</span> },
                  { key: 'itemName', label: 'Item name', main: true, cell: (r: OutputRow) => r.itemName },
                  { key: 'uom', label: 'UOM', quiet: true, cell: (r: OutputRow) => r.uom },
                  { key: 'physicalStock', label: 'Physical stock', num: true, emph: true, cell: (r: OutputRow) => r.physicalStock },
                  { key: 'comment', label: 'Comment', quiet: true, cell: (r: OutputRow) => r.comment },
                ]} />
              </Panel>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <StepNo n={n} />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <div className="mt-1 space-y-1.5 text-sm text-slate-700">{children}</div>
      </div>
    </li>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-600">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
