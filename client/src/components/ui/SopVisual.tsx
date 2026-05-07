import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSopVisuals } from '../../data/sopVisuals/useSopVisuals';

interface SopVisualProps {
  /** Stable key — same value across uploads so the visual gets overwritten. */
  placeholderKey: string;
  /** Caption shown under the visual + alt text for accessibility. */
  label: string;
  /** Optional override for the SOP path stored in the registry. Defaults to the current pathname. */
  sopPath?: string;
  /** Pixel cap; default 480px keeps the page layout sane on big monitors. */
  maxHeight?: number;
}

const ACCEPT = 'image/*';

export function SopVisual({ placeholderKey, label, sopPath, maxHeight = 480 }: SopVisualProps) {
  const location = useLocation();
  const path = sopPath || location.pathname;
  const { findByKey, upload, loading } = useSopVisuals();
  const entry = findByKey(placeholderKey);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function onPickFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      await upload({ key: placeholderKey, sopPath: path, file });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const src = entry
    ? `/api/sop-visuals/${encodeURIComponent(placeholderKey)}/content?v=${encodeURIComponent(entry.lastUpdated)}`
    : null;

  return (
    <figure className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickFile(f);
          e.target.value = '';
        }}
      />
      {entry && src ? (
        <div className="relative bg-slate-50 group">
          <img
            src={src}
            alt={label}
            className="w-full h-auto object-contain"
            style={{ maxHeight: `${maxHeight}px` }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute top-2 right-2 rounded-md bg-white/95 border border-slate-200 hover:bg-white text-slate-700 text-[11px] font-medium px-2 py-1 shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Replace'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || loading}
          className="w-full flex flex-col items-center justify-center gap-2 px-4 py-10 border-b border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 disabled:opacity-60 text-slate-600"
        >
          <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 12l-4-4m0 0l-4 4m4-4v12" />
          </svg>
          <span className="text-sm font-medium">
            {uploading ? 'Uploading…' : loading ? 'Loading registry…' : 'Upload visual'}
          </span>
          <span className="text-[11px] text-slate-500">PNG / JPG / GIF · click or drag in</span>
        </button>
      )}
      <figcaption className="px-3 py-2 border-t border-slate-100 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-700 truncate">{label}</span>
        {entry && (
          <span className="text-[10px] uppercase tracking-wider text-slate-400 flex-shrink-0">
            {new Date(entry.lastUpdated).toLocaleDateString()}
          </span>
        )}
      </figcaption>
      {error && (
        <div className="px-3 py-2 border-t border-rose-100 bg-rose-50 text-xs text-rose-800">
          {error}
        </div>
      )}
    </figure>
  );
}
