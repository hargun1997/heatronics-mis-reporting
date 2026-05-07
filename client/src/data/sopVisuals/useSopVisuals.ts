import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Hook for the SOP visuals registry.
//
// One module-level cache shared across all <SopVisual> instances on a page,
// so we don't fetch the registry per placeholder. Uploads update the cache
// optimistically and notify subscribers so other placeholders re-render.
// ---------------------------------------------------------------------------

export interface SopVisualEntry {
  key: string;
  sopPath: string;
  driveFileId: string;
  mimeType: string;
  fileName: string;
  lastUpdated: string;
  uploadedBy: string;
}

let cache: SopVisualEntry[] | null = null;
let inflight: Promise<SopVisualEntry[]> | null = null;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((cb) => cb());
}

async function fetchRegistry(): Promise<SopVisualEntry[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch('/api/sop-visuals');
    if (!res.ok) throw new Error(`Registry fetch failed (${res.status})`);
    const data = (await res.json()) as { entries?: SopVisualEntry[] };
    return data.entries || [];
  })();
  try {
    cache = await inflight;
    return cache;
  } finally {
    inflight = null;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

export interface UseSopVisualsResult {
  entries: SopVisualEntry[] | null;
  loading: boolean;
  findByKey: (key: string) => SopVisualEntry | null;
  upload: (input: { key: string; sopPath: string; file: File }) => Promise<SopVisualEntry>;
  refresh: () => Promise<void>;
}

export function useSopVisuals(): UseSopVisualsResult {
  const [entries, setEntries] = useState<SopVisualEntry[] | null>(cache);

  useEffect(() => {
    const onUpdate = () => setEntries(cache);
    subscribers.add(onUpdate);
    if (cache === null) {
      fetchRegistry()
        .then(() => notify())
        .catch(() => notify());
    }
    return () => {
      subscribers.delete(onUpdate);
    };
  }, []);

  function findByKey(key: string): SopVisualEntry | null {
    return (entries || []).find((e) => e.key === key) || null;
  }

  async function upload(input: { key: string; sopPath: string; file: File }): Promise<SopVisualEntry> {
    const dataBase64 = await fileToBase64(input.file);
    const res = await fetch('/api/sop-visuals/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: input.key,
        sopPath: input.sopPath,
        fileName: input.file.name,
        mimeType: input.file.type || 'application/octet-stream',
        dataBase64,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Upload failed (${res.status})`);
    }
    const data = (await res.json()) as { entry: SopVisualEntry };
    cache = (cache || []).filter((e) => e.key !== data.entry.key).concat(data.entry);
    notify();
    return data.entry;
  }

  async function refresh(): Promise<void> {
    cache = null;
    await fetchRegistry();
    notify();
  }

  return {
    entries,
    loading: entries === null,
    findByKey,
    upload,
    refresh,
  };
}
