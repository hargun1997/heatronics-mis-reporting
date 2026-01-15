import React, { useCallback } from 'react';

interface FileUploadProps {
  label: string;
  accept: string;
  onFileSelect: (file: File) => void;
  isParsed: boolean;
  isLoading: boolean;
  fileName?: string;
  icon: React.ReactNode;
}

export function FileUpload({
  label,
  accept,
  onFileSelect,
  isParsed,
  isLoading,
  fileName,
  icon
}: FileUploadProps) {
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files[0];
    if (file) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  return (
    <div
      className={`
        relative flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg
        transition-all duration-200 cursor-pointer min-w-[180px]
        ${isParsed
          ? 'border-green-400 bg-green-50'
          : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'
        }
        ${isLoading ? 'opacity-70 pointer-events-none' : ''}
      `}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => document.getElementById(`file-${label}`)?.click()}
    >
      <input
        id={`file-${label}`}
        type="file"
        accept={accept}
        onChange={handleFileInput}
        className="hidden"
      />

      <div className={`mb-2 ${isParsed ? 'text-green-600' : 'text-gray-400'}`}>
        {isLoading ? (
          <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : isParsed ? (
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          icon
        )}
      </div>

      <span className={`text-sm font-medium ${isParsed ? 'text-green-700' : 'text-gray-700'}`}>
        {label}
      </span>

      {fileName && (
        <span className="text-xs text-gray-500 mt-1 truncate max-w-[160px]" title={fileName}>
          {fileName}
        </span>
      )}

      {!isParsed && !isLoading && (
        <span className="text-xs text-gray-400 mt-1">
          Drop or click
        </span>
      )}
    </div>
  );
}

interface FileUploadSectionProps {
  onJournalUpload: (file: File) => void;
  onBalanceSheetUpload: (file: File) => void;
  onPurchaseUpload: (file: File) => void;
  journalParsed: boolean;
  balanceSheetParsed: boolean;
  purchaseParsed: boolean;
  loading: boolean;
  journalFile?: File | null;
  balanceSheetFile?: File | null;
  purchaseFile?: File | null;
}

export function FileUploadSection({
  onJournalUpload,
  onBalanceSheetUpload,
  onPurchaseUpload,
  journalParsed,
  balanceSheetParsed,
  purchaseParsed,
  loading,
  journalFile,
  balanceSheetFile,
  purchaseFile
}: FileUploadSectionProps) {
  const ExcelIcon = (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );

  const PDFIcon = (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    </svg>
  );

  return (
    <div className="flex flex-wrap gap-4 items-center">
      <FileUpload
        label="Balance Sheet"
        accept=".pdf,.xlsx,.xls"
        onFileSelect={onBalanceSheetUpload}
        isParsed={balanceSheetParsed}
        isLoading={loading && !!balanceSheetFile && !balanceSheetParsed}
        fileName={balanceSheetFile?.name}
        icon={PDFIcon}
      />

      <FileUpload
        label="Journal Vouchers"
        accept=".xlsx,.xls"
        onFileSelect={onJournalUpload}
        isParsed={journalParsed}
        isLoading={loading && !!journalFile && !journalParsed}
        fileName={journalFile?.name}
        icon={ExcelIcon}
      />

      <FileUpload
        label="Purchase Ledger"
        accept=".xlsx,.xls"
        onFileSelect={onPurchaseUpload}
        isParsed={purchaseParsed}
        isLoading={loading && !!purchaseFile && !purchaseParsed}
        fileName={purchaseFile?.name}
        icon={ExcelIcon}
      />
    </div>
  );
}
