import React, { useState, useRef } from 'react';
import { MISRecord, MISPeriod, periodToString, periodToKey } from '../../types/misTracking';
import { formatCurrency, formatPercent } from '../../utils/misCalculator';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface MISExportModalProps {
  allMISRecords: MISRecord[];
  onClose: () => void;
}

// Financial Year months order
const FY_MONTHS = [
  { month: 4, label: 'Apr' },
  { month: 5, label: 'May' },
  { month: 6, label: 'Jun' },
  { month: 7, label: 'Jul' },
  { month: 8, label: 'Aug' },
  { month: 9, label: 'Sep' },
  { month: 10, label: 'Oct' },
  { month: 11, label: 'Nov' },
  { month: 12, label: 'Dec' },
  { month: 1, label: 'Jan' },
  { month: 2, label: 'Feb' },
  { month: 3, label: 'Mar' }
];

// Get available FYs
function getAvailableFYs(records: MISRecord[]): string[] {
  const fys = new Set<string>();
  for (const record of records) {
    const { month, year } = record.period;
    const fyStartYear = month >= 4 ? year : year - 1;
    fys.add(`FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`);
  }
  return Array.from(fys).sort().reverse();
}

function parseFYLabel(fyLabel: string): number {
  const match = fyLabel.match(/FY (\d{4})-/);
  return match ? parseInt(match[1]) : new Date().getFullYear();
}

function getYearForMonth(fyStartYear: number, month: number): number {
  return month >= 4 ? fyStartYear : fyStartYear + 1;
}

export function MISExportModal({ allMISRecords, onClose }: MISExportModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>('');

  // Export options
  const [includeTrends, setIncludeTrends] = useState(true);
  const [includeFYSummary, setIncludeFYSummary] = useState(true);
  const [includeIndividualMonths, setIncludeIndividualMonths] = useState(false);

  // FY selection (multi-select)
  const availableFYs = getAvailableFYs(allMISRecords);
  const [selectedFYs, setSelectedFYs] = useState<string[]>(availableFYs.length > 0 ? [availableFYs[0]] : []);

  // Individual months selection
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);

  // Content refs for rendering
  const trendsRef = useRef<HTMLDivElement>(null);
  const fyRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // FY toggle functions
  const toggleFY = (fy: string) => {
    setSelectedFYs(prev =>
      prev.includes(fy)
        ? prev.filter(f => f !== fy)
        : [...prev, fy]
    );
  };

  const selectAllFYs = () => {
    setSelectedFYs([...availableFYs]);
  };

  const clearAllFYs = () => {
    setSelectedFYs([]);
  };

  // Helper to get FY data
  const getFYData = (fyLabel: string) => {
    const fyStartYear = parseFYLabel(fyLabel);
    const fyMonths = FY_MONTHS.map(({ month, label }) => {
      const year = getYearForMonth(fyStartYear, month);
      const periodKey = `${year}-${String(month).padStart(2, '0')}`;
      const record = allMISRecords.find(r => r.periodKey === periodKey);
      return { month, year, label, periodKey, record };
    });

    const fyTotals = fyMonths.filter(m => m.record).reduce(
      (acc, m) => {
        if (!m.record) return acc;
        return {
          netRevenue: acc.netRevenue + m.record.revenue.netRevenue,
          grossMargin: acc.grossMargin + m.record.grossMargin,
          cm1: acc.cm1 + m.record.cm1,
          cm2: acc.cm2 + m.record.cm2,
          cm3: acc.cm3 + m.record.cm3,
          ebitda: acc.ebitda + m.record.ebitda,
          netIncome: acc.netIncome + m.record.netIncome
        };
      },
      { netRevenue: 0, grossMargin: 0, cm1: 0, cm2: 0, cm3: 0, ebitda: 0, netIncome: 0 }
    );

    return { fyStartYear, fyMonths, fyTotals };
  };

  // Get all available months for individual selection
  const allMonths = allMISRecords
    .sort((a, b) => {
      if (a.period.year !== b.period.year) return b.period.year - a.period.year;
      return b.period.month - a.period.month;
    })
    .map(r => ({ periodKey: r.periodKey, label: periodToString(r.period), record: r }));

  const toggleMonth = (periodKey: string) => {
    setSelectedMonths(prev =>
      prev.includes(periodKey)
        ? prev.filter(k => k !== periodKey)
        : [...prev, periodKey]
    );
  };

  const selectAllMonths = () => {
    setSelectedMonths(allMonths.map(m => m.periodKey));
  };

  const clearAllMonths = () => {
    setSelectedMonths([]);
  };

  // Export PDF
  const handleExport = async () => {
    if (!includeTrends && !includeFYSummary && !includeIndividualMonths) {
      alert('Please select at least one section to export');
      return;
    }

    setIsExporting(true);
    setExportProgress('Preparing export...');

    try {
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      let isFirstPage = true;

      // Helper to add page
      const addPage = async (element: HTMLElement, title: string) => {
        if (!isFirstPage) {
          pdf.addPage();
        }
        isFirstPage = false;

        setExportProgress(`Rendering ${title}...`);

        const canvas = await html2canvas(element, {
          scale: 2,
          backgroundColor: '#0f172a',
          logging: false
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = Math.min((pdfWidth - 20) / imgWidth, (pdfHeight - 20) / imgHeight);
        const imgX = (pdfWidth - imgWidth * ratio) / 2;
        const imgY = 10;

        pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      };

      // 1. Export Trends
      if (includeTrends && trendsRef.current) {
        await addPage(trendsRef.current, 'Trends');
      }

      // 2. Export FY Summaries (one page per selected FY)
      if (includeFYSummary && selectedFYs.length > 0) {
        for (const fy of selectedFYs) {
          const fyEl = fyRefs.current.get(fy);
          if (fyEl) {
            await addPage(fyEl, fy);
          }
        }
      }

      // 3. Export Individual Months
      if (includeIndividualMonths && selectedMonths.length > 0) {
        for (const periodKey of selectedMonths) {
          const monthEl = monthRefs.current.get(periodKey);
          if (monthEl) {
            const record = allMISRecords.find(r => r.periodKey === periodKey);
            await addPage(monthEl, record ? periodToString(record.period) : periodKey);
          }
        }
      }

      setExportProgress('Saving PDF...');
      pdf.save(`MIS-Report-${new Date().toISOString().split('T')[0]}.pdf`);

    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Error exporting PDF. Please try again.');
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Export MIS Report to PDF</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Section Selection */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Select Sections to Export</h3>

            {/* Trends Option */}
            <label className="flex items-start gap-3 p-4 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700/70 transition-colors">
              <input
                type="checkbox"
                checked={includeTrends}
                onChange={(e) => setIncludeTrends(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-slate-500 text-blue-500 focus:ring-blue-500"
              />
              <div>
                <div className="font-medium text-slate-200">Trends Overview</div>
                <div className="text-sm text-slate-400">Revenue trend chart and monthly comparison table</div>
              </div>
            </label>

            {/* FY Summary Option */}
            <div className="p-4 bg-slate-700/50 rounded-lg">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeFYSummary}
                  onChange={(e) => setIncludeFYSummary(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-slate-500 text-blue-500 focus:ring-blue-500"
                />
                <div>
                  <div className="font-medium text-slate-200">Financial Year Summary</div>
                  <div className="text-sm text-slate-400">Monthly breakdown with all margins for selected FYs</div>
                </div>
              </label>

              {includeFYSummary && (
                <div className="mt-4 pl-7">
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={selectAllFYs}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Select All
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      onClick={clearAllFYs}
                      className="text-xs text-slate-400 hover:text-slate-300"
                    >
                      Clear All
                    </button>
                    <span className="text-xs text-slate-500 ml-2">
                      ({selectedFYs.length} selected)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {availableFYs.map(fy => (
                      <label
                        key={fy}
                        className={`
                          flex items-center gap-2 px-3 py-2 rounded text-sm cursor-pointer transition-colors
                          ${selectedFYs.includes(fy)
                            ? 'bg-blue-500/20 text-blue-300'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                          }
                        `}
                      >
                        <input
                          type="checkbox"
                          checked={selectedFYs.includes(fy)}
                          onChange={() => toggleFY(fy)}
                          className="w-3 h-3 rounded border-slate-500 text-blue-500"
                        />
                        {fy}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Individual Months Option */}
            <div className="p-4 bg-slate-700/50 rounded-lg">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeIndividualMonths}
                  onChange={(e) => setIncludeIndividualMonths(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-slate-500 text-blue-500 focus:ring-blue-500"
                />
                <div>
                  <div className="font-medium text-slate-200">Individual Month Reports</div>
                  <div className="text-sm text-slate-400">Detailed P&L for each selected month</div>
                </div>
              </label>

              {includeIndividualMonths && (
                <div className="mt-4 pl-7">
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={selectAllMonths}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Select All
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      onClick={clearAllMonths}
                      className="text-xs text-slate-400 hover:text-slate-300"
                    >
                      Clear All
                    </button>
                    <span className="text-xs text-slate-500 ml-2">
                      ({selectedMonths.length} selected)
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                    {allMonths.map(({ periodKey, label }) => (
                      <label
                        key={periodKey}
                        className={`
                          flex items-center gap-2 px-3 py-2 rounded text-sm cursor-pointer transition-colors
                          ${selectedMonths.includes(periodKey)
                            ? 'bg-blue-500/20 text-blue-300'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                          }
                        `}
                      >
                        <input
                          type="checkbox"
                          checked={selectedMonths.includes(periodKey)}
                          onChange={() => toggleMonth(periodKey)}
                          className="w-3 h-3 rounded border-slate-500 text-blue-500"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex items-center justify-between">
          <div className="text-sm text-slate-400">
            {exportProgress || 'PDF will be generated in landscape A4 format'}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting || (!includeTrends && !includeFYSummary && !includeIndividualMonths)}
              className={`
                flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all
                ${isExporting || (!includeTrends && !includeFYSummary && !includeIndividualMonths)
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-red-500 text-white hover:bg-red-600'
                }
              `}
            >
              {isExporting ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Hidden render area for PDF generation */}
      <div className="fixed left-[-9999px] top-0">
        {/* Trends Section */}
        {includeTrends && (
          <div ref={trendsRef} className="w-[1200px] bg-slate-900 p-6 space-y-6">
            <h2 className="text-xl font-bold text-slate-100 mb-4">MIS Trends Overview</h2>

            {/* Revenue Chart */}
            <div className="bg-slate-800 rounded-xl p-6">
              <h3 className="text-base font-semibold text-slate-200 mb-4">Net Revenue Trend</h3>
              <div className="flex items-end gap-1 h-48">
                {allMISRecords.slice(0, 24).map((mis) => {
                  const maxRev = Math.max(...allMISRecords.map(r => r.revenue.netRevenue));
                  const height = maxRev > 0 ? (mis.revenue.netRevenue / maxRev) * 180 : 0;
                  return (
                    <div key={mis.periodKey} className="flex-1 flex flex-col items-center">
                      <div className="text-[10px] text-slate-400 mb-1">{formatCurrency(mis.revenue.netRevenue)}</div>
                      <div className="w-full bg-blue-500 rounded-t" style={{ height: `${height}px` }} />
                      <div className="text-[10px] text-slate-500 mt-1">
                        {periodToString(mis.period).split(' ')[0].slice(0, 3)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Comparison Table */}
            <div className="bg-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h3 className="text-base font-semibold text-slate-200">Monthly Comparison</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-700/50">
                    <th className="text-left py-2 px-3 text-slate-300 font-medium">Metric</th>
                    {allMISRecords.slice(0, 12).map(mis => (
                      <th key={mis.periodKey} className="text-right py-2 px-2 text-slate-300 font-medium text-xs">
                        {periodToString(mis.period).split(' ')[0].slice(0, 3)} '{String(mis.period.year).slice(-2)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-700/50">
                    <td className="py-2 px-3 text-slate-300">Net Revenue</td>
                    {allMISRecords.slice(0, 12).map(mis => (
                      <td key={mis.periodKey} className="py-2 px-2 text-right text-slate-300 text-xs">
                        {formatCurrency(mis.revenue.netRevenue)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-700/50 bg-emerald-500/10">
                    <td className="py-2 px-3 text-emerald-400 font-medium">Gross Margin %</td>
                    {allMISRecords.slice(0, 12).map(mis => (
                      <td key={mis.periodKey} className="py-2 px-2 text-right text-emerald-400 text-xs">
                        {formatPercent(mis.grossMarginPercent)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-700/50">
                    <td className="py-2 px-3 text-slate-300">CM1 %</td>
                    {allMISRecords.slice(0, 12).map(mis => (
                      <td key={mis.periodKey} className="py-2 px-2 text-right text-slate-300 text-xs">
                        {formatPercent(mis.cm1Percent)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-700/50 bg-blue-500/10">
                    <td className="py-2 px-3 text-blue-400 font-medium">EBITDA %</td>
                    {allMISRecords.slice(0, 12).map(mis => (
                      <td key={mis.periodKey} className={`py-2 px-2 text-right text-xs ${mis.ebitdaPercent >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                        {formatPercent(mis.ebitdaPercent)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-slate-700/30">
                    <td className="py-2 px-3 text-slate-200 font-semibold">Net Income %</td>
                    {allMISRecords.slice(0, 12).map(mis => (
                      <td key={mis.periodKey} className={`py-2 px-2 text-right text-xs font-semibold ${mis.netIncomePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatPercent(mis.netIncomePercent)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FY Summary Sections - one for each selected FY */}
        {includeFYSummary && selectedFYs.map(fy => {
          const { fyStartYear, fyMonths, fyTotals } = getFYData(fy);

          return (
            <div
              key={fy}
              ref={(el) => { if (el) fyRefs.current.set(fy, el); }}
              className="w-[1200px] bg-slate-900 p-6"
            >
              <h2 className="text-xl font-bold text-slate-100 mb-2">{fy} - P&L Summary</h2>
              <p className="text-sm text-slate-400 mb-4">April {fyStartYear} to March {fyStartYear + 1}</p>

              <div className="bg-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-700/50">
                      <th className="text-left py-3 px-4 text-slate-300 font-semibold">Month</th>
                      <th className="text-right py-3 px-4 text-slate-300 font-semibold">Net Revenue</th>
                      <th className="text-right py-3 px-4 text-slate-300 font-semibold">Gross Margin</th>
                      <th className="text-right py-3 px-4 text-slate-300 font-semibold">CM1</th>
                      <th className="text-right py-3 px-4 text-slate-300 font-semibold">CM2</th>
                      <th className="text-right py-3 px-4 text-slate-300 font-semibold">CM3</th>
                      <th className="text-right py-3 px-4 text-slate-300 font-semibold">EBITDA</th>
                      <th className="text-right py-3 px-4 text-slate-300 font-semibold">Net Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fyMonths.map(({ month, year, label, record }) => (
                      <tr key={`${year}-${month}`} className={`border-b border-slate-700/50 ${!record ? 'opacity-40' : ''}`}>
                        <td className="py-3 px-4 text-slate-200">{label} {year}</td>
                        <td className="py-3 px-4 text-right text-slate-200">
                          {record ? formatCurrency(record.revenue.netRevenue) : '-'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {record ? (
                            <div>
                              <div className="text-slate-200">{formatCurrency(record.grossMargin)}</div>
                              <div className={`text-xs ${record.grossMarginPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatPercent(record.grossMarginPercent)}
                              </div>
                            </div>
                          ) : '-'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {record ? (
                            <div>
                              <div className="text-slate-200">{formatCurrency(record.cm1)}</div>
                              <div className={`text-xs ${record.cm1Percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatPercent(record.cm1Percent)}
                              </div>
                            </div>
                          ) : '-'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {record ? (
                            <div>
                              <div className="text-slate-200">{formatCurrency(record.cm2)}</div>
                              <div className={`text-xs ${record.cm2Percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatPercent(record.cm2Percent)}
                              </div>
                            </div>
                          ) : '-'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {record ? (
                            <div>
                              <div className="text-slate-200">{formatCurrency(record.cm3)}</div>
                              <div className={`text-xs ${record.cm3Percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatPercent(record.cm3Percent)}
                              </div>
                            </div>
                          ) : '-'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {record ? (
                            <div>
                              <div className={record.ebitda >= 0 ? 'text-slate-200' : 'text-red-400'}>{formatCurrency(record.ebitda)}</div>
                              <div className={`text-xs ${record.ebitdaPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatPercent(record.ebitdaPercent)}
                              </div>
                            </div>
                          ) : '-'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {record ? (
                            <div>
                              <div className={record.netIncome >= 0 ? 'text-slate-200' : 'text-red-400'}>{formatCurrency(record.netIncome)}</div>
                              <div className={`text-xs ${record.netIncomePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatPercent(record.netIncomePercent)}
                              </div>
                            </div>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                    {/* Totals Row */}
                    <tr className="bg-slate-700/70 font-semibold">
                      <td className="py-4 px-4 text-slate-100 font-bold">FY Total</td>
                      <td className="py-4 px-4 text-right text-blue-400">{formatCurrency(fyTotals.netRevenue)}</td>
                      <td className="py-4 px-4 text-right">
                        <div className={fyTotals.grossMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatCurrency(fyTotals.grossMargin)}</div>
                        <div className="text-xs">{fyTotals.netRevenue > 0 ? formatPercent((fyTotals.grossMargin / fyTotals.netRevenue) * 100) : '-'}</div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className={fyTotals.cm1 >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatCurrency(fyTotals.cm1)}</div>
                        <div className="text-xs">{fyTotals.netRevenue > 0 ? formatPercent((fyTotals.cm1 / fyTotals.netRevenue) * 100) : '-'}</div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className={fyTotals.cm2 >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatCurrency(fyTotals.cm2)}</div>
                        <div className="text-xs">{fyTotals.netRevenue > 0 ? formatPercent((fyTotals.cm2 / fyTotals.netRevenue) * 100) : '-'}</div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className={fyTotals.cm3 >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatCurrency(fyTotals.cm3)}</div>
                        <div className="text-xs">{fyTotals.netRevenue > 0 ? formatPercent((fyTotals.cm3 / fyTotals.netRevenue) * 100) : '-'}</div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className={fyTotals.ebitda >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatCurrency(fyTotals.ebitda)}</div>
                        <div className="text-xs">{fyTotals.netRevenue > 0 ? formatPercent((fyTotals.ebitda / fyTotals.netRevenue) * 100) : '-'}</div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className={fyTotals.netIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatCurrency(fyTotals.netIncome)}</div>
                        <div className="text-xs">{fyTotals.netRevenue > 0 ? formatPercent((fyTotals.netIncome / fyTotals.netRevenue) * 100) : '-'}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {/* Individual Month Sections */}
        {includeIndividualMonths && selectedMonths.map(periodKey => {
          const record = allMISRecords.find(r => r.periodKey === periodKey);
          if (!record) return null;

          return (
            <div
              key={periodKey}
              ref={(el) => { if (el) monthRefs.current.set(periodKey, el); }}
              className="w-[1200px] bg-slate-900 p-6"
            >
              <h2 className="text-xl font-bold text-slate-100 mb-4">
                {periodToString(record.period)} - P&L Report
              </h2>

              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-sm text-slate-400">Net Revenue</div>
                  <div className="text-xl font-semibold text-blue-400">{formatCurrency(record.revenue.netRevenue)}</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-sm text-slate-400">Gross Margin</div>
                  <div className={`text-xl font-semibold ${record.grossMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatPercent(record.grossMarginPercent)}
                  </div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-sm text-slate-400">EBITDA</div>
                  <div className={`text-xl font-semibold ${record.ebitda >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatPercent(record.ebitdaPercent)}
                  </div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-sm text-slate-400">Net Income</div>
                  <div className={`text-xl font-semibold ${record.netIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatPercent(record.netIncomePercent)}
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-700/50">
                      <th className="text-left py-3 px-4 text-slate-300 font-semibold">Category</th>
                      <th className="text-right py-3 px-4 text-slate-300 font-semibold">Amount</th>
                      <th className="text-right py-3 px-4 text-slate-300 font-semibold">% of Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-3 px-4 text-slate-200 font-medium">Net Revenue</td>
                      <td className="py-3 px-4 text-right text-blue-400">{formatCurrency(record.revenue.netRevenue)}</td>
                      <td className="py-3 px-4 text-right text-slate-400">100%</td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-3 px-4 text-slate-300 pl-8">Less: COGM</td>
                      <td className="py-3 px-4 text-right text-red-400">({formatCurrency(record.cogm.totalCOGM)})</td>
                      <td className="py-3 px-4 text-right text-slate-400">{formatPercent(record.revenue.netRevenue > 0 ? (record.cogm.totalCOGM / record.revenue.netRevenue) * 100 : 0)}</td>
                    </tr>
                    <tr className="border-b border-slate-700/50 bg-emerald-500/10">
                      <td className="py-3 px-4 text-emerald-400 font-medium">Gross Margin</td>
                      <td className="py-3 px-4 text-right text-emerald-400">{formatCurrency(record.grossMargin)}</td>
                      <td className="py-3 px-4 text-right text-emerald-400">{formatPercent(record.grossMarginPercent)}</td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-3 px-4 text-slate-300 pl-8">Less: Channel & Fulfillment</td>
                      <td className="py-3 px-4 text-right text-red-400">({formatCurrency(record.channelFulfillment.total)})</td>
                      <td className="py-3 px-4 text-right text-slate-400">{formatPercent(record.revenue.netRevenue > 0 ? (record.channelFulfillment.total / record.revenue.netRevenue) * 100 : 0)}</td>
                    </tr>
                    <tr className="border-b border-slate-700/50 bg-blue-500/10">
                      <td className="py-3 px-4 text-blue-400 font-medium">CM1</td>
                      <td className="py-3 px-4 text-right text-blue-400">{formatCurrency(record.cm1)}</td>
                      <td className="py-3 px-4 text-right text-blue-400">{formatPercent(record.cm1Percent)}</td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-3 px-4 text-slate-300 pl-8">Less: Sales & Marketing</td>
                      <td className="py-3 px-4 text-right text-red-400">({formatCurrency(record.salesMarketing.total)})</td>
                      <td className="py-3 px-4 text-right text-slate-400">{formatPercent(record.revenue.netRevenue > 0 ? (record.salesMarketing.total / record.revenue.netRevenue) * 100 : 0)}</td>
                    </tr>
                    <tr className="border-b border-slate-700/50 bg-purple-500/10">
                      <td className="py-3 px-4 text-purple-400 font-medium">CM2</td>
                      <td className="py-3 px-4 text-right text-purple-400">{formatCurrency(record.cm2)}</td>
                      <td className="py-3 px-4 text-right text-purple-400">{formatPercent(record.cm2Percent)}</td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-3 px-4 text-slate-300 pl-8">Less: Platform Costs</td>
                      <td className="py-3 px-4 text-right text-red-400">({formatCurrency(record.platformCosts.total)})</td>
                      <td className="py-3 px-4 text-right text-slate-400">{formatPercent(record.revenue.netRevenue > 0 ? (record.platformCosts.total / record.revenue.netRevenue) * 100 : 0)}</td>
                    </tr>
                    <tr className="border-b border-slate-700/50 bg-orange-500/10">
                      <td className="py-3 px-4 text-orange-400 font-medium">CM3</td>
                      <td className="py-3 px-4 text-right text-orange-400">{formatCurrency(record.cm3)}</td>
                      <td className="py-3 px-4 text-right text-orange-400">{formatPercent(record.cm3Percent)}</td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-3 px-4 text-slate-300 pl-8">Less: Operating Expenses</td>
                      <td className="py-3 px-4 text-right text-red-400">({formatCurrency(record.operatingExpenses.total)})</td>
                      <td className="py-3 px-4 text-right text-slate-400">{formatPercent(record.revenue.netRevenue > 0 ? (record.operatingExpenses.total / record.revenue.netRevenue) * 100 : 0)}</td>
                    </tr>
                    <tr className="border-b border-slate-700/50 bg-cyan-500/10">
                      <td className="py-3 px-4 text-cyan-400 font-medium">EBITDA</td>
                      <td className="py-3 px-4 text-right text-cyan-400">{formatCurrency(record.ebitda)}</td>
                      <td className="py-3 px-4 text-right text-cyan-400">{formatPercent(record.ebitdaPercent)}</td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-3 px-4 text-slate-300 pl-8">Less: Non-Operating (I+D+A)</td>
                      <td className="py-3 px-4 text-right text-red-400">({formatCurrency(record.nonOperating.totalIDA)})</td>
                      <td className="py-3 px-4 text-right text-slate-400">{formatPercent(record.revenue.netRevenue > 0 ? (record.nonOperating.totalIDA / record.revenue.netRevenue) * 100 : 0)}</td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-3 px-4 text-slate-300 pl-8">Less: Income Tax</td>
                      <td className="py-3 px-4 text-right text-red-400">({formatCurrency(record.nonOperating.incomeTax)})</td>
                      <td className="py-3 px-4 text-right text-slate-400">{formatPercent(record.revenue.netRevenue > 0 ? (record.nonOperating.incomeTax / record.revenue.netRevenue) * 100 : 0)}</td>
                    </tr>
                    <tr className="bg-slate-700/50">
                      <td className="py-4 px-4 text-slate-100 font-bold">Net Income</td>
                      <td className={`py-4 px-4 text-right font-bold ${record.netIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(record.netIncome)}
                      </td>
                      <td className={`py-4 px-4 text-right font-bold ${record.netIncomePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatPercent(record.netIncomePercent)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MISExportModal;
