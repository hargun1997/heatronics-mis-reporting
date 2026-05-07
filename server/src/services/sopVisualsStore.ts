import { google, drive_v3, sheets_v4 } from 'googleapis';
import { Readable } from 'stream';

// ---------------------------------------------------------------------------
// SOP Visuals Store
//
// Tiny registry that lets the SOP pages embed photos / GIFs that operators
// upload directly. Everything is owned by this service:
//
//   Google Drive folder:   "Heatronics SOP Visuals"  (created if missing)
//   Google Sheet tab:      "SOP_Visuals_Registry"   (created if missing)
//
// The Sheet acts as the lookup DB. Each row maps an SOP placeholder
// (key + sopPath) to the Drive file. Re-uploads overwrite the same Drive
// file, so an embed URL stays stable while the content updates.
//
// Auth uses the same Application Default Credentials as the rest of the
// server, but requests the broader `drive.file` scope so we can upload.
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

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1CgClltIfhvQMZ9kxQ2MqfcebyZzDoZdg6i2evHAo3JI';
const REGISTRY_TAB = 'SOP_Visuals_Registry';
const HEADERS = ['Key', 'SOP Path', 'Drive File ID', 'MIME Type', 'File Name', 'Last Updated', 'Uploaded By'];
const VISUALS_FOLDER_NAME = 'Heatronics SOP Visuals';
const PARENT_FOLDER_ID = process.env.GOOGLE_DRIVE_INPUTS_FOLDER_ID || '1pvt-FMWuGRkMk5nsO6e9zSHvDcxFlgT_';

class SopVisualsStore {
  private drive: drive_v3.Drive | null = null;
  private sheets: sheets_v4.Sheets | null = null;
  private folderId: string | null = null;
  private initialized = false;

  private async getAuth() {
    return new google.auth.GoogleAuth({
      scopes: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) return true;
    try {
      const auth = await this.getAuth();
      this.drive = google.drive({ version: 'v3', auth });
      this.sheets = google.sheets({ version: 'v4', auth });
      await this.ensureFolder();
      await this.ensureRegistryTab();
      this.initialized = true;
      console.log(`SOP Visuals Store ready · folder=${this.folderId}`);
      return true;
    } catch (e) {
      console.error('Failed to initialize SOP Visuals Store:', e);
      return false;
    }
  }

  /**
   * Look for a folder named "Heatronics SOP Visuals" inside the inputs
   * parent. Create it if absent. We can't see folders we don't own under
   * `drive.file` scope, so the lookup only finds folders this service has
   * created or been granted access to.
   */
  private async ensureFolder(): Promise<void> {
    if (!this.drive) throw new Error('Drive client not initialised');
    const existing = await this.drive.files.list({
      q: `'${PARENT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${VISUALS_FOLDER_NAME}' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 1,
    });
    const found = existing.data.files?.[0];
    if (found?.id) {
      this.folderId = found.id;
      return;
    }
    const created = await this.drive.files.create({
      requestBody: {
        name: VISUALS_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [PARENT_FOLDER_ID],
      },
      fields: 'id',
    });
    this.folderId = created.data.id || null;
    if (!this.folderId) throw new Error('Drive folder creation returned no id');
  }

  /**
   * Make sure the registry tab exists with the right header row. Idempotent
   * — safe to call on every server boot.
   */
  private async ensureRegistryTab(): Promise<void> {
    if (!this.sheets) throw new Error('Sheets client not initialised');
    const meta = await this.sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: 'sheets.properties(title,sheetId)',
    });
    const tab = meta.data.sheets?.find((s) => s.properties?.title === REGISTRY_TAB);
    if (!tab) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [
            { addSheet: { properties: { title: REGISTRY_TAB } } },
          ],
        },
      });
    }
    // Always (re)write the header row — cheap and self-healing.
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${REGISTRY_TAB}!A1:G1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }

  async getRegistry(): Promise<SopVisualEntry[]> {
    await this.initialize();
    if (!this.sheets) throw new Error('Sheets client not initialised');
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${REGISTRY_TAB}!A:G`,
    });
    const rows = response.data.values || [];
    if (rows.length <= 1) return [];
    return rows.slice(1).map((row) => ({
      key: row[0] || '',
      sopPath: row[1] || '',
      driveFileId: row[2] || '',
      mimeType: row[3] || '',
      fileName: row[4] || '',
      lastUpdated: row[5] || '',
      uploadedBy: row[6] || '',
    })).filter((e) => e.key && e.driveFileId);
  }

  getFolderId(): string | null {
    return this.folderId;
  }

  /**
   * Upload a visual against `key`. If a registry row already exists for
   * the key, replace the bytes of the existing Drive file in-place
   * (keeps the fileId stable so embed URLs don't break). Otherwise create
   * a fresh file in the SOP visuals folder and append a new row.
   */
  async uploadVisual(input: {
    key: string;
    sopPath: string;
    fileName: string;
    mimeType: string;
    dataBase64: string;
    uploadedBy?: string;
  }): Promise<SopVisualEntry> {
    await this.initialize();
    if (!this.drive || !this.sheets) throw new Error('Drive/Sheets not initialised');
    if (!this.folderId) throw new Error('Visuals folder not initialised');

    const buffer = Buffer.from(input.dataBase64, 'base64');
    if (buffer.length === 0) throw new Error('Empty file payload');

    // Look up the existing row (if any) so we can decide update vs create.
    const existing = await this.findRow(input.key);
    const lastUpdated = new Date().toISOString();
    const uploadedBy = input.uploadedBy || 'anonymous';

    let driveFileId: string;
    if (existing) {
      // Replace the bytes of the existing file. fileId stays the same.
      driveFileId = existing.entry.driveFileId;
      await this.drive.files.update({
        fileId: driveFileId,
        requestBody: { name: input.fileName, mimeType: input.mimeType },
        media: { mimeType: input.mimeType, body: Readable.from(buffer) },
        fields: 'id',
      });
    } else {
      const created = await this.drive.files.create({
        requestBody: {
          name: input.fileName,
          mimeType: input.mimeType,
          parents: [this.folderId],
        },
        media: { mimeType: input.mimeType, body: Readable.from(buffer) },
        fields: 'id',
      });
      if (!created.data.id) throw new Error('Drive returned no fileId');
      driveFileId = created.data.id;
    }

    const row = [
      input.key,
      input.sopPath,
      driveFileId,
      input.mimeType,
      input.fileName,
      lastUpdated,
      uploadedBy,
    ];
    if (existing) {
      // rowIndex is the 1-based row in the spreadsheet (header is row 1).
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${REGISTRY_TAB}!A${existing.rowIndex}:G${existing.rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      });
    } else {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${REGISTRY_TAB}!A:G`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      });
    }

    return {
      key: input.key,
      sopPath: input.sopPath,
      driveFileId,
      mimeType: input.mimeType,
      fileName: input.fileName,
      lastUpdated,
      uploadedBy,
    };
  }

  /**
   * Find a registry row by key. Returns the entry plus the spreadsheet
   * row number (1-based) so callers can update in place.
   */
  private async findRow(key: string): Promise<{ entry: SopVisualEntry; rowIndex: number } | null> {
    if (!this.sheets) throw new Error('Sheets client not initialised');
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${REGISTRY_TAB}!A:G`,
    });
    const rows = response.data.values || [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] === key && row[2]) {
        return {
          rowIndex: i + 1,
          entry: {
            key: row[0],
            sopPath: row[1] || '',
            driveFileId: row[2],
            mimeType: row[3] || '',
            fileName: row[4] || '',
            lastUpdated: row[5] || '',
            uploadedBy: row[6] || '',
          },
        };
      }
    }
    return null;
  }

  /**
   * Fetch the file bytes for a given key. Returns null if no registry
   * entry exists. We proxy through Drive because the files are owned by
   * this service (drive.file scope) — they aren't publicly fetchable.
   */
  async getFileContent(
    key: string
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string; lastUpdated: string } | null> {
    await this.initialize();
    if (!this.drive) throw new Error('Drive client not initialised');
    const found = await this.findRow(key);
    if (!found) return null;
    const response = await this.drive.files.get(
      { fileId: found.entry.driveFileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    return {
      buffer: Buffer.from(response.data as ArrayBuffer),
      mimeType: found.entry.mimeType || 'application/octet-stream',
      fileName: found.entry.fileName,
      lastUpdated: found.entry.lastUpdated,
    };
  }
}

export const sopVisualsStore = new SopVisualsStore();
