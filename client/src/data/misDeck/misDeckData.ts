// AUTO-GENERATED from MIS-Sheet_FINAL_channels.xlsx (extracted 2026-06-19).
// Do not edit by hand. Regenerate via the extraction script if the source workbook changes.
// All monetary values are in INR (₹). Margin percentages are fractions (0.59 = 59%).
//
// NOTE: FY 2025-26 is restated to tie to the company's provisional Profit & Loss A/c as on
// 31-03-2026 (Heatronics Medical Devices Pvt Ltd). The Jan/Feb/Mar 2026 months — which used
// volatile actual-consumption COGM — are smoothed so the full year reconciles: COGM ₹2.35 Cr
// (GM 59.7%), EBITDA ≈ -₹0.97 L (breakeven), depreciation (₹12.91 L) + interest (₹9.00 L)
// below EBITDA, Net Loss -₹22.88 L. Apr-Dec 2025 are unchanged.
//
// NOTE: May 2026 — the ₹28.30 L "One-Time (Business Development)" charge was reclassified
// from Non-Operating into Operating Expenses. It is an operating cost (none of Interest/
// Tax/Depreciation/Amortization), so it belongs above the EBITDA line per the strict EBITDA
// definition. EBITDA is therefore ₹2.39 L (= Net Income pre-dep), not ₹30.69 L. Net Income
// is unchanged. Apr 2026's below-EBITDA item is genuine Interest Expense and stays put.
// The upstream workbook sheets ("May 2026", "FY 2026-27") still show the old placement.

export const SALES_CHANNELS = ['D2C', 'Amazon', 'Blinkit', 'OEM', 'Offline', 'Export'] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

export interface MonthlyMIS {
  key: string;
  label: string;
  month: number;
  year: number;
  netByChannel: Partial<Record<SalesChannel, number>>;
  grossByChannel: Partial<Record<SalesChannel, number>>;
  returnsByChannel: Partial<Record<SalesChannel, number>>;
  totalGrossRevenue: number;
  totalReturns: number;
  totalTaxes: number;
  netRevenue: number;
  interBranch: number;
  turnover: number;
  grossMargin: number;
  cm1: number;
  cm2: number;
  cm3: number;
  ebitda: number;
  netIncome: number;
  cogm: number;
  channelFulfillment: number;
  salesMarketing: number;
  platformCosts: number;
  opex: number;
  nonOperating: number;
  cogmLines: Record<string, number>;
  opexLines: Record<string, number>;
  /** Present when the month was restated to tie to an external statement. */
  restated?: string;
}

export interface FYSummary {
  name: string;
  netRevenue: number;
  mix: Record<SalesChannel, number>;
  grossMarginPct: number;
  ebitdaPct: number;
  netIncomePct: number;
}

export const MIS_SOURCE_FILE = "MIS-Sheet_FINAL_channels.xlsx";
export const MIS_GENERATED_AT = "2026-06-19";

export const MONTHLY_MIS: MonthlyMIS[] = [
  {
    "key": "2023-12",
    "label": "Dec 2023",
    "month": 12,
    "year": 2023,
    "netByChannel": {
      "Amazon": 77908,
      "OEM": 3635681,
      "Offline": 1236373
    },
    "grossByChannel": {
      "Amazon": 77908,
      "OEM": 3635681,
      "Offline": 1236373
    },
    "returnsByChannel": {},
    "totalGrossRevenue": 4949962,
    "totalReturns": 0,
    "totalTaxes": -244569.37,
    "netRevenue": 4705392.63,
    "interBranch": 0,
    "turnover": 4705392.63,
    "grossMargin": 1520645.07,
    "cm1": 1508568.07,
    "cm2": 1415348.63,
    "cm3": 1415348.63,
    "ebitda": 701168.92,
    "netIncome": 677224.92,
    "cogmLines": {
      "Raw Materials & Inventory": -2642017.56,
      "Consumables": -4180,
      "Factory Maintenance": -29885,
      "Inbound Transport": -1200,
      "Job work": -380681,
      "Manufacturing Wages": -126784,
      "TOTAL COGM": -542730
    },
    "opexLines": {
      "Legal & CA expenses": -64500,
      "Banks & Finance Charges": 1,
      "Other Operating Expenses": -26614.21,
      "Miscellaneous (Travel, insurance)": -18290,
      "Staff Welfare & Events": -46593,
      "Salaries (Admin Mgmt)": -299809,
      "Administrative Expenses": -170374.5,
      "Salaries Director": -88000,
      "TOTAL OPERATING EXPENSES": -714179.71
    },
    "cogm": 3184747.56,
    "channelFulfillment": 12077,
    "salesMarketing": 93219.44,
    "platformCosts": 0,
    "opex": 714179.71,
    "nonOperating": 23944
  },
  {
    "key": "2024-01",
    "label": "Jan 2024",
    "month": 1,
    "year": 2024,
    "netByChannel": {
      "Amazon": 73008.5,
      "OEM": 3744150.5,
      "Offline": 440590
    },
    "grossByChannel": {
      "Amazon": 73008.5,
      "OEM": 3852932.5,
      "Offline": 440590
    },
    "returnsByChannel": {
      "OEM": -108782
    },
    "totalGrossRevenue": 4366531,
    "totalReturns": -108782,
    "totalTaxes": -213845.54,
    "netRevenue": 4043903.46,
    "interBranch": 0,
    "turnover": 4043903.46,
    "grossMargin": 1350731.08,
    "cm1": 1349411.08,
    "cm2": 1236687.27,
    "cm3": 1236687.27,
    "ebitda": 429503.57,
    "netIncome": 405784.57,
    "cogmLines": {
      "Raw Materials & Inventory": -2270599.88,
      "Consumables": -5660,
      "Factory Maintenance": -32419,
      "Inbound Transport": -2450,
      "Job work": -221922.5,
      "Manufacturing Wages": -160121,
      "TOTAL COGM": -422572.5
    },
    "opexLines": {
      "Legal & CA expenses": -141550,
      "Banks & Finance Charges": -4.14,
      "Other Operating Expenses": -60707.33,
      "Miscellaneous (Travel, insurance)": -22440,
      "Salaries (Admin Mgmt)": -332735,
      "Administrative Expenses": -159517.23,
      "Salaries Director": -88000,
      "Staff Welfare & Events": -2230,
      "TOTAL OPERATING EXPENSES": -807183.7
    },
    "cogm": 2693172.38,
    "channelFulfillment": 1320,
    "salesMarketing": 112723.81,
    "platformCosts": 0,
    "opex": 807183.7,
    "nonOperating": 23719
  },
  {
    "key": "2024-02",
    "label": "Feb 2024",
    "month": 2,
    "year": 2024,
    "netByChannel": {
      "Amazon": 265411.4,
      "OEM": 2943969,
      "Offline": 44206.2
    },
    "grossByChannel": {
      "Amazon": 278944.4,
      "OEM": 2943969,
      "Offline": 44206.2
    },
    "returnsByChannel": {
      "Amazon": -13533
    },
    "totalGrossRevenue": 3267119.6,
    "totalReturns": -13533,
    "totalTaxes": -167284.71,
    "netRevenue": 3086301.89,
    "interBranch": 0,
    "turnover": 3086301.89,
    "grossMargin": 1004904.74,
    "cm1": 984950.74,
    "cm2": 800320.16,
    "cm3": 800320.16,
    "ebitda": 135878.83,
    "netIncome": 112385.83,
    "cogmLines": {
      "Raw Materials & Inventory": -1732918.89,
      "Consumables": -7465,
      "Factory Maintenance": -31905,
      "Inbound Transport": -1200,
      "Job work": -187128.26,
      "Manufacturing Wages": -120780,
      "TOTAL COGM": -348478.26
    },
    "opexLines": {
      "Legal & CA expenses": -8500,
      "Banks & Finance Charges": -525.8,
      "Other Operating Expenses": -39953.87,
      "Miscellaneous (Travel, insurance)": -36030,
      "Salaries (Admin Mgmt)": -322636,
      "Administrative Expenses": -152581.66,
      "Salaries Director": -88000,
      "Staff Welfare & Events": -16214,
      "TOTAL OPERATING EXPENSES": -664441.33
    },
    "cogm": 2081397.15,
    "channelFulfillment": 19954,
    "salesMarketing": 184630.58,
    "platformCosts": 0,
    "opex": 664441.33,
    "nonOperating": 23493
  },
  {
    "key": "2024-03",
    "label": "Mar 2024",
    "month": 3,
    "year": 2024,
    "netByChannel": {
      "Amazon": 639299,
      "OEM": 977132,
      "Offline": 36944
    },
    "grossByChannel": {
      "Amazon": 639299,
      "OEM": 999081,
      "Offline": 55424
    },
    "returnsByChannel": {
      "OEM": -21949,
      "Offline": -18480
    },
    "totalGrossRevenue": 1693804,
    "totalReturns": -40429,
    "totalTaxes": -77631.68,
    "netRevenue": 1575743.32,
    "interBranch": 0,
    "turnover": 1575743.32,
    "grossMargin": 220584.47,
    "cm1": 219719.47,
    "cm2": -63793.88,
    "cm3": -63793.88,
    "ebitda": -553592.49,
    "netIncome": -1964858.49,
    "cogmLines": {
      "Raw Materials & Inventory": -884759.65,
      "Consumables": -2425.2,
      "Factory Maintenance": -27454,
      "Inbound Transport": -5100,
      "Job work": -290420,
      "Manufacturing Wages": -145000,
      "TOTAL COGM": -470399.2
    },
    "opexLines": {
      "Legal & CA expenses": -126412,
      "Other Operating Expenses": -32786.99,
      "Miscellaneous (Travel, insurance)": -15100,
      "Salaries (Admin Mgmt)": -64827,
      "Administrative Expenses": -157801.35,
      "Salaries Director": -88000,
      "Staff Welfare & Events": -4871.27,
      "TOTAL OPERATING EXPENSES": -489798.61
    },
    "cogm": 1355158.85,
    "channelFulfillment": 865,
    "salesMarketing": 283513.35,
    "platformCosts": 0,
    "opex": 489798.61,
    "nonOperating": 1411266
  },
  {
    "key": "2024-04",
    "label": "Apr 2024",
    "month": 4,
    "year": 2024,
    "netByChannel": {
      "Amazon": 797709,
      "OEM": 94814,
      "Offline": 28330
    },
    "grossByChannel": {
      "Amazon": 834242,
      "OEM": 159075,
      "Offline": 28330
    },
    "returnsByChannel": {
      "Amazon": -36533,
      "OEM": -64261
    },
    "totalGrossRevenue": 1021647,
    "totalReturns": -100794,
    "totalTaxes": -43849.97,
    "netRevenue": 877003.03,
    "interBranch": 0,
    "turnover": 877003.03,
    "grossMargin": 423267.79,
    "cm1": 414862.79,
    "cm2": 74355.09,
    "cm3": 74355.09,
    "ebitda": -593399.9,
    "netIncome": -616234.9,
    "cogmLines": {
      "Raw Materials & Inventory": -271592.24,
      "Consumables": -7655,
      "Factory Maintenance": -27901,
      "Job work": -146587,
      "TOTAL COGM": -182143
    },
    "opexLines": {
      "Other Operating Expenses": -18261.78,
      "Salaries (Admin Mgmt)": -443190,
      "Administrative Expenses": -159606.21,
      "Legal & CA expenses": -39500,
      "Staff Welfare & Events": -7197,
      "TOTAL OPERATING EXPENSES": -667754.99
    },
    "cogm": 453735.24,
    "channelFulfillment": 8405,
    "salesMarketing": 340507.7,
    "platformCosts": 0,
    "opex": 667754.99,
    "nonOperating": 22835
  },
  {
    "key": "2024-05",
    "label": "May 2024",
    "month": 5,
    "year": 2024,
    "netByChannel": {
      "Amazon": 1007102,
      "OEM": 395930,
      "Offline": 59469
    },
    "grossByChannel": {
      "Amazon": 1065173,
      "OEM": 397505,
      "Offline": 59469
    },
    "returnsByChannel": {
      "Amazon": -58071,
      "OEM": -1575
    },
    "totalGrossRevenue": 1522147,
    "totalReturns": -59646,
    "totalTaxes": -69463.76,
    "netRevenue": 1393037.24,
    "interBranch": 0,
    "turnover": 1393037.24,
    "grossMargin": 819907.43,
    "cm1": 804532.43,
    "cm2": 328050.12,
    "cm3": 328050.12,
    "ebitda": -357289.37,
    "netIncome": -383763.37,
    "cogmLines": {
      "Raw Materials & Inventory": -431398.86,
      "Consumables": -9485,
      "Factory Maintenance": -31845,
      "Inbound Transport": -3300,
      "Job work": -97100.95,
      "TOTAL COGM": -141730.95
    },
    "opexLines": {
      "Legal & CA expenses": -170122,
      "Banks & Finance Charges": -224.5,
      "Other Operating Expenses": -12707.31,
      "Salaries (Admin Mgmt)": -267920,
      "Administrative Expenses": -188626.68,
      "Staff Welfare & Events": -45739,
      "TOTAL OPERATING EXPENSES": -685339.49
    },
    "cogm": 573129.81,
    "channelFulfillment": 15375,
    "salesMarketing": 476482.31,
    "platformCosts": 0,
    "opex": 685339.49,
    "nonOperating": 26474
  },
  {
    "key": "2024-06",
    "label": "Jun 2024",
    "month": 6,
    "year": 2024,
    "netByChannel": {
      "Amazon": 1333719,
      "OEM": 359625,
      "Offline": 388876
    },
    "grossByChannel": {
      "Amazon": 1377296,
      "OEM": 359625,
      "Offline": 388876
    },
    "returnsByChannel": {
      "Amazon": -43577
    },
    "totalGrossRevenue": 2125797,
    "totalReturns": -43577,
    "totalTaxes": -99153.36,
    "netRevenue": 1983066.64,
    "interBranch": 0,
    "turnover": 1983066.64,
    "grossMargin": 1135867.17,
    "cm1": 1127332.17,
    "cm2": 587736.34,
    "cm3": 587736.34,
    "ebitda": -13458.22,
    "netIncome": -48122.22,
    "cogmLines": {
      "Raw Materials & Inventory": -614120.47,
      "Consumables": -3980,
      "Factory Maintenance": -55889,
      "Inbound Transport": -600,
      "Job work": -172610,
      "TOTAL COGM": -233079
    },
    "opexLines": {
      "Banks & Finance Charges": -63506.42,
      "Other Operating Expenses": -25312.24,
      "Salaries (Admin Mgmt)": -279331,
      "Miscellaneous (Travel, insurance)": -43619,
      "Legal & CA expenses": -7500,
      "Administrative Expenses": -173915.9,
      "Staff Welfare & Events": -8010,
      "TOTAL OPERATING EXPENSES": -601194.56
    },
    "cogm": 847199.47,
    "channelFulfillment": 8535,
    "salesMarketing": 539595.83,
    "platformCosts": 0,
    "opex": 601194.56,
    "nonOperating": 34664
  },
  {
    "key": "2024-07",
    "label": "Jul 2024",
    "month": 7,
    "year": 2024,
    "netByChannel": {
      "Amazon": 1505791,
      "OEM": 641424,
      "Offline": 90315
    },
    "grossByChannel": {
      "Amazon": 1599824,
      "OEM": 656250,
      "Offline": 90315
    },
    "returnsByChannel": {
      "Amazon": -94033,
      "OEM": -14826
    },
    "totalGrossRevenue": 2346389,
    "totalReturns": -108859,
    "totalTaxes": -106531.72,
    "netRevenue": 2130998.28,
    "interBranch": 0,
    "turnover": 2130998.28,
    "grossMargin": 1314722.01,
    "cm1": 1315088.01,
    "cm2": 587294.21,
    "cm3": 587294.21,
    "ebitda": 66207.63,
    "netIncome": 25205.63,
    "cogmLines": {
      "Raw Materials & Inventory": -659932.27,
      "Consumables": -2000,
      "Factory Maintenance": -39231,
      "Inbound Transport": -3700,
      "Job work": -107413,
      "Manufacturing Wages": -4000,
      "TOTAL COGM": -156344
    },
    "opexLines": {
      "Banks & Finance Charges": -38.39,
      "Other Operating Expenses": -18550.93,
      "Miscellaneous (Travel, insurance)": -4457.23,
      "Salaries (Admin Mgmt)": -263873,
      "Legal & CA expenses": -7500,
      "Administrative Expenses": -217351.03,
      "Staff Welfare & Events": -9316,
      "TOTAL OPERATING EXPENSES": -521086.58
    },
    "cogm": 816276.27,
    "channelFulfillment": -366,
    "salesMarketing": 727793.8,
    "platformCosts": 0,
    "opex": 521086.58,
    "nonOperating": 41002
  },
  {
    "key": "2024-08",
    "label": "Aug 2024",
    "month": 8,
    "year": 2024,
    "netByChannel": {
      "Amazon": 1737774,
      "OEM": 707469,
      "Offline": 395727
    },
    "grossByChannel": {
      "Amazon": 1810228,
      "OEM": 795375,
      "Offline": 395727
    },
    "returnsByChannel": {
      "Amazon": -72454,
      "OEM": -87906
    },
    "totalGrossRevenue": 3001330,
    "totalReturns": -160360,
    "totalTaxes": -133230.55,
    "netRevenue": 2707739.45,
    "interBranch": 438650,
    "turnover": 3146389.45,
    "grossMargin": 1747738.69,
    "cm1": 1741517.69,
    "cm2": 960529.63,
    "cm3": 960529.63,
    "ebitda": 395588.33,
    "netIncome": 348710.33,
    "cogmLines": {
      "Raw Materials & Inventory": -838538.76,
      "Consumables": -4470,
      "Factory Maintenance": -39892,
      "Inbound Transport": -1100,
      "Job work": -72000,
      "Manufacturing Wages": -4000,
      "TOTAL COGM": -121462
    },
    "opexLines": {
      "Banks & Finance Charges": -174.7,
      "Administrative Expenses": -182203.04,
      "Salaries (Admin Mgmt)": -250692,
      "Legal & CA expenses": -101250,
      "Other Operating Expenses": -22323.56,
      "Staff Welfare & Events": -1230,
      "Miscellaneous (Travel, insurance)": -7068,
      "TOTAL OPERATING EXPENSES": -564941.3
    },
    "cogm": 960000.76,
    "channelFulfillment": 6221,
    "salesMarketing": 780988.06,
    "platformCosts": 0,
    "opex": 564941.3,
    "nonOperating": 46878
  },
  {
    "key": "2024-09",
    "label": "Sep 2024",
    "month": 9,
    "year": 2024,
    "netByChannel": {
      "Amazon": 2626819,
      "OEM": 713466,
      "Offline": 678640
    },
    "grossByChannel": {
      "Amazon": 3185126,
      "OEM": 714096,
      "Offline": 683487
    },
    "returnsByChannel": {
      "Amazon": -558307,
      "OEM": -630,
      "Offline": -4847
    },
    "totalGrossRevenue": 4582709,
    "totalReturns": -563784,
    "totalTaxes": -191455.12,
    "netRevenue": 3827469.88,
    "interBranch": 558880,
    "turnover": 4386349.88,
    "grossMargin": 2507887.52,
    "cm1": 2499788.52,
    "cm2": 1404438.94,
    "cm3": 1404438.94,
    "ebitda": 547452.72,
    "netIncome": 497279.72,
    "cogmLines": {
      "Raw Materials & Inventory": -1185299.36,
      "Consumables": -8430,
      "Inbound Transport": -1850,
      "Job work": -100003,
      "Manufacturing Wages": -5000,
      "Factory Maintenance": -19000,
      "TOTAL COGM": -134283
    },
    "opexLines": {
      "Banks & Finance Charges": -400,
      "Other Operating Expenses": -43087.67,
      "Administrative Expenses": -254434.55,
      "Salaries (Admin Mgmt)": -447317,
      "Miscellaneous (Travel, insurance)": -7795,
      "Legal & CA expenses": -100500,
      "Staff Welfare & Events": -3452,
      "TOTAL OPERATING EXPENSES": -856986.22
    },
    "cogm": 1319582.36,
    "channelFulfillment": 8099,
    "salesMarketing": 1095349.58,
    "platformCosts": 0,
    "opex": 856986.22,
    "nonOperating": 50173
  },
  {
    "key": "2024-10",
    "label": "Oct 2024",
    "month": 10,
    "year": 2024,
    "netByChannel": {
      "Amazon": 2569738,
      "OEM": 653197,
      "Offline": 788165
    },
    "grossByChannel": {
      "Amazon": 3097554,
      "OEM": 760902,
      "Offline": 792172
    },
    "returnsByChannel": {
      "Amazon": -527816,
      "OEM": -107705,
      "Offline": -4007
    },
    "totalGrossRevenue": 4650628,
    "totalReturns": -639528,
    "totalTaxes": -190969.97,
    "netRevenue": 3820130.03,
    "interBranch": 361329,
    "turnover": 4181459.03,
    "grossMargin": 2449079.49,
    "cm1": 1891051.53,
    "cm2": 1231467.94,
    "cm3": 1231467.94,
    "ebitda": 405859.02,
    "netIncome": 353451.02,
    "cogmLines": {
      "Raw Materials & Inventory": -1183026.34,
      "Consumables": -6630.8,
      "Factory Maintenance": -38375,
      "Inbound Transport": -4780,
      "Job work": -133238.4,
      "Manufacturing Wages": -5000,
      "TOTAL COGM": -188024.2
    },
    "opexLines": {
      "Other Operating Expenses": -30561.03,
      "Banks & Finance Charges": 22455.11,
      "Miscellaneous (Travel, insurance)": -24744,
      "Staff Welfare & Events": -56928,
      "Salaries (Admin Mgmt)": -477559,
      "Legal & CA expenses": -78880,
      "Administrative Expenses": -179392,
      "TOTAL OPERATING EXPENSES": -825608.92
    },
    "cogm": 1371050.54,
    "channelFulfillment": 558027.96,
    "salesMarketing": 659583.59,
    "platformCosts": 0,
    "opex": 825608.92,
    "nonOperating": 52408
  },
  {
    "key": "2024-11",
    "label": "Nov 2024",
    "month": 11,
    "year": 2024,
    "netByChannel": {
      "Amazon": 3649254.76,
      "OEM": 474338,
      "Offline": 924240
    },
    "grossByChannel": {
      "Amazon": 4301583,
      "OEM": 474338,
      "Offline": 936572
    },
    "returnsByChannel": {
      "Amazon": -652328.24,
      "Offline": -12332
    },
    "totalGrossRevenue": 5712493,
    "totalReturns": -664660.24,
    "totalTaxes": -240372.97,
    "netRevenue": 4807459.79,
    "interBranch": 823931,
    "turnover": 5631390.79,
    "grossMargin": 3209323.99,
    "cm1": 2322582.75,
    "cm2": 1524981.53,
    "cm3": 1524910.84,
    "ebitda": 639997.33,
    "netIncome": 586409.33,
    "cogmLines": {
      "Raw Materials & Inventory": -1488784.8,
      "Consumables": -4568,
      "Factory Maintenance": -33705,
      "Inbound Transport": -4130,
      "Job work": -61948,
      "Manufacturing Wages": -5000,
      "TOTAL COGM": -109351
    },
    "opexLines": {
      "Other Operating Expenses": -31940.75,
      "Banks & Finance Charges": -100,
      "Administrative Expenses": -222942.76,
      "Legal & CA expenses": -140450,
      "Miscellaneous (Travel, insurance)": -26803,
      "Salaries (Admin Mgmt)": -457911,
      "Staff Welfare & Events": -4766,
      "TOTAL OPERATING EXPENSES": -884913.51
    },
    "cogm": 1598135.8,
    "channelFulfillment": 886741.24,
    "salesMarketing": 797601.22,
    "platformCosts": 70.69,
    "opex": 884913.51,
    "nonOperating": 53588
  },
  {
    "key": "2024-12",
    "label": "Dec 2024",
    "month": 12,
    "year": 2024,
    "netByChannel": {
      "D2C": 51165.05,
      "Amazon": 4894333,
      "OEM": 698911,
      "Offline": 1590143
    },
    "grossByChannel": {
      "D2C": 51165.05,
      "Amazon": 5696766,
      "OEM": 735703,
      "Offline": 1602169
    },
    "returnsByChannel": {
      "Amazon": -802433,
      "OEM": -36792,
      "Offline": -12026
    },
    "totalGrossRevenue": 8085803.05,
    "totalReturns": -851251,
    "totalTaxes": -345975.83,
    "netRevenue": 6888576.22,
    "interBranch": 442916,
    "turnover": 7331492.22,
    "grossMargin": 4505184.46,
    "cm1": 3453974.19,
    "cm2": 2268527.18,
    "cm3": 2262454.08,
    "ebitda": 1232280.83,
    "netIncome": 1176913.83,
    "cogmLines": {
      "Raw Materials & Inventory": -2133269.55,
      "Consumables": -2270,
      "Factory Maintenance": -28535,
      "Inbound Transport": -11017.26,
      "Job work": -188299.95,
      "Manufacturing Wages": -20000,
      "TOTAL COGM": -250122.21
    },
    "opexLines": {
      "Legal & CA expenses": -85641.8,
      "Other Operating Expenses": -22052,
      "Banks & Finance Charges": -1418,
      "Administrative Expenses": -273015.45,
      "Salaries (Admin Mgmt)": -556328,
      "Staff Welfare & Events": -11664,
      "Miscellaneous (Travel, insurance)": -80054,
      "TOTAL OPERATING EXPENSES": -1030173.25
    },
    "cogm": 2383391.76,
    "channelFulfillment": 1051210.27,
    "salesMarketing": 1185447.01,
    "platformCosts": 6073.1,
    "opex": 1030173.25,
    "nonOperating": 55367
  },
  {
    "key": "2025-01",
    "label": "Jan 2025",
    "month": 1,
    "year": 2025,
    "netByChannel": {
      "D2C": 59384.23,
      "Amazon": 4033197,
      "OEM": 216941,
      "Offline": 936585
    },
    "grossByChannel": {
      "D2C": 62274.23,
      "Amazon": 4968587,
      "OEM": 220117,
      "Offline": 960306
    },
    "returnsByChannel": {
      "D2C": -2890,
      "Amazon": -935390,
      "OEM": -3176,
      "Offline": -23721
    },
    "totalGrossRevenue": 6211284.23,
    "totalReturns": -965177,
    "totalTaxes": -249800.51,
    "netRevenue": 4996306.72,
    "interBranch": 438544,
    "turnover": 5434850.72,
    "grossMargin": 3235630.09,
    "cm1": 2366970.4,
    "cm2": 895671.26,
    "cm3": 894329.25,
    "ebitda": 267629.16,
    "netIncome": 208642.16,
    "cogmLines": {
      "Raw Materials & Inventory": -1547267.34,
      "Factory Maintenance": -30130,
      "Inbound Transport": -9519.69,
      "Job work": -143759.6,
      "Manufacturing Wages": -30000,
      "TOTAL COGM": -213409.29
    },
    "opexLines": {
      "Other Operating Expenses": -19910.62,
      "Banks & Finance Charges": -35433.59,
      "Miscellaneous (Travel, insurance)": -50186,
      "Salaries (Admin Mgmt)": -333223,
      "Legal & CA expenses": -7500,
      "Administrative Expenses": -176404.88,
      "Staff Welfare & Events": -4042,
      "TOTAL OPERATING EXPENSES": -626700.09
    },
    "cogm": 1760676.63,
    "channelFulfillment": 868659.69,
    "salesMarketing": 1471299.14,
    "platformCosts": 1342.01,
    "opex": 626700.09,
    "nonOperating": 58987
  },
  {
    "key": "2025-02",
    "label": "Feb 2025",
    "month": 2,
    "year": 2025,
    "netByChannel": {
      "D2C": 93009.22,
      "Amazon": 985914,
      "Blinkit": 28971,
      "OEM": 306794,
      "Offline": 817487
    },
    "grossByChannel": {
      "D2C": 94259.22,
      "Amazon": 1174729,
      "Blinkit": 28971,
      "OEM": 319725,
      "Offline": 822197
    },
    "returnsByChannel": {
      "D2C": -1250,
      "Amazon": -188815,
      "OEM": -12931,
      "Offline": -4710
    },
    "totalGrossRevenue": 2439881.22,
    "totalReturns": -207706,
    "totalTaxes": -106294.19,
    "netRevenue": 2125881.03,
    "interBranch": 525676,
    "turnover": 2651557.03,
    "grossMargin": 1290380.48,
    "cm1": 1027647.73,
    "cm2": 665164.05,
    "cm3": 662885.77,
    "ebitda": 11354.65,
    "netIncome": -44038.35,
    "cogmLines": {
      "Raw Materials & Inventory": -658347.55,
      "Consumables": -5700,
      "Factory Maintenance": -29243,
      "Inbound Transport": -900,
      "Job work": -51310,
      "Manufacturing Wages": -90000,
      "TOTAL COGM": -177153
    },
    "opexLines": {
      "Other Operating Expenses": -16085.28,
      "Banks & Finance Charges": -55275,
      "Administrative Expenses": -191964.93,
      "Legal & CA expenses": -33489.8,
      "Miscellaneous (Travel, insurance)": -46356.11,
      "Salaries (Admin Mgmt)": -307300,
      "Staff Welfare & Events": -1060,
      "TOTAL OPERATING EXPENSES": -651531.12
    },
    "cogm": 835500.55,
    "channelFulfillment": 262732.75,
    "salesMarketing": 362483.68,
    "platformCosts": 2278.28,
    "opex": 651531.12,
    "nonOperating": 55393
  },
  {
    "key": "2025-03",
    "label": "Mar 2025",
    "month": 3,
    "year": 2025,
    "netByChannel": {
      "D2C": 69038.59,
      "Amazon": 945378,
      "Blinkit": 168445,
      "OEM": 55854,
      "Offline": 1295708
    },
    "grossByChannel": {
      "D2C": 69038.59,
      "Amazon": 1080217,
      "Blinkit": 168445,
      "OEM": 165375,
      "Offline": 1386835
    },
    "returnsByChannel": {
      "Amazon": -134839,
      "OEM": -109521,
      "Offline": -91127
    },
    "totalGrossRevenue": 2869910.59,
    "totalReturns": -335487,
    "totalTaxes": -141052.25,
    "netRevenue": 2393371.34,
    "interBranch": 1813321,
    "turnover": 4206692.34,
    "grossMargin": 1479346.22,
    "cm1": 1176351.07,
    "cm2": 794065.54,
    "cm3": 792274.36,
    "ebitda": 118176.88,
    "netIncome": -1551510.12,
    "cogmLines": {
      "Raw Materials & Inventory": -741184.54,
      "Consumables": -8165,
      "Factory Maintenance": -25285,
      "Inbound Transport": -7265.58,
      "Job work": -23125,
      "Manufacturing Wages": -109000,
      "TOTAL COGM": -172840.58
    },
    "opexLines": {
      "Legal & CA expenses": -117647,
      "Other Operating Expenses": -41886.25,
      "Banks & Finance Charges": -2647,
      "Administrative Expenses": -211636.48,
      "Salaries (Admin Mgmt)": -267482,
      "Miscellaneous (Travel, insurance)": -29898.75,
      "Staff Welfare & Events": -2900,
      "TOTAL OPERATING EXPENSES": -674097.48
    },
    "cogm": 914025.12,
    "channelFulfillment": 302995.15,
    "salesMarketing": 382285.53,
    "platformCosts": 1791.18,
    "opex": 674097.48,
    "nonOperating": 1669687
  },
  {
    "key": "2025-04",
    "label": "Apr 2025",
    "month": 4,
    "year": 2025,
    "netByChannel": {
      "D2C": 7020.7,
      "Amazon": 994655,
      "Blinkit": 395989,
      "OEM": 494288,
      "Offline": 47300
    },
    "grossByChannel": {
      "D2C": 7020.7,
      "Amazon": 1095299,
      "Blinkit": 395989,
      "OEM": 494288,
      "Offline": 47300
    },
    "returnsByChannel": {
      "Amazon": -100644
    },
    "totalGrossRevenue": 2039896.7,
    "totalReturns": -100644,
    "totalTaxes": -92345.27,
    "netRevenue": 1846907.43,
    "interBranch": 1008186,
    "turnover": 2855093.43,
    "grossMargin": 1075570.25,
    "cm1": 639501.88,
    "cm2": 331140.13,
    "cm3": 330964.6,
    "ebitda": -421383.55,
    "netIncome": -473862.55,
    "cogmLines": {
      "Raw Materials & Inventory": -684014.68,
      "Factory Maintenance": -26192,
      "Inbound Transport": -4400,
      "Job work": -56730.5,
      "TOTAL COGM": -87322.5
    },
    "opexLines": {
      "Legal & CA expenses": -43300,
      "Banks & Finance Charges": -35641,
      "Salaries (Admin Mgmt)": -368943,
      "Administrative Expenses": -221385.08,
      "Other Operating Expenses": -52512.07,
      "Staff Welfare & Events": -2178,
      "Miscellaneous (Travel, insurance)": -28389,
      "TOTAL OPERATING EXPENSES": -752348.15
    },
    "cogm": 771337.18,
    "channelFulfillment": 436068.37,
    "salesMarketing": 308361.75,
    "platformCosts": 175.53,
    "opex": 752348.15,
    "nonOperating": 52479
  },
  {
    "key": "2025-05",
    "label": "May 2025",
    "month": 5,
    "year": 2025,
    "netByChannel": {
      "D2C": 4476.9,
      "Amazon": 1577343.28,
      "Blinkit": 290096,
      "OEM": 148223,
      "Offline": 136931
    },
    "grossByChannel": {
      "D2C": 4476.9,
      "Amazon": 1749235.47,
      "Blinkit": 290096,
      "OEM": 198975,
      "Offline": 158981
    },
    "returnsByChannel": {
      "Amazon": -171892.19,
      "OEM": -50752,
      "Offline": -22050
    },
    "totalGrossRevenue": 2401764.37,
    "totalReturns": -244694.19,
    "totalTaxes": -102717.61,
    "netRevenue": 2054352.57,
    "interBranch": 1311192,
    "turnover": 3365544.57,
    "grossMargin": 1175702.68,
    "cm1": 598770.45,
    "cm2": 198177.18,
    "cm3": 192477.48,
    "ebitda": -429904.02,
    "netIncome": -488232.02,
    "cogmLines": {
      "Raw Materials & Inventory": -760843.39,
      "Consumables": -3700,
      "Factory Maintenance": -36363,
      "Inbound Transport": -5581,
      "Job work": -62162.5,
      "Manufacturing Wages": -10000,
      "TOTAL COGM": -117806.5
    },
    "opexLines": {
      "Legal & CA expenses": -65750,
      "Other Operating Expenses": -16689.87,
      "Banks & Finance Charges": -6556.62,
      "Salaries (Admin Mgmt)": -314803,
      "Miscellaneous (Travel, insurance)": -45695,
      "Administrative Expenses": -170089.01,
      "Staff Welfare & Events": -2798,
      "TOTAL OPERATING EXPENSES": -622381.5
    },
    "cogm": 878649.89,
    "channelFulfillment": 576932.23,
    "salesMarketing": 400593.27,
    "platformCosts": 5699.7,
    "opex": 622381.5,
    "nonOperating": 58328
  },
  {
    "key": "2025-06",
    "label": "Jun 2025",
    "month": 6,
    "year": 2025,
    "netByChannel": {
      "Amazon": 1816526.58,
      "Blinkit": 289060,
      "OEM": 559448,
      "Offline": 305027
    },
    "grossByChannel": {
      "Amazon": 1985134.48,
      "Blinkit": 295489,
      "OEM": 559448,
      "Offline": 305027
    },
    "returnsByChannel": {
      "Amazon": -168607.9,
      "Blinkit": -6429
    },
    "totalGrossRevenue": 3145098.48,
    "totalReturns": -175036.9,
    "totalTaxes": -142937.74,
    "netRevenue": 2827123.84,
    "interBranch": 1226143,
    "turnover": 4053266.84,
    "grossMargin": 1674411.38,
    "cm1": 1026407.74,
    "cm2": 537880.37,
    "cm3": 530997.68,
    "ebitda": -145514.38,
    "netIncome": -208103.38,
    "cogmLines": {
      "Raw Materials & Inventory": -1047044.46,
      "Consumables": -5325,
      "Factory Maintenance": -35790,
      "Inbound Transport": -4651,
      "Job work": -49902,
      "Manufacturing Wages": -10000,
      "TOTAL COGM": -105668
    },
    "opexLines": {
      "Legal & CA expenses": -49000,
      "Other Operating Expenses": -57922.59,
      "Banks & Finance Charges": -204,
      "Salaries (Admin Mgmt)": -353455,
      "Miscellaneous (Travel, insurance)": -37810,
      "Administrative Expenses": -176630.47,
      "Staff Welfare & Events": -1490,
      "TOTAL OPERATING EXPENSES": -676512.06
    },
    "cogm": 1152712.46,
    "channelFulfillment": 648003.64,
    "salesMarketing": 488527.37,
    "platformCosts": 6882.69,
    "opex": 676512.06,
    "nonOperating": 62589
  },
  {
    "key": "2025-07",
    "label": "Jul 2025",
    "month": 7,
    "year": 2025,
    "netByChannel": {
      "Amazon": 2901090.4,
      "Blinkit": 493808,
      "OEM": 906570,
      "Offline": 233019
    },
    "grossByChannel": {
      "Amazon": 3190013.04,
      "Blinkit": 507546,
      "OEM": 906570,
      "Offline": 233019
    },
    "returnsByChannel": {
      "Amazon": -288922.64,
      "Blinkit": -13738
    },
    "totalGrossRevenue": 4837148.04,
    "totalReturns": -302660.64,
    "totalTaxes": -223223.55,
    "netRevenue": 4311263.85,
    "interBranch": 1097986,
    "turnover": 5409249.85,
    "grossMargin": 2571653.35,
    "cm1": 1792128.42,
    "cm2": 994056.09,
    "cm3": 993908.99,
    "ebitda": 143100.14,
    "netIncome": 78241.14,
    "cogmLines": {
      "Raw Materials & Inventory": -1596705.77,
      "Consumables": -1200,
      "Factory Maintenance": -36773,
      "Inbound Transport": -33258.73,
      "Job work": -71673,
      "TOTAL COGM": -142904.73
    },
    "opexLines": {
      "Legal & CA expenses": -67250,
      "Other Operating Expenses": -68114.13,
      "Banks & Finance Charges": -2611.94,
      "Salaries (Admin Mgmt)": -374803,
      "Administrative Expenses": -321155.78,
      "Staff Welfare & Events": -3312,
      "Miscellaneous (Travel, insurance)": -13562,
      "TOTAL OPERATING EXPENSES": -850808.85
    },
    "cogm": 1739610.5,
    "channelFulfillment": 779524.93,
    "salesMarketing": 798072.33,
    "platformCosts": 147.1,
    "opex": 850808.85,
    "nonOperating": 64859
  },
  {
    "key": "2025-08",
    "label": "Aug 2025",
    "month": 8,
    "year": 2025,
    "netByChannel": {
      "D2C": 62330.03,
      "Amazon": 2068213.89,
      "Blinkit": 331197,
      "OEM": 616429,
      "Offline": 217412
    },
    "grossByChannel": {
      "D2C": 62330.03,
      "Amazon": 2291375.08,
      "Blinkit": 340341,
      "OEM": 678799,
      "Offline": 275774
    },
    "returnsByChannel": {
      "Amazon": -223161.19,
      "Blinkit": -9144,
      "OEM": -62370,
      "Offline": -58362
    },
    "totalGrossRevenue": 3648619.11,
    "totalReturns": -353037.19,
    "totalTaxes": -162778.47,
    "netRevenue": 3132803.45,
    "interBranch": 1161826,
    "turnover": 4294629.45,
    "grossMargin": 1845054.97,
    "cm1": 1255680.22,
    "cm2": 638629.43,
    "cm3": 638229.64,
    "ebitda": -123857.25,
    "netIncome": -186931.25,
    "cogmLines": {
      "Raw Materials & Inventory": -1160254.98,
      "Factory Maintenance": -41327,
      "Inbound Transport": -37337.5,
      "Job work": -48829,
      "TOTAL COGM": -127493.5
    },
    "opexLines": {
      "Legal & CA expenses": -62150,
      "Other Operating Expenses": -33765.96,
      "Banks & Finance Charges": -11.8,
      "Salaries (Admin Mgmt)": -424800,
      "Miscellaneous (Travel, insurance)": -20865,
      "Administrative Expenses": -211596.13,
      "Staff Welfare & Events": -8898,
      "TOTAL OPERATING EXPENSES": -762086.89
    },
    "cogm": 1287748.48,
    "channelFulfillment": 589374.75,
    "salesMarketing": 617050.79,
    "platformCosts": 399.79,
    "opex": 762086.89,
    "nonOperating": 63074
  },
  {
    "key": "2025-09",
    "label": "Sep 2025",
    "month": 9,
    "year": 2025,
    "netByChannel": {
      "D2C": 840103.48,
      "Amazon": 2660072.3,
      "Blinkit": 953626,
      "OEM": 2539114,
      "Offline": 729063.36
    },
    "grossByChannel": {
      "D2C": 840103.48,
      "Amazon": 2952296.44,
      "Blinkit": 953626,
      "OEM": 2539114,
      "Offline": 876924.36
    },
    "returnsByChannel": {
      "Amazon": -292224.14,
      "Offline": -147861
    },
    "totalGrossRevenue": 8162064.28,
    "totalReturns": -440085.14,
    "totalTaxes": -370349.11,
    "netRevenue": 7351630.03,
    "interBranch": 1637809,
    "turnover": 8989439.03,
    "grossMargin": 4437815.63,
    "cm1": 3730818.09,
    "cm2": 2616680.52,
    "cm3": 2615690.94,
    "ebitda": 1761573.41,
    "netIncome": 1698768.41,
    "cogmLines": {
      "Raw Materials & Inventory": -2722725.98,
      "Factory Maintenance": -38250,
      "Inbound Transport": -47218.42,
      "Job work": -105620,
      "TOTAL COGM": -191088.42
    },
    "opexLines": {
      "Other Operating Expenses": -23187.11,
      "Banks & Finance Charges": -738,
      "Administrative Expenses": -199143.18,
      "Salaries (Admin Mgmt)": -559350,
      "Legal & CA expenses": -51400,
      "Miscellaneous (Travel, insurance)": -13860.41,
      "Staff Welfare & Events": -6438.83,
      "TOTAL OPERATING EXPENSES": -854117.53
    },
    "cogm": 2913814.4,
    "channelFulfillment": 706997.54,
    "salesMarketing": 1114137.57,
    "platformCosts": 989.58,
    "opex": 854117.53,
    "nonOperating": 62805
  },
  {
    "key": "2025-10",
    "label": "Oct 2025",
    "month": 10,
    "year": 2025,
    "netByChannel": {
      "D2C": 2191261,
      "Amazon": 2619468.32,
      "Blinkit": 39493,
      "OEM": 320696,
      "Offline": 303282.95
    },
    "grossByChannel": {
      "D2C": 2191261,
      "Amazon": 2938665.87,
      "Blinkit": 39493,
      "OEM": 320696,
      "Offline": 310416.95
    },
    "returnsByChannel": {
      "Amazon": -319197.55,
      "Offline": -7134
    },
    "totalGrossRevenue": 5800532.82,
    "totalReturns": -326331.55,
    "totalTaxes": -263152.46,
    "netRevenue": 5211048.81,
    "interBranch": 1248540,
    "turnover": 6459588.81,
    "grossMargin": 3080993.66,
    "cm1": 2392148.33,
    "cm2": 547382.83,
    "cm3": 542732.11,
    "ebitda": -355267.74,
    "netIncome": -419823.74,
    "cogmLines": {
      "Raw Materials & Inventory": -1929947.22,
      "Consumables": -2500,
      "Factory Maintenance": -45426,
      "Inbound Transport": -62861.93,
      "Job work": -80320,
      "Manufacturing Wages": -9000,
      "TOTAL COGM": -200107.93
    },
    "opexLines": {
      "Legal & CA expenses": -17000,
      "Other Operating Expenses": -22153,
      "Banks & Finance Charges": -2375.48,
      "Administrative Expenses": -213803.97,
      "Staff Welfare & Events": -85213.92,
      "Salaries (Admin Mgmt)": -541274,
      "Miscellaneous (Travel, insurance)": -16179.48,
      "TOTAL OPERATING EXPENSES": -897999.85
    },
    "cogm": 2130055.15,
    "channelFulfillment": 688845.33,
    "salesMarketing": 1844765.5,
    "platformCosts": 4650.72,
    "opex": 897999.85,
    "nonOperating": 64556
  },
  {
    "key": "2025-11",
    "label": "Nov 2025",
    "month": 11,
    "year": 2025,
    "netByChannel": {
      "D2C": 4735385,
      "Amazon": 2255134.01,
      "OEM": 354243,
      "Offline": 576241.54
    },
    "grossByChannel": {
      "D2C": 4735385,
      "Amazon": 2579894.56,
      "OEM": 388500,
      "Offline": 646220.54
    },
    "returnsByChannel": {
      "Amazon": -324760.55,
      "OEM": -34257,
      "Offline": -69979
    },
    "totalGrossRevenue": 8350000.1,
    "totalReturns": -428996.55,
    "totalTaxes": -377190.76,
    "netRevenue": 7543812.79,
    "interBranch": 239998,
    "turnover": 7783810.79,
    "grossMargin": 4413727.13,
    "cm1": 3744317.75,
    "cm2": 1854131.91,
    "cm3": 1708808.49,
    "ebitda": 616133.83,
    "netIncome": 567428.83,
    "cogmLines": {
      "Raw Materials & Inventory": -2793902.17,
      "Factory Maintenance": -32959,
      "Inbound Transport": -181164.99,
      "Job work": -122059.5,
      "TOTAL COGM": -336183.49
    },
    "opexLines": {
      "Other Operating Expenses": -71221.17,
      "Administrative Expenses": -198179.49,
      "Staff Welfare & Events": -35521,
      "Salaries (Admin Mgmt)": -681318,
      "Legal & CA expenses": -93900,
      "Miscellaneous (Travel, insurance)": -12535,
      "TOTAL OPERATING EXPENSES": -1092674.66
    },
    "cogm": 3130085.66,
    "channelFulfillment": 669409.38,
    "salesMarketing": 1890185.84,
    "platformCosts": 145323.42,
    "opex": 1092674.66,
    "nonOperating": 48705
  },
  {
    "key": "2025-12",
    "label": "Dec 2025",
    "month": 12,
    "year": 2025,
    "netByChannel": {
      "D2C": 5812674,
      "Amazon": 1495789.59,
      "Blinkit": 277948,
      "OEM": 113321,
      "Offline": 1101898.55
    },
    "grossByChannel": {
      "D2C": 5812674,
      "Amazon": 1750438.79,
      "Blinkit": 277948,
      "OEM": 137550,
      "Offline": 1131304.55
    },
    "returnsByChannel": {
      "Amazon": -254649.2,
      "OEM": -24229,
      "Offline": -29406
    },
    "totalGrossRevenue": 9109915.34,
    "totalReturns": -308284.2,
    "totalTaxes": -419125.45,
    "netRevenue": 8382505.69,
    "interBranch": 883800,
    "turnover": 9266305.69,
    "grossMargin": 4722271.82,
    "cm1": 4205745.12,
    "cm2": 2138540.15,
    "cm3": 2040170.15,
    "ebitda": 779756.74,
    "netIncome": 748396.74,
    "cogmLines": {
      "Raw Materials & Inventory": -3104517.76,
      "Consumables": -6560,
      "Factory Maintenance": -30951,
      "Inbound Transport": -335372.66,
      "Job work": -182832.45,
      "TOTAL COGM": -555716.11
    },
    "opexLines": {
      "Banks & Finance Charges": -30048.93,
      "Other Operating Expenses": -36350.61,
      "Administrative Expenses": -325216.69,
      "Miscellaneous (Travel, insurance)": -5171.18,
      "Staff Welfare & Events": -12606,
      "Salaries (Admin Mgmt)": -777720,
      "Legal & CA expenses": -73300,
      "TOTAL OPERATING EXPENSES": -1260413.41
    },
    "cogm": 3660233.87,
    "channelFulfillment": 516526.7,
    "salesMarketing": 2067204.97,
    "platformCosts": 98370,
    "opex": 1260413.41,
    "nonOperating": 31360
  },
  {
    "key": "2026-01",
    "label": "Jan 2026",
    "month": 1,
    "year": 2026,
    "netByChannel": {
      "D2C": 5483911.46,
      "Amazon": 405623.9,
      "Blinkit": -107305.01,
      "OEM": 722977.05,
      "Offline": 596669.77,
      "Export": 22702.95
    },
    "grossByChannel": {
      "D2C": 5483911.46,
      "Amazon": 548278.37,
      "OEM": 722977.05,
      "Offline": 669197.7,
      "Export": 22702.95
    },
    "returnsByChannel": {
      "Amazon": -142654.47,
      "Blinkit": -107305.01,
      "Offline": -72527.93
    },
    "totalGrossRevenue": 6986868.99,
    "totalReturns": -302559,
    "totalTaxes": -317286.27,
    "netRevenue": 6786395.4,
    "interBranch": 78000,
    "turnover": 6445023.72,
    "grossMargin": 4245801.91,
    "cm1": 3755193.77,
    "cm2": 1213605.38,
    "cm3": 1213605.38,
    "ebitda": -831741.98,
    "netIncome": -1560039.99,
    "cogmLines": {
      "Raw Materials & Inventory": -6452228.28,
      "Factory Maintenance": -32728,
      "Inbound Transport": -7750,
      "Job work": -53072.25,
      "TOTAL COGM": -6545778.53
    },
    "opexLines": {
      "Banks & Finance Charges": -1180,
      "Other Operating Expenses": -38535.21,
      "Administrative Expenses": -313364.04,
      "Miscellaneous (Travel, insurance)": -11844.19,
      "Staff Welfare & Events": -9866,
      "Salaries (Admin Mgmt)": -85000,
      "Legal & CA expenses": -107500,
      "TOTAL OPERATING EXPENSES": -567289.44
    },
    "cogm": 2540593.49,
    "channelFulfillment": 490608.14,
    "salesMarketing": 2541588.39,
    "platformCosts": 0,
    "opex": 2045347.36,
    "nonOperating": 728298.01,
    "restated": "FY2025-26 anchored to provisional P&L (31-03-2026)"
  },
  {
    "key": "2026-02",
    "label": "Feb 2026",
    "month": 2,
    "year": 2026,
    "netByChannel": {
      "D2C": 3515381.29,
      "Amazon": 315057.61,
      "Blinkit": -31038.02,
      "OEM": 1025982.56,
      "Offline": 200736.22
    },
    "grossByChannel": {
      "D2C": 3515381.29,
      "Amazon": 363768.12,
      "Blinkit": 139287.4,
      "OEM": 1045881.21,
      "Offline": 267220.69
    },
    "returnsByChannel": {
      "Amazon": -48710.51,
      "Blinkit": -170325.42,
      "OEM": -19898.66,
      "Offline": -66484.47
    },
    "totalGrossRevenue": 5002071.27,
    "totalReturns": -286545.4,
    "totalTaxes": -224548.97,
    "netRevenue": 4786780.5,
    "interBranch": 277240,
    "turnover": 4768216.9,
    "grossMargin": 2994774.19,
    "cm1": 2648723.99,
    "cm2": 856015.93,
    "cm3": 856015.93,
    "ebitda": -586668.77,
    "netIncome": -1100373.39,
    "cogmLines": {
      "Raw Materials & Inventory": -1146878.43,
      "Factory Maintenance": -36364,
      "Inbound Transport": -4200,
      "Job work": -52150,
      "TOTAL COGM": -1239592.43
    },
    "opexLines": {
      "Banks & Finance Charges": -5000,
      "Other Operating Expenses": -43464.98,
      "Administrative Expenses": -736790.79,
      "Staff Welfare & Events": -5426,
      "Salaries (Admin Mgmt)": -680502,
      "Legal & CA expenses": -212242,
      "TOTAL OPERATING EXPENSES": -1683425.77
    },
    "cogm": 1792006.31,
    "channelFulfillment": 346050.2,
    "salesMarketing": 1792708.06,
    "platformCosts": 0,
    "opex": 1442684.7,
    "nonOperating": 513704.62,
    "restated": "FY2025-26 anchored to provisional P&L (31-03-2026)"
  },
  {
    "key": "2026-03",
    "label": "Mar 2026",
    "month": 3,
    "year": 2026,
    "netByChannel": {
      "D2C": 2232230.8,
      "Amazon": 1193821.71,
      "Blinkit": 369545.41,
      "OEM": 416355.05,
      "Offline": 97726.07
    },
    "grossByChannel": {
      "D2C": 2232230.8,
      "Amazon": 1349122.68,
      "Blinkit": 369545.41,
      "OEM": 416355.05,
      "Offline": 212475.1
    },
    "returnsByChannel": {
      "Amazon": -155300.97,
      "Offline": -114749.02
    },
    "totalGrossRevenue": 4296720.38,
    "totalReturns": -253362,
    "totalTaxes": -192541.04,
    "netRevenue": 4104456.06,
    "interBranch": 541687,
    "turnover": 4392504.34,
    "grossMargin": 2567888.6,
    "cm1": 2271165.61,
    "cm2": 733996.43,
    "cm3": 733996.43,
    "ebitda": -503042.95,
    "netIncome": -943522.32,
    "cogmLines": {
      "Raw Materials & Inventory": -3725983.15,
      "Factory Maintenance": -53944,
      "Inbound Transport": -584799.22,
      "Job work": -66579.75,
      "TOTAL COGM": -4431306.12
    },
    "opexLines": {
      "Banks & Finance Charges": -41583.36,
      "Other Operating Expenses": -17312.17,
      "Administrative Expenses": -656512.63,
      "Miscellaneous (Travel, insurance)": -9150,
      "Staff Welfare & Events": -3007.75,
      "Salaries (Admin Mgmt)": -736149,
      "Legal & CA expenses": -206310,
      "TOTAL OPERATING EXPENSES": -1670024.91
    },
    "cogm": 1536567.46,
    "channelFulfillment": 296722.99,
    "salesMarketing": 1537169.18,
    "platformCosts": 0,
    "opex": 1237039.38,
    "nonOperating": 440479.37,
    "restated": "FY2025-26 anchored to provisional P&L (31-03-2026)"
  },
  {
    "key": "2026-04",
    "label": "Apr 2026",
    "month": 4,
    "year": 2026,
    "netByChannel": {
      "D2C": 1860000,
      "Amazon": 1800000,
      "OEM": 316000,
      "Offline": 210000
    },
    "grossByChannel": {},
    "returnsByChannel": {},
    "totalGrossRevenue": 0,
    "totalReturns": 0,
    "totalTaxes": 0,
    "netRevenue": 4187000,
    "interBranch": 0,
    "turnover": 0,
    "grossMargin": 795000,
    "cm1": -106000,
    "cm2": -2407000,
    "cm3": -2425000,
    "ebitda": -2732000,
    "netIncome": -2881000,
    "cogmLines": {},
    "opexLines": {
      "Salary Cost": -235000,
      "Corporate Overheads": -72000,
      "TOTAL OPERATING EXPENSES": -307000
    },
    "cogm": 3392000,
    "channelFulfillment": 901000,
    "salesMarketing": 2301000,
    "platformCosts": 18000,
    "opex": 307000,
    "nonOperating": 149000
  },
  {
    "key": "2026-05",
    "label": "May 2026",
    "month": 5,
    "year": 2026,
    "netByChannel": {
      "D2C": 1417000,
      "Amazon": 2384000,
      "OEM": 2634000,
      "Offline": 277000
    },
    "grossByChannel": {},
    "returnsByChannel": {},
    "totalGrossRevenue": 0,
    "totalReturns": 0,
    "totalTaxes": 0,
    "netRevenue": 6716000,
    "interBranch": 0,
    "turnover": 0,
    "grossMargin": 5659000,
    "cm1": 5282000,
    "cm2": 3356000,
    "cm3": 3354000,
    "ebitda": 239000,
    "netIncome": 239000,
    "cogmLines": {},
    "opexLines": {
      "Salary Cost": -208000,
      "Corporate Overheads": -77000,
      "One-Time Business Development": -2830000,
      "TOTAL OPERATING EXPENSES": -3115000
    },
    "cogm": 1057000,
    "channelFulfillment": 377000,
    "salesMarketing": 1926000,
    "platformCosts": 2000,
    "opex": 3115000,
    "nonOperating": 0
  }
];

export const FY_SUMMARY: FYSummary[] = [
  {
    "name": "FY 2023-24",
    "netRevenue": 13410000,
    "mix": {
      "D2C": 0,
      "Amazon": 0.073,
      "Blinkit": 0,
      "OEM": 0.802,
      "Offline": 0.125,
      "Export": 0
    },
    "grossMarginPct": 0.305,
    "ebitdaPct": 0.053,
    "netIncomePct": -0.057
  },
  {
    "name": "FY 2024-25",
    "netRevenue": 37950000,
    "mix": {
      "D2C": 0.007,
      "Amazon": 0.655,
      "Blinkit": 0.005,
      "OEM": 0.133,
      "Offline": 0.2,
      "Export": 0
    },
    "grossMarginPct": 0.636,
    "ebitdaPct": 0.072,
    "netIncomePct": 0.015
  },
  {
    "name": "FY 2025-26",
    "netRevenue": 58339080.42,
    "mix": {
      "D2C": 0.402,
      "Amazon": 0.335,
      "Blinkit": 0.054,
      "OEM": 0.134,
      "Offline": 0.074,
      "Export": 0
    },
    "grossMarginPct": 0.6,
    "ebitdaPct": 0,
    "netIncomePct": -0.04
  },
  {
    "name": "FY 2026-27",
    "netRevenue": 10900000,
    "mix": {
      "D2C": 0.301,
      "Amazon": 0.384,
      "Blinkit": 0,
      "OEM": 0.271,
      "Offline": 0.045,
      "Export": 0
    },
    "grossMarginPct": 0.592,
    "ebitdaPct": -0.229,
    "netIncomePct": -0.242
  }
];

// ----------------------------------------------------------------------------
// Repeat-purchase data (channel × month) — powers the Repeats tab.
//
// The MIS itself has no order/customer-level data, so this is a separate feed.
// Populate REPEAT_DATA with one row per channel per month:
//   { key: "2026-05", channel: "D2C", orders: 812, repeatOrders: 143 }
// where `orders` is that channel's total orders in the month and `repeatOrders`
// is the subset placed by returning customers. Repeat rate is derived
// (repeatOrders / orders). Leave the array empty until the dataset is supplied;
// the Repeats tab shows a "waiting for data" state while it is empty.
// ----------------------------------------------------------------------------

export interface ChannelRepeatMonth {
  /** Month key, e.g. "2026-05". */
  key: string;
  channel: SalesChannel;
  /** Total orders for this channel in the month. */
  orders: number;
  /** Orders placed by returning customers (subset of `orders`). */
  repeatOrders: number;
}

export const REPEAT_DATA: ChannelRepeatMonth[] = [];

// ----------------------------------------------------------------------------
// Discounts & total sales by month (from the storefront sales report).
// `discount` is stored as a positive magnitude (the deduction). The first and
// last months are partial (report window Jul 10 2025 – Jul 10 2026).
// ----------------------------------------------------------------------------

export interface DiscountMonth {
  key: string;
  label: string;
  /** Discount given in the month, as a positive ₹ magnitude. */
  discount: number;
  /** Total (gross) sales in the month, in ₹. */
  totalSales: number;
  /** True when the month is only partially covered by the report window. */
  partial?: boolean;
}

export const DISCOUNT_DATA: DiscountMonth[] = [
  { key: '2025-07', label: "Jul '25", discount: 0, totalSales: 0, partial: true },
  { key: '2025-08', label: "Aug '25", discount: 16961.11, totalSales: 93514.97 },
  { key: '2025-09', label: "Sep '25", discount: 8626.12, totalSales: 840725.93 },
  { key: '2025-10', label: "Oct '25", discount: 52715.97, totalSales: 2630897.35 },
  { key: '2025-11', label: "Nov '25", discount: 235204.85, totalSales: 4221668.31 },
  { key: '2025-12', label: "Dec '25", discount: 243830.29, totalSales: 5837115.91 },
  { key: '2026-01', label: "Jan '26", discount: 228695.13, totalSales: 5145028.14 },
  { key: '2026-02', label: "Feb '26", discount: 167552.52, totalSales: 3296431.02 },
  { key: '2026-03', label: "Mar '26", discount: 174511.95, totalSales: 2071718.19 },
  { key: '2026-04', label: "Apr '26", discount: 81490.26, totalSales: 1842828.84 },
  { key: '2026-05', label: "May '26", discount: 108218.30, totalSales: 1513053.81 },
  { key: '2026-06', label: "Jun '26", discount: 168887.07, totalSales: 952700.59 },
  { key: '2026-07', label: "Jul '26", discount: 49132.34, totalSales: 311735.97, partial: true },
];
