import { Router } from 'express';
import { getExpenseBookingAdvice } from '../services/expenseBookingAdvisor.js';

const router = Router();

router.post('/suggest', async (req, res) => {
  try {
    const { tallyMaster, answers, manualEntry } = req.body || {};

    if (!tallyMaster || typeof tallyMaster !== 'object') {
      return res.status(400).json({ error: 'tallyMaster (JSON object) is required' });
    }
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'answers object is required' });
    }
    if (!manualEntry || typeof manualEntry !== 'object' || typeof manualEntry.description !== 'string' || !manualEntry.description.trim()) {
      return res.status(400).json({ error: 'manualEntry.description is required' });
    }

    const advice = await getExpenseBookingAdvice({
      tallyMaster,
      answers,
      manualEntry: {
        description: String(manualEntry.description).trim(),
        suggestedLedger: manualEntry.suggestedLedger ? String(manualEntry.suggestedLedger) : undefined,
        invoiceNumber: manualEntry.invoiceNumber ? String(manualEntry.invoiceNumber) : undefined,
        invoiceDate: manualEntry.invoiceDate ? String(manualEntry.invoiceDate) : undefined,
        totalAmount: typeof manualEntry.totalAmount === 'number' ? manualEntry.totalAmount : undefined,
        gstAmount: typeof manualEntry.gstAmount === 'number' ? manualEntry.gstAmount : undefined,
        currency: manualEntry.currency ? String(manualEntry.currency) : undefined,
      },
    });
    res.json(advice);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('expense-booking/suggest failed:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
