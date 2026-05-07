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

export default router;
