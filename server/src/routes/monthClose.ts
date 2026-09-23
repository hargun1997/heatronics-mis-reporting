import { Router } from 'express';
import { ledgerVision } from '../services/ledgerVision.js';

const router = Router();

/**
 * Is screenshot ingest available? The dashboard asks on load so it can tell the
 * user to export the xlsx instead of letting them upload images into a void.
 */
router.get('/capabilities', (_req, res) => {
  res.json({ vision: ledgerVision.isConfigured() });
});

/**
 * Read a Tally screen into ledger rows.
 *
 * Body: { imageBase64: string, mimeType: string }
 *
 * Everything returned is unverified by contract — see services/ledgerVision.ts.
 * The client marks each figure accordingly and blocks the close until a human
 * has confirmed them.
 */
router.post('/vision', async (req, res) => {
  const { imageBase64, mimeType } = req.body ?? {};

  if (typeof imageBase64 !== 'string' || !imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required.' });
  }
  if (typeof mimeType !== 'string' || !mimeType.startsWith('image/')) {
    return res.status(400).json({ error: 'mimeType must be an image type.' });
  }

  try {
    const result = await ledgerVision.extract(imageBase64, mimeType);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error reading the image.';
    console.error('month-close vision failed:', message);
    // 502: the failure is upstream (or unconfigured), not the caller's request.
    res.status(502).json({ error: message });
  }
});

export default router;
