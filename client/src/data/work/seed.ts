// One-time seed for the unified Tasks page: turns the old Tasks & Compliance
// lists (public/data/compliance/*.json plus any edits saved in this browser)
// and the progress ticked in this browser into server-side tasks. The server
// adds the Ownership upload assignments itself. Each task is linked to the
// Accounts Handbook section that explains how to do it, where one exists.

import { ALL_CATEGORIES, type ComplianceCategoryKey, type ComplianceItem } from '../compliance/types';
import { getAllProgress, loadCategory } from '../compliance/storage';
import type { WorkState, WorkTask } from './workClient';

export const AREA_BY_CATEGORY: Record<ComplianceCategoryKey, string> = {
  operations: 'Daily & monthly books',
  accounts: 'GST, TDS & tax',
  hr: 'HR & payroll',
  mca: 'MCA / ROC',
  legal: 'Legal & licences',
  iso: 'ISO / QMS',
  investors: 'Investors',
  admin: 'Admin',
};

/** Handbook section (anchor id) that explains each task. */
const HOW_TO: Record<string, string> = {
  'ops-d1-tranzact-to-tally': 'c14-d1-tranzact',
  'ops-d2-shopify-easebuzz': 'c14-d2-shopify-easebuzz',
  'ops-w1-weekly-checks': 'c15',
  'ops-m1-amazon-reports': 'c16-m1-amazon',
  'ops-m2-shiprocket-cod': 'c16-m2-shiprocket',
  'ops-m3-snapmint': 'c16-m3-snapmint',
  'ops-m4-platform-invoices-jv': 'c16-m4-platform-invoices',
  'ops-m5-banks-statutory-close': 'c16-m5-close',
  'ops-q-26q-form16a': 'c8',
  'acc-gstr1': 'c7',
  'acc-gstr3b': 'c7',
  'acc-gstr2b-recon': 'c7',
  'acc-tds-payment': 'c8',
  'acc-tcs-payment': 'c8',
  'acc-tds-return-q': 'c8',
  'acc-mis-close': 'c10',
  'acc-gstr9': 'c7',
  'hr-tds-salary': 'c8',
  'adm-courier-recon': 'c16-m2-shiprocket',
  'adm-asset-physical': 'c26',
  'acc-advance-tax': 'c8',
  'acc-tax-audit': 'c12',
  'acc-itr-filing': 'c12',
  'inv-audited-financials': 'c12',
  'hr-salary-disbursement': 'c9',
};

/** Extra references shown on the task (and in emails), besides its "how to". */
const LINKS: Record<string, { label: string; url: string }[]> = {
  'ops-d1-tranzact-to-tally': [{ label: 'Tranzact: B2B, offline and purchases', url: '/handbook#c4' }],
  'ops-m1-amazon-reports': [
    { label: 'Amazon chapter', url: '/handbook#c6' },
    { label: 'Monthly Amazon expense JV', url: '/handbook#c6-monthly-jv' },
  ],
  'ops-m5-banks-statutory-close': [
    { label: 'Month-end close', url: '/handbook#c10' },
    { label: 'Banks', url: '/handbook#c9' },
  ],
  'acc-gstr1': [{ label: 'GST monthly cycle', url: '/handbook#c7-monthly-cycle' }, { label: 'GST portal', url: 'https://www.gst.gov.in/' }],
  'acc-gstr3b': [{ label: 'GST monthly cycle', url: '/handbook#c7-monthly-cycle' }, { label: 'GST portal', url: 'https://www.gst.gov.in/' }],
  'acc-gstr2b-recon': [{ label: 'GST monthly cycle', url: '/handbook#c7-monthly-cycle' }],
  'acc-gstr9': [{ label: 'GST portal', url: 'https://www.gst.gov.in/' }],
  'acc-tds-payment': [{ label: 'TIN / OLTAS payment', url: 'https://www.incometax.gov.in/' }],
  'acc-tds-return-q': [{ label: 'TRACES', url: 'https://www.tdscpc.gov.in/' }],
  'ops-q-26q-form16a': [{ label: 'TRACES', url: 'https://www.tdscpc.gov.in/' }],
  'acc-itr-filing': [{ label: 'Income-tax e-filing', url: 'https://www.incometax.gov.in/' }],
  'acc-mis-close': [{ label: 'Live MIS', url: '/reporting/mis/live' }, { label: 'Upload data', url: '/reporting/mis/ingest' }],
  'inv-monthly-update': [{ label: 'Live MIS', url: '/reporting/mis/live' }],
  'hr-pf-challan': [{ label: 'EPFO employer portal', url: 'https://unifiedportal-emp.epfindia.gov.in/' }],
  'hr-esi-challan': [{ label: 'ESIC portal', url: 'https://www.esic.gov.in/' }],
  'mca-aoc4': [{ label: 'MCA portal', url: 'https://www.mca.gov.in/' }],
  'mca-mgt7': [{ label: 'MCA portal', url: 'https://www.mca.gov.in/' }],
  'mca-dir3-kyc': [{ label: 'MCA portal', url: 'https://www.mca.gov.in/' }],
  'mca-dpt3': [{ label: 'MCA portal', url: 'https://www.mca.gov.in/' }],
  'mca-msme-1': [{ label: 'MCA portal', url: 'https://www.mca.gov.in/' }],
  'leg-msme-udyam': [{ label: 'Udyam portal', url: 'https://udyamregistration.gov.in/' }],
  'adm-ewaybill-check': [{ label: 'E-way bill portal', url: 'https://ewaybillgst.gov.in/' }],
};

/** Clearer titles for the daily/monthly book-keeping tasks (match the Handbook). */
const TITLES: Record<string, string> = {
  'ops-d1-tranzact-to-tally': 'D1 · Push Tranzact documents to Tally',
  'ops-d2-shopify-easebuzz': 'D2 · Import Shopify orders and Easebuzz payouts',
  'ops-w1-weekly-checks': 'W1 · Check the control ledgers',
  'ops-m1-amazon-reports': 'M1 · Import Amazon reports (MTR, STR, Settlement)',
  'ops-m2-shiprocket-cod': 'M2 · Import Shiprocket COD remittances',
  'ops-m3-snapmint': 'M3 · Import Snapmint settlements',
  'ops-m4-platform-invoices-jv': 'M4 · Book platform invoices and the Amazon expense JV',
  'ops-m5-banks-statutory-close': 'M5 · Banks, statutory dates and close',
  'ops-q-26q-form16a': 'Q · 26Q, Form 16A and Amazon TDS refunds',
};

const taskId = (cat: string, id: string) => `cmp-${cat}-${id}`;

function toTask(cat: ComplianceCategoryKey, it: ComplianceItem): Partial<WorkTask> {
  const weekly = it.frequency === 'weekly';
  return {
    id: taskId(cat, it.id),
    title: TITLES[it.id] ?? it.title,
    area: AREA_BY_CATEGORY[cat],
    description: it.description,
    ownerIds: [],
    roleLabel: it.owner,
    howTo: HOW_TO[it.id],
    links: [
      ...(it.referenceUrl && it.referenceUrl !== `/handbook#${HOW_TO[it.id]}` ? [{ label: it.reference?.replace(/^Handbook · /, '') || 'Reference', url: it.referenceUrl }] : []),
      ...(LINKS[it.id] ?? []),
    ].filter((l, i, a) => a.findIndex((x) => x.url === l.url) === i),
    form: it.form,
    authority: it.authority,
    penalty: it.penalty,
    notes: it.notes,
    cadence: it.frequency,
    dueDay: weekly ? undefined : it.dueDay,
    dueWeekday: weekly ? it.dueDay || 1 : undefined,
    months: it.months,
    dueMonth: it.dueMonth,
    active: true,
    source: `compliance:${cat}`,
  };
}

/** Build the seed: every compliance item + whatever was ticked in this browser. */
export async function buildSeed(): Promise<{ tasks: Partial<WorkTask>[]; done: WorkState['done'] }> {
  const cats = await Promise.all(ALL_CATEGORIES.map((c) => loadCategory(c).then((d) => [c, d] as const)));
  const tasks: Partial<WorkTask>[] = [];
  const freq = new Map<string, string>();
  for (const [cat, d] of cats) {
    for (const it of d.items) {
      tasks.push(toTask(cat, it));
      freq.set(it.id, `${cat}|${it.frequency}`);
    }
  }
  // Old progress was one tick per item per month ("YYYY-MM").
  const done: WorkState['done'] = {};
  const progress = getAllProgress();
  for (const [itemId, months] of Object.entries(progress)) {
    const f = freq.get(itemId);
    if (!f) continue;
    const [cat, cadence] = f.split('|');
    if (cadence === 'daily' || cadence === 'weekly') continue; // can't be mapped to a day/week
    for (const [ym, e] of Object.entries(months)) {
      if (!e.completed) continue;
      const period = cadence === 'yearly' ? ym.slice(0, 4) : cadence === 'one-time' ? 'once' : ym;
      ((done[taskId(cat, itemId)] ??= {})[period] = { at: e.completedAt ?? new Date().toISOString(), note: e.note });
    }
  }
  return { tasks, done };
}
