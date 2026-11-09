// GET /api/tds?month=YYYY-MM — what TDS planning (/accounts/tds) needs, READ ONLY from the stored Tally Day Books + masters
// (services/tdsFeed.ts). Never asks Tally: "Pull Tally now" on Tally health refreshes the copies.
import { Router, type Request, type Response } from 'express';
import { readBooks, readBooksState, readMasters } from '../connectors/tally/bookStore.js';
import { tdsFeed, tdsMonths } from '../services/tdsFeed.js';

const router = Router();
const MONTH = /^\d{4}-\d{2}$/;

router.get('/', (req: Request, res: Response) => {
  const month = String(req.query.month || '');
  if (!MONTH.test(month)) return void res.status(400).json({ error: 'month=YYYY-MM' });
  (async () => {
    const months = tdsMonths(month);
    const [docs, masters, state] = await Promise.all([Promise.all(months.map(readBooks)), readMasters(), readBooksState()]);
    const have = docs.filter((d): d is NonNullable<typeof d> => !!d);
    const feed = tdsFeed(have.flatMap((d) => d.vouchers), masters?.ledgers ?? []);
    res.json({
      month,
      months,
      storedMonths: have.map((d) => d.period),
      asOf: Object.fromEntries(have.map((d) => [d.period, state.months[d.period] ?? d.asOf])),
      mastersAt: masters?.asOf ?? null,
      ...feed,
    });
  })().catch((err: unknown) => { if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'Error.' }); });
});

export default router;
