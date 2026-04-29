import { useEffect, useState } from 'react';

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

export type MasterSource = 'bundled' | 'override';

export interface MasterState {
  master: TallyMaster | null;
  source: MasterSource;
  error: string | null;
  loading: boolean;
  setOverride: (m: TallyMaster) => void;
  clearOverride: () => void;
}

const LS_KEY = 'heatronics.tally.master.override';
const DEFAULT_URL = '/data/tally/master.json';

function readOverride(): TallyMaster | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as TallyMaster;
    return null;
  } catch {
    return null;
  }
}

export function useTallyMaster(): MasterState {
  const [master, setMaster] = useState<TallyMaster | null>(null);
  const [source, setSource] = useState<MasterSource>('bundled');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const override = readOverride();
    if (override) {
      setMaster(override);
      setSource('override');
      setLoading(false);
      return;
    }
    fetch(DEFAULT_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Master fetch failed (${r.status})`);
        return r.json();
      })
      .then((m) => {
        setMaster(m);
        setSource('bundled');
      })
      .catch((e) => setError(e.message || 'Failed to load Tally master'))
      .finally(() => setLoading(false));
  }, []);

  function setOverride(m: TallyMaster) {
    localStorage.setItem(LS_KEY, JSON.stringify(m));
    setMaster(m);
    setSource('override');
    setError(null);
  }

  function clearOverride() {
    localStorage.removeItem(LS_KEY);
    setLoading(true);
    fetch(DEFAULT_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Master fetch failed (${r.status})`);
        return r.json();
      })
      .then((m) => {
        setMaster(m);
        setSource('bundled');
        setError(null);
      })
      .catch((e) => setError(e.message || 'Failed to load Tally master'))
      .finally(() => setLoading(false));
  }

  return { master, source, error, loading, setOverride, clearOverride };
}
