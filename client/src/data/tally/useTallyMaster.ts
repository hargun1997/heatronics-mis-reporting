import { useEffect, useState } from 'react';
import { reduceTallyExport, readFileAsText, ReduceStats } from './reduceTallyExport';

export interface TallyGroup {
  name: string;
  parent: string | null;
  isRevenue?: boolean;
}

export interface TallyLedger {
  name: string;
  group: string | null;
  gst?: boolean;
  tds?: boolean;
  supplyType?: string;
}

export interface TallyVoucherType {
  name: string;
  parent: string | null;
}

export interface TallyCostCentre {
  name: string;
  category: string | null;
  parent?: string | null;
}

export interface TallyMaster {
  generatedAt?: string;
  company?: string;
  groups?: TallyGroup[];
  ledgers?: TallyLedger[];
  voucherTypes?: TallyVoucherType[];
  costCategories?: string[];
  costCentres?: TallyCostCentre[];
  currencies?: string[];
}

export interface MasterState {
  master: TallyMaster | null;
  loading: boolean;
  error: string | null;
  /** Best-effort label for where the loaded master came from. */
  sourceLabel: string | null;
  /** Read a raw Tally export (or already-reduced master) from a File and store it. */
  loadFromFile: (file: File) => Promise<ReduceStats>;
  /** Apply a JSON string the user pasted in. */
  loadFromText: (text: string, label?: string) => ReduceStats;
  /** Drop the saved master from localStorage. */
  clear: () => void;
}

const LS_KEY = 'heatronics.tally.master.v2';
const LS_SOURCE_KEY = 'heatronics.tally.master.v2.source';

function readSaved(): { master: TallyMaster | null; label: string | null } {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { master: null, label: null };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        master: parsed as TallyMaster,
        label: localStorage.getItem(LS_SOURCE_KEY),
      };
    }
    return { master: null, label: null };
  } catch {
    return { master: null, label: null };
  }
}

function save(master: TallyMaster, label: string) {
  localStorage.setItem(LS_KEY, JSON.stringify(master));
  localStorage.setItem(LS_SOURCE_KEY, label);
}

export function useTallyMaster(): MasterState {
  const [master, setMaster] = useState<TallyMaster | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = readSaved();
    setMaster(saved.master);
    setSourceLabel(saved.label);
    setLoading(false);
  }, []);

  function loadFromText(text: string, label?: string): ReduceStats {
    setError(null);
    try {
      const parsed = JSON.parse(text);
      const result = reduceTallyExport(parsed);
      const finalLabel =
        label ||
        (result.source === 'raw-tally'
          ? `Reduced from Tally export · ${new Date().toLocaleString()}`
          : `Imported slim master · ${new Date().toLocaleString()}`);
      save(result.master, finalLabel);
      setMaster(result.master);
      setSourceLabel(finalLabel);
      return result.stats;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to parse JSON';
      setError(msg);
      throw e;
    }
  }

  async function loadFromFile(file: File): Promise<ReduceStats> {
    setError(null);
    try {
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text);
      const result = reduceTallyExport(parsed);
      const label =
        result.source === 'raw-tally'
          ? `Reduced from ${file.name} · ${new Date().toLocaleString()}`
          : `Loaded ${file.name} · ${new Date().toLocaleString()}`;
      save(result.master, label);
      setMaster(result.master);
      setSourceLabel(label);
      return result.stats;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to read file';
      setError(msg);
      throw e;
    }
  }

  function clear() {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_SOURCE_KEY);
    setMaster(null);
    setSourceLabel(null);
    setError(null);
  }

  return {
    master,
    loading,
    error,
    sourceLabel,
    loadFromFile,
    loadFromText,
    clear,
  };
}
