// Google Drive API Client
// Communicates with the server-side Drive integration

const API_BASE = '/api/drive';

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  type: 'balance_sheet' | 'sales_register' | 'purchase_register' | 'journal_register' | 'unknown';
  month: number;
  year: number;
  stateCode: string;
}

export interface DriveStateData {
  code: string;
  name: string;
  folderId: string;
  files: DriveFileInfo[];
  hasBalanceSheet: boolean;
  hasSalesRegister: boolean;
  hasPurchaseRegister: boolean;
  hasJournalRegister: boolean;
}

export interface DriveMonthData {
  year: number;
  month: number;
  monthName: string;
  states: DriveStateData[];
}

export interface DriveYearData {
  year: string;
  folderId: string;
  months: DriveMonthData[];
}

export interface DriveFolderStructure {
  inputsFolderId: string;
  years: DriveYearData[];
}

export interface DriveStatus {
  connected: boolean;
  folderId?: string;
  error?: string;
}

// Check if Drive is connected
export async function checkDriveStatus(): Promise<DriveStatus> {
  try {
    const response = await fetch(`${API_BASE}/status`);
    return await response.json();
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Network error'
    };
  }
}

// Get the full folder structure from Drive
export async function getDriveFolderStructure(): Promise<DriveFolderStructure | null> {
  try {
    const response = await fetch(`${API_BASE}/structure`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching Drive structure:', error);
    return null;
  }
}

// Get files for a specific month and optionally state
export async function getFilesForMonth(
  year: number,
  month: number,
  stateCode?: string
): Promise<DriveFileInfo[]> {
  try {
    let url = `${API_BASE}/files/${year}/${month}`;
    if (stateCode) {
      url += `?state=${stateCode}`;
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.files || [];
  } catch (error) {
    console.error('Error fetching files:', error);
    return [];
  }
}

// Download file content as base64
export async function getFileContent(fileId: string): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/content/${fileId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.content;
  } catch (error) {
    console.error('Error fetching file content:', error);
    return null;
  }
}

// Download file as Blob (for processing)
export async function downloadFile(fileId: string, fileName: string, mimeType: string): Promise<Blob | null> {
  try {
    const response = await fetch(
      `${API_BASE}/download/${fileId}?name=${encodeURIComponent(fileName)}&mimeType=${encodeURIComponent(mimeType)}`
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.blob();
  } catch (error) {
    console.error('Error downloading file:', error);
    return null;
  }
}

// Convert base64 to File object for processing
export function base64ToFile(base64: string, fileName: string, mimeType: string): File {
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: mimeType });
  return new File([blob], fileName, { type: mimeType });
}

// Fetch all files for a month and convert to File objects
export async function fetchMonthFilesAsFileObjects(
  year: number,
  month: number,
  stateCode?: string
): Promise<{ file: File; info: DriveFileInfo }[]> {
  const files = await getFilesForMonth(year, month, stateCode);
  const results: { file: File; info: DriveFileInfo }[] = [];

  for (const fileInfo of files) {
    const content = await getFileContent(fileInfo.id);
    if (content) {
      const file = base64ToFile(content, fileInfo.name, fileInfo.mimeType);
      results.push({ file, info: fileInfo });
    }
  }

  return results;
}

// Configure the Drive folder ID
export async function configureDriveFolder(folderId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId })
    });
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error configuring Drive:', error);
    return false;
  }
}

// Helper to get month name from number
export function getMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1] || '';
}

// Helper to get short month name
export function getShortMonthName(month: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[month - 1] || '';
}

// State code to name mapping
export const STATE_NAMES: Record<string, string> = {
  'KA': 'Karnataka',
  'MH': 'Maharashtra',
  'HR': 'Haryana',
  'UP': 'Uttar Pradesh',
  'TL': 'Telangana',
};

export const STATE_CODES: Record<string, string> = {
  'Karnataka': 'KA',
  'Maharashtra': 'MH',
  'Haryana': 'HR',
  'Uttar Pradesh': 'UP',
  'UP': 'UP',
  'Telangana': 'TL',
};
