import { Router } from 'express';
import { googleDriveService } from '../services/googleDrive.js';

const router = Router();

// Check Drive connection status
router.get('/status', async (req, res) => {
  try {
    const connected = await googleDriveService.initialize();
    res.json({
      connected,
      folderId: googleDriveService.getInputsFolderId()
    });
  } catch (error) {
    res.json({
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Scan folder structure and return available data
router.get('/structure', async (req, res) => {
  try {
    const structure = await googleDriveService.scanFolderStructure();
    res.json(structure);
  } catch (error) {
    console.error('Error scanning Drive structure:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to scan Drive'
    });
  }
});

// Get files for a specific month (optionally filtered by state)
router.get('/files/:year/:month', async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);
    const stateCode = req.query.state as string | undefined;

    if (isNaN(year) || isNaN(month)) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    const files = await googleDriveService.getFilesForMonth(year, month, stateCode);
    res.json({ files });
  } catch (error) {
    console.error('Error getting files:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get files'
    });
  }
});

// Download a specific file
router.get('/download/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const buffer = await googleDriveService.getFileContent(fileId);

    // Set appropriate headers based on file type (determined by query param or detect)
    const fileName = req.query.name as string || 'file';
    const mimeType = req.query.mimeType as string || 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to download file'
    });
  }
});

// Get file content as base64 (for client-side parsing)
router.get('/content/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const buffer = await googleDriveService.getFileContent(fileId);

    res.json({
      content: buffer.toString('base64'),
      size: buffer.length
    });
  } catch (error) {
    console.error('Error getting file content:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get file content'
    });
  }
});

// Update the inputs folder ID (for configuration)
router.post('/config', async (req, res) => {
  try {
    const { folderId } = req.body;
    if (!folderId) {
      return res.status(400).json({ error: 'folderId is required' });
    }

    googleDriveService.setInputsFolderId(folderId);

    // Verify the folder is accessible
    const connected = await googleDriveService.initialize();
    if (!connected) {
      return res.status(400).json({ error: 'Unable to access the specified folder' });
    }

    res.json({ success: true, folderId });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update config'
    });
  }
});

export default router;
