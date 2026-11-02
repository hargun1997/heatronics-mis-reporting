#!/usr/bin/env python3
"""Import the Google Sheet "Heatronics Projection and Deployment Plan" into the MIS planner.

Writes client/src/data/planning/base-plan.json (the planner's Base scenario) and
client/src/data/planning/base-plan-check.json (the sheet's own computed figures, which
server/test/planning.test.ts uses to prove the MIS engine gives the same numbers).

Usage:  python3 scripts/import-projection-plan.py path/to/plan.xlsx
(Download the sheet as .xlsx first: File > Download > Microsoft Excel.)
"""
import json
import sys
from pathlib import Path

import openpyxl

SRC = sys.argv[1]
OUT = Path(__file__).resolve().parent.parent / 'client' / 'src' / 'data' / 'planning'
OUT.mkdir(parents=True, exist_ok=True)

wb = openpyxl.load_workbook(SRC)
wbv = openpyxl.load_workbook(SRC, data_only=True)

CHANNELS = ['A', 'D', 'F', 'G', 'P']
N = 18  # months in the sheet (M1 = Oct-26)


def num(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


# ---- Revenue planning: SKUs, ASPs and the SKU x channel unit grid -------------------
rp = wb['1. Revenue Planning']
skus = []
for i, col in enumerate(range(4, 59, 5)):
    name = rp.cell(62, col).value
    if not name:
        continue
    skus.append({'id': f's{i}', 'name': str(name).strip(), 'asp': num(rp.cell(63, col).value)})

# units[m][sku][channel] = [lastYear, missed, growth]
units = []
for m in range(N):
    base = 65 + 9 * m
    per_sku = []
    for i in range(len(skus)):
        col0 = 4 + 5 * i
        per_ch = []
        for c in range(5):
            per_ch.append([num(rp.cell(base + k, col0 + c).value) for k in range(3)])
        per_sku.append(per_ch)
    units.append(per_sku)

# ---- Expense calendar: every line with its driver ------------------------------------
ec = wb['2. Expense Calendar']
SECTION_ROWS = {'REVEX': 'revex', 'OPEX': 'opex', 'CAPEX': 'capex', 'FINEX': 'finex'}
lines, groups = [], []
section, group = None, None
for r in range(2, 388):
    a, b = ec.cell(r, 1).value, ec.cell(r, 2).value
    if not a:
        continue
    a = str(a).strip()
    if a in SECTION_ROWS:
        section = SECTION_ROWS[a]
        continue
    if a.startswith('TOTAL '):
        continue
    if not b:  # a grey heading row
        group = a
        groups.append({'name': a, 'section': section})
        continue
    lines.append({
        'id': f'e{r}',
        'name': a,
        'section': section,
        'group': group,
        'type': str(b).strip(),
        'amount': num(ec.cell(r, 3).value),
        'start': int(num(ec.cell(r, 4).value) or 1),
        'end': int(num(ec.cell(r, 5).value)) if ec.cell(r, 5).value not in (None, '') else None,
        'theme': ec.cell(r, 6).value or None,
        'milestone': ec.cell(r, 7).value or None,
    })

# ---- Cash flow & fundraise inputs -----------------------------------------------------
cf = wb['4. Cash Flow & Fundraise']
row = lambda r: [num(cf.cell(r, 3 + m).value) for m in range(N)]
cash = {
    'outputGst': num(cf['C3'].value),
    'inputGstGoods': num(cf['C4'].value),
    'inputGstServices': num(cf['C5'].value),
    'refundLagMonths': int(num(cf['C6'].value)),
    'gstWriteOffPct': num(cf['C19'].value),
    'gmStandard': num(cf['C26'].value),
    'inventoryDays': num(cf['C29'].value),
    'openingInventory': num(cf['C30'].value),
    'receivableDays': num(cf['C34'].value),
    'payableDays': num(cf['C36'].value),
    'interestRate': num(cf['C42'].value),
    # rate changes inside the sheet's months, e.g. the venture-debt blend from Jun-27
    'interestSteps': [],
    'openingDebt': num(cf['C43'].value),
    'openingCash': num(cf['C68'].value),
    'contingencyPct': num(cf['D76'].value),
    'taxRate': num(wb['3. P&L']['C51'].value),
}
prev = cash['interestRate']
for m in range(1, N):
    v = cf.cell(42, 3 + m).value
    rate = num(v) if not (isinstance(v, str) and v.startswith('=')) else None
    if rate is None:
        rate = num(wbv['4. Cash Flow & Fundraise'].cell(42, 3 + m).value)
    if abs(rate - prev) > 1e-9:
        cash['interestSteps'].append({'month': m + 1, 'rate': rate})
        prev = rate
events = []
for m in range(N):
    for kind, r in (('debtDrawn', 44), ('debtRepaid', 45), ('equity', 64)):
        v = num(cf.cell(r, 3 + m).value)
        if v:
            events.append({'id': f'{kind}{m + 1}', 'kind': kind, 'month': m + 1, 'amount': v, 'note': ''})

# ---- Business Plan + Overview: words and the few inputs they hold -------------------
bp, ov = wbv['Business Plan'], wbv['Overview']
assumptions, risks = [], []
for r in range(39, 52):
    a, v, b = (bp.cell(r, c).value for c in (1, 2, 3))
    if a:
        assumptions.append({'id': f'a{r}', 'assumption': str(a), 'value': str(v or ''), 'basis': str(b or '')})
for r in range(53, 70):
    k = bp.cell(r, 1).value
    mit = next((bp.cell(r, c).value for c in range(2, 9) if bp.cell(r, c).value), '')
    if k:
        risks.append({'id': f'r{r}', 'risk': str(k), 'mitigation': str(mit or '')})
themes, theme = [], None
for r in range(12, 41):
    t, ms, mm = ov.cell(r, 1).value, ov.cell(r, 3).value, ov.cell(r, 9).value
    if t:
        theme = str(t).strip()
    if ms:
        themes.append({'id': f't{r}', 'theme': theme, 'milestone': str(ms).strip(), 'month': int(num(mm) or 1)})
team = []
for r in range(12, 41):
    cells = [str(ov.cell(r, c).value).strip() for c in range(14, 25) if ov.cell(r, c).value not in (None, '')]
    if cells:
        team.append(' → '.join(cells))
business = {
    'assumptions': assumptions,
    'risks': risks,
    'themes': themes,
    'team': '\n'.join(team),
    'contingency12': num(cf['C76'].value),
    # Exit ARR (Revenue Planning K54): revenue of the 3 months before the plan's 12M exit, a year earlier (Jul–Sep '26 actual)
    'exitPriorL3M': num(rp['K54'].value),
    'exitGrowthCap': 2.0,
}

plan = {
    'version': 1,
    'source': 'Heatronics Projection and Deployment Plan (Google Sheet 1j75EvRvD5mX-SSBNiwr_Lu2uhjmD-21SOpIRQz3RVUE)',
    'startMonth': '2026-10',
    'channels': CHANNELS,
    'skus': skus,
    'units': units,
    'groups': groups,
    'lines': lines,
    'cash': cash,
    'events': events,
    'business': business,
}
(OUT / 'base-plan.json').write_text(json.dumps(plan, separators=(',', ':')))

# ---- The sheet's own results, for the parity test -------------------------------------
pv, cv = wbv['3. P&L'], wbv['4. Cash Flow & Fundraise']
pl_row = lambda r: [num(pv.cell(r, 3 + m).value) for m in range(N)]
cf_row = lambda r: [num(cv.cell(r, 3 + m).value) for m in range(N)]
check = {
    'netRevenue': pl_row(5), 'grossProfit': pl_row(11), 'cm1': pl_row(16), 'cm2': pl_row(20),
    'cm3': pl_row(23), 'ebitda': pl_row(41), 'pbt': pl_row(49), 'pat': pl_row(52),
    'gstAsset': cf_row(23), 'inventory': cf_row(32), 'nwc': cf_row(39), 'netCashFlow': cf_row(61),
    'cumulativeCash': cf_row(62), 'closingCash': cf_row(69),
    'peakDeficit12Cr': num(cv['C73'].value), 'peakDeficit18Cr': num(cv['D73'].value),
    'equityRequired18Cr': num(cv['D79'].value),
    'equityRequired12Cr': num(cv['C79'].value),
    'exitArr12Cr': num(wbv['1. Revenue Planning']['K57'].value),
    'exitArr18Cr': num(wbv['1. Revenue Planning']['L57'].value),
    'deploymentByTheme18': {str(ov.cell(r, 2).value): num(ov.cell(r, 22).value) for r in range(79, 87)},
    'deploymentByTheme12': {str(ov.cell(r, 2).value): num(ov.cell(r, 21).value) for r in range(79, 87)},
    'gstClaimable': cf_row(16), 'gstRefund': cf_row(17), 'gstStuck': cf_row(18),
}
(OUT / 'base-plan-check.json').write_text(json.dumps(check, indent=0))
print(f'{len(skus)} SKUs, {len(lines)} expense lines, {len(events)} cash events -> {OUT}')
