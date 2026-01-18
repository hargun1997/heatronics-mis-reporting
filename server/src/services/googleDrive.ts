import { google, drive_v3 } from 'googleapis';

// State code mappings
const STATE_CODES: Record<string, string> = {
  'Karnataka': 'KA',
  'Maharashtra': 'MH',
  'Haryana': 'HR',
  'UP': 'UP',
  'Telangana': 'TL',
  // Add more as needed
};

const STATE_NAMES: Record<string, string> = {
  'KA': 'Karnataka',
  'MH': 'Maharashtra',
  'HR': 'Haryana',
  'UP': 'UP',
  'TL': 'Telangana',
};

// Month name mappings - support various formats
const MONTH_MAP: Record<string, number> = {
  'JAN': 1, 'JANUARY': 1,
  'FEB': 2, 'FEBRUARY': 2,
  'MAR': 3, 'MARCH': 3,
  'APR': 4, 'APRIL': 4,
  'MAY': 5,
  'JUN': 6, 'JUNE': 6,
  'JUL': 7, 'JULY': 7,
  'AUG': 8, 'AUGUST': 8,
  'SEP': 9, 'SEPT': 9, 'SEPTEMBER': 9,
  'OCT': 10, 'OCTOBER': 10,
  'NOV': 11, 'NOVEMBER': 11,
  'DEC': 12, 'DECEMBER': 12
};

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  type: 'balance_sheet' | 'sales_register' | 'purchase_register' | 'journal_register' | 'unknown';
  month: number;
  year: number;
  stateCode: string;
}

export interface DriveMonthData {
  year: number;
  month: number;
  monthName: string;
  states: {
    code: string;
    name: string;
    folderId: string;
    files: DriveFileInfo[];
    hasBalanceSheet: boolean;
    hasSalesRegister: boolean;
    hasPurchaseRegister: boolean;
    hasJournalRegister: boolean;
  }[];
}

export interface DriveFolderStructure {
  inputsFolderId: string;
  years: {
    year: string;
    folderId: string;
    months: DriveMonthData[];
  }[];
}

class GoogleDriveService {
  private drive: drive_v3.Drive | null = null;
  private inputsFolderId: string;

  constructor() {
    // The inputs folder ID from the shared URL
    this.inputsFolderId = process.env.GOOGLE_DRIVE_INPUTS_FOLDER_ID || '1pvt-FMWuGRkMk5nsO6e9zSHvDcxFlgT_';
  }

  private async getAuth() {
    // Use Application Default Credentials (ADC)
    // In GCP, this uses the service account attached to the compute instance/Cloud Run
    // Locally, you can set GOOGLE_APPLICATION_CREDENTIALS env var to point to a service account key file
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    return auth;
  }

  async initialize(): Promise<boolean> {
    try {
      const auth = await this.getAuth();
      this.drive = google.drive({ version: 'v3', auth });

      // Test connection by listing files in inputs folder
      const response = await this.drive.files.list({
        q: `'${this.inputsFolderId}' in parents and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1
      });

      console.log('Google Drive connected successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Google Drive:', error);
      return false;
    }
  }

  private async listFolders(parentId: string): Promise<{ id: string; name: string }[]> {
    if (!this.drive) throw new Error('Drive not initialized');

    const response = await this.drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 100,
      orderBy: 'name'
    });

    return (response.data.files || []).map(f => ({
      id: f.id!,
      name: f.name!
    }));
  }

  private async listFiles(parentId: string): Promise<{ id: string; name: string; mimeType: string }[]> {
    if (!this.drive) throw new Error('Drive not initialized');

    const response = await this.drive.files.list({
      q: `'${parentId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 100
    });

    return (response.data.files || []).map(f => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType!
    }));
  }

  private parseFileName(fileName: string): { type: DriveFileInfo['type']; stateCode?: string } {
    // Get the base name without extension
    const baseName = fileName.replace(/\.[^/.]+$/, '').toUpperCase().trim();
    const upperName = fileName.toUpperCase();

    // Determine file type - support both short codes (BS, SR, PR, JR) and full names
    let type: DriveFileInfo['type'] = 'unknown';

    // Short codes (exact match or starts with)
    if (baseName === 'BS' || baseName.startsWith('BS ') || baseName.startsWith('BS_') || baseName.startsWith('BS-')) {
      type = 'balance_sheet';
    } else if (baseName === 'SR' || baseName.startsWith('SR ') || baseName.startsWith('SR_') || baseName.startsWith('SR-')) {
      type = 'sales_register';
    } else if (baseName === 'PR' || baseName.startsWith('PR ') || baseName.startsWith('PR_') || baseName.startsWith('PR-')) {
      type = 'purchase_register';
    } else if (baseName === 'JR' || baseName.startsWith('JR ') || baseName.startsWith('JR_') || baseName.startsWith('JR-')) {
      type = 'journal_register';
    }
    // Full names (for backward compatibility)
    else if (upperName.includes('BALANCE')) {
      type = 'balance_sheet';
    } else if (upperName.includes('SALESREGISTER') || upperName.includes('SALES REGISTER') || upperName.includes('SALES_REGISTER')) {
      type = 'sales_register';
    } else if (upperName.includes('PURCHASEREGISTER') || upperName.includes('PURCHASE REGISTER') || upperName.includes('PURCHASE_REGISTER')) {
      type = 'purchase_register';
    } else if (upperName.includes('JOURNALREGISTER') || upperName.includes('JOURNAL REGISTER') || upperName.includes('JOURNAL_REGISTER')) {
      type = 'journal_register';
    }

    // Extract state code (look for KA, MH, HR, UP, TL in filename) - optional since folder provides this
    let stateCode: string | undefined;
    for (const code of Object.keys(STATE_NAMES)) {
      if (upperName.includes(` ${code}.`) || upperName.includes(` ${code} `) || upperName.endsWith(` ${code}`) ||
          upperName.includes(`_${code}.`) || upperName.includes(`_${code}_`) || upperName.includes(`-${code}.`)) {
        stateCode = code;
        break;
      }
    }

    return { type, stateCode };
  }

  private parseMonthFolder(folderName: string): { month: number; year: number } | null {
    // Parse formats like "APR-24", "JUNE-24", "JAN-25"
    const match = folderName.match(/^([A-Z]+)-(\d{2})$/i);
    if (!match) return null;

    const monthName = match[1].toUpperCase();
    const yearShort = parseInt(match[2], 10);

    const month = MONTH_MAP[monthName];
    if (!month) return null;

    // Convert 24 -> 2024, 25 -> 2025
    const year = yearShort >= 50 ? 1900 + yearShort : 2000 + yearShort;

    return { month, year };
  }

  async scanFolderStructure(): Promise<DriveFolderStructure> {
    if (!this.drive) {
      await this.initialize();
    }

    const structure: DriveFolderStructure = {
      inputsFolderId: this.inputsFolderId,
      years: []
    };

    // Get year folders (2023-24, 2024-25, etc.)
    console.log(`Scanning Drive folder: ${this.inputsFolderId}`);
    const yearFolders = await this.listFolders(this.inputsFolderId);
    console.log(`Found ${yearFolders.length} year folders:`, yearFolders.map(f => f.name));

    for (const yearFolder of yearFolders) {
      const yearData = {
        year: yearFolder.name,
        folderId: yearFolder.id,
        months: [] as DriveMonthData[]
      };

      // Get month folders within each year
      const monthFolders = await this.listFolders(yearFolder.id);

      for (const monthFolder of monthFolders) {
        const parsed = this.parseMonthFolder(monthFolder.name);
        if (!parsed) continue;

        const monthData: DriveMonthData = {
          year: parsed.year,
          month: parsed.month,
          monthName: monthFolder.name,
          states: []
        };

        // Get state folders within each month
        const stateFolders = await this.listFolders(monthFolder.id);

        for (const stateFolder of stateFolders) {
          const stateCode = STATE_CODES[stateFolder.name] || stateFolder.name;
          const stateName = STATE_NAMES[stateCode] || stateFolder.name;

          // Get files within each state folder
          const files = await this.listFiles(stateFolder.id);

          const stateFiles: DriveFileInfo[] = files.map(file => {
            const { type, stateCode: fileStateCode } = this.parseFileName(file.name);
            return {
              id: file.id,
              name: file.name,
              mimeType: file.mimeType,
              type,
              month: parsed.month,
              year: parsed.year,
              stateCode: fileStateCode || stateCode
            };
          });

          monthData.states.push({
            code: stateCode,
            name: stateName,
            folderId: stateFolder.id,
            files: stateFiles,
            hasBalanceSheet: stateFiles.some(f => f.type === 'balance_sheet'),
            hasSalesRegister: stateFiles.some(f => f.type === 'sales_register'),
            hasPurchaseRegister: stateFiles.some(f => f.type === 'purchase_register'),
            hasJournalRegister: stateFiles.some(f => f.type === 'journal_register')
          });
        }

        // Only add months that have at least one state with data
        if (monthData.states.length > 0) {
          yearData.months.push(monthData);
        }
      }

      // Sort months chronologically
      yearData.months.sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      });

      if (yearData.months.length > 0) {
        structure.years.push(yearData);
      }
    }

    return structure;
  }

  async getFileContent(fileId: string): Promise<Buffer> {
    if (!this.drive) {
      await this.initialize();
    }

    const response = await this.drive!.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    return Buffer.from(response.data as ArrayBuffer);
  }

  async getFilesForMonth(year: number, month: number, stateCode?: string): Promise<DriveFileInfo[]> {
    const structure = await this.scanFolderStructure();

    const allFiles: DriveFileInfo[] = [];

    for (const yearData of structure.years) {
      for (const monthData of yearData.months) {
        if (monthData.year === year && monthData.month === month) {
          for (const state of monthData.states) {
            if (!stateCode || state.code === stateCode) {
              allFiles.push(...state.files);
            }
          }
        }
      }
    }

    return allFiles;
  }

  setInputsFolderId(folderId: string) {
    this.inputsFolderId = folderId;
  }

  getInputsFolderId(): string {
    return this.inputsFolderId;
  }
}

// Singleton instance
export const googleDriveService = new GoogleDriveService();
