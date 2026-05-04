import { Router } from 'express';
import { getExpenseBookingAdvice } from '../services/expenseBookingAdvisor.js';

const router = Router();

router.post('/suggest', async (req, res) => {
  try {
    const { tallyMaster, answers, manualEntry, attachments } = req.body || {};

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

    const cleanedManualEntry =
      manualEntry && typeof manualEntry === 'object'
        ? {
            description: typeof manualEntry.description === 'string' ? manualEntry.description.trim() : '',
            invoiceNumber: manualEntry.invoiceNumber ? String(manualEntry.invoiceNumber) : undefined,
            invoiceDate: manualEntry.invoiceDate ? String(manualEntry.invoiceDate) : undefined,
            totalAmount: typeof manualEntry.totalAmount === 'number' ? manualEntry.totalAmount : undefined,
            gstAmount: typeof manualEntry.gstAmount === 'number' ? manualEntry.gstAmount : undefined,
            currency: manualEntry.currency ? String(manualEntry.currency) : undefined,
          }
        : undefined;

    if (!cleanedManualEntry && cleanedAttachments.length === 0) {
      return res.status(400).json({
        error: 'Provide either manualEntry (description + party + billing details) or at least one invoice attachment',
      });
    }

    const advice = await getExpenseBookingAdvice({
      tallyMaster,
      answers,
      manualEntry: cleanedManualEntry,
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
