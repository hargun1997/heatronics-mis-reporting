import { WarrantyCase, WarrantyStorageData, WarrantyStatus, generateWarrantyId } from '../types/warranty';

const STORAGE_KEY = 'heatronics_warranty_cases';

function loadFromLocalStorage(): WarrantyStorageData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (error) {
    console.error('Error loading warranty data:', error);
  }
  return { version: '1.0', lastUpdated: new Date().toISOString(), cases: [] };
}

function saveToLocalStorage(data: WarrantyStorageData): boolean {
  try {
    data.lastUpdated = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Error saving warranty data:', error);
    return false;
  }
}

export async function loadWarrantyData(): Promise<WarrantyStorageData> {
  return loadFromLocalStorage();
}

export async function saveWarrantyData(data: WarrantyStorageData): Promise<boolean> {
  return saveToLocalStorage(data);
}

function applyStatusTransitionDates(existing: WarrantyCase, newStatus: WarrantyStatus): Partial<WarrantyCase> {
  const now = new Date().toISOString();
  const dates: Partial<WarrantyCase> = {};

  if (newStatus === 'rejected' && existing.status !== 'rejected') {
    dates.rejectedAt = now;
  }
  if (newStatus === 'approved' && existing.status !== 'approved') {
    dates.approvedAt = now;
  }
  if (newStatus === 'completed' && existing.status !== 'completed') {
    dates.completedAt = now;
  }
  if (newStatus === 'shipped' && existing.status !== 'shipped') {
    dates.shippedAt = now;
  }

  return dates;
}

export async function addWarrantyCase(
  caseData: Omit<WarrantyCase, 'id' | 'createdAt' | 'updatedAt'>
): Promise<WarrantyCase> {
  const data = await loadWarrantyData();
  const now = new Date().toISOString();
  const newCase: WarrantyCase = {
    ...caseData,
    id: generateWarrantyId(),
    createdAt: now,
    updatedAt: now,
  };
  data.cases.unshift(newCase);
  await saveWarrantyData(data);
  return newCase;
}

export async function updateWarrantyCase(
  caseId: string,
  updates: Partial<WarrantyCase>
): Promise<boolean> {
  const data = await loadWarrantyData();
  const index = data.cases.findIndex(c => c.id === caseId);
  if (index < 0) return false;

  const existing = data.cases[index];
  let transitionDates: Partial<WarrantyCase> = {};
  if (updates.status && updates.status !== existing.status) {
    transitionDates = applyStatusTransitionDates(existing, updates.status);
  }

  data.cases[index] = {
    ...existing,
    ...updates,
    ...transitionDates,
    updatedAt: new Date().toISOString(),
  };

  return await saveWarrantyData(data);
}

export async function deleteWarrantyCase(caseId: string): Promise<boolean> {
  const data = await loadWarrantyData();
  const index = data.cases.findIndex(c => c.id === caseId);
  if (index < 0) return false;
  data.cases.splice(index, 1);
  return await saveWarrantyData(data);
}

export async function deleteWarrantyCases(caseIds: string[]): Promise<boolean> {
  const data = await loadWarrantyData();
  const idSet = new Set(caseIds);
  data.cases = data.cases.filter(c => !idSet.has(c.id));
  return await saveWarrantyData(data);
}

export async function getWarrantyCase(caseId: string): Promise<WarrantyCase | null> {
  const data = await loadWarrantyData();
  return data.cases.find(c => c.id === caseId) || null;
}
