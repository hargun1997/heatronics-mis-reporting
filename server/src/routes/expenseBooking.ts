import { Router } from 'express';
import { getExpenseBookingAdvice } from '../services/expenseBookingAdvisor.js';

const router = Router();

router.post('/suggest', async (req, res) => {
  try {
    const { tallyMaster, answers, imageBase64, imageMime } = req.body || {};

    if (!tallyMaster || typeof tallyMaster !== 'object') {
      return res.status(400).json({ error: 'tallyMaster (JSON object) is required' });
    }
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'answers object is required' });
    }

    const advice = await getExpenseBookingAdvice({
      tallyMaster,
      answers,
      imageBase64,
      imageMime,
    });
    res.json(advice);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('expense-booking/suggest failed:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
