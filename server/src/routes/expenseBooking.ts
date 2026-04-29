import { Router } from 'express';
import { getExpenseBookingAdvice } from '../services/expenseBookingAdvisor.js';

const router = Router();

router.post('/suggest', async (req, res) => {
  try {
    const { tallyMaster, answers, attachments } = req.body || {};

    if (!tallyMaster || typeof tallyMaster !== 'object') {
      return res.status(400).json({ error: 'tallyMaster (JSON object) is required' });
    }
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'answers object is required' });
    }

    const cleanedAttachments = Array.isArray(attachments)
      ? attachments
          .filter((a) => a && typeof a.data === 'string' && typeof a.mime === 'string')
          .map((a) => ({ data: a.data, mime: a.mime }))
      : [];

    const advice = await getExpenseBookingAdvice({
      tallyMaster,
      answers,
      attachments: cleanedAttachments,
    });
    res.json(advice);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('expense-booking/suggest failed:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
