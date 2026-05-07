import { Router } from 'express';
import { sopVisualsStore } from '../services/sopVisualsStore.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const entries = await sopVisualsStore.getRegistry();
    res.json({ entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('sop-visuals list failed:', message);
    res.status(500).json({ error: message });
  }
});

router.post('/upload', async (req, res) => {
  try {
    const { key, sopPath, fileName, mimeType, dataBase64, uploadedBy } = req.body || {};
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'key is required' });
    }
    if (!sopPath || typeof sopPath !== 'string') {
      return res.status(400).json({ error: 'sopPath is required' });
    }
    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({ error: 'fileName is required' });
    }
    if (!mimeType || typeof mimeType !== 'string') {
      return res.status(400).json({ error: 'mimeType is required' });
    }
    if (!dataBase64 || typeof dataBase64 !== 'string') {
      return res.status(400).json({ error: 'dataBase64 is required' });
    }

    const entry = await sopVisualsStore.uploadVisual({
      key: key.trim(),
      sopPath: sopPath.trim(),
      fileName: fileName.trim(),
      mimeType: mimeType.trim(),
      dataBase64,
      uploadedBy: typeof uploadedBy === 'string' ? uploadedBy.trim() : undefined,
    });
    res.json({ entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('sop-visuals upload failed:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
