import type { ComplianceCategoryKey } from './types';

/**
 * Live JSON sources per category.
 *
 * Paste a publicly-readable Google Drive direct-download URL per category below
 * (sharing set to "Anyone with the link \u2192 Viewer") to have the Compliance
 * Calendar re-render from Drive on every page load / focus.
 *
 * Tip on Drive URLs: a file shared via Drive uses a viewer URL like
 *   https://drive.google.com/file/d/<FILE_ID>/view?usp=sharing
 * Convert it to a direct-download URL:
 *   https://drive.google.com/uc?export=download&id=<FILE_ID>
 *
 * If a category has no `driveUrl`, or if the fetch fails (CORS / offline /
 * invalid JSON), we silently fall back to the bundled template at
 *   /data/compliance/<category>.json
 * so the app never breaks even when Drive is unreachable.
 */
export interface CategorySource {
  /** Publicly-readable URL that returns the ComplianceCategory JSON. */
  driveUrl?: string;
}

export const CATEGORY_SOURCES: Record<ComplianceCategoryKey, CategorySource> = {
  accounts: {
    // driveUrl: 'https://drive.google.com/uc?export=download&id=PASTE_FILE_ID',
  },
  admin: {
    // driveUrl: 'https://drive.google.com/uc?export=download&id=PASTE_FILE_ID',
  },
  banking: {
    // driveUrl: 'https://drive.google.com/uc?export=download&id=PASTE_FILE_ID',
  },
  hr: {
    // driveUrl: 'https://drive.google.com/uc?export=download&id=PASTE_FILE_ID',
  },
  investors: {
    // driveUrl: 'https://drive.google.com/uc?export=download&id=PASTE_FILE_ID',
  },
  qc: {
    // driveUrl: 'https://drive.google.com/uc?export=download&id=PASTE_FILE_ID',
  },
  roc: {
    // driveUrl: 'https://drive.google.com/uc?export=download&id=PASTE_FILE_ID',
  },
};
