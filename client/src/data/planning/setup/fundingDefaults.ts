// Indian D2C fundraising benchmarks for the Funding section (docs/planning/ONE-SETUP.md §2.8).
// A TS literal of docs/planning/funding-defaults.json (research: docs/planning/D2C-RAISE-BENCHMARKS.md, 3 Nov 2026):
// low / mid / high → min / typical / max; `afterSeedMonths` = the JSON's `monthsAfterPrevious` summed from the seed;
// `arrAtLeastCr` = the JSON's `arrAtRaiseCr.mid`. Money stays in ₹ Cr here; `funding.ts` converts to ₹ when it writes rounds.
// Percentages are 0–1 fractions throughout (the JSON printed the venture-debt rate and fee in %).
// Planning defaults, not market quotes: a round is priced on the company, the lead and the year.

export interface Range3 { min: number; typical: number; max: number }

export interface FundingRoundDefault {
  /** 'Series A' */
  name: string;
  timing: {
    /** typical months after the seed close */
    afterSeedMonths: number;
    /** for B/C: months after the previous round */
    afterPrevRoundMonths?: number;
    /** revenue run-rate investors expect at this round (₹ Cr) */
    arrAtLeastCr?: number;
    /** one sentence, e.g. '~20 months after seed, ARR ≈ ₹40 Cr, D2C contribution positive' */
    rule: string;
  };
  /** round size, ₹ Cr */
  sizeCr: Range3;
  /** pre-money ÷ run-rate ARR */
  preMoneyArrMultiple: Range3;
  /** 0.18 = 18 % */
  dilutionPct: Range3;
  /** what the round is raised against */
  milestones: string;
  /** URLs / report names */
  sources?: string[];
}

export interface FundingDefaults {
  /** 'YYYY-MM' of the research */
  asOf: string;
  /** 'Indian D2C / consumer health, 2024–26' */
  market: string;
  /** typical banker / legal cost as % of the round */
  feePct: number;
  ventureDebt: { shareOfRound: number; tenureMonths: number; ratePct: number; feePct: number };
  /** Series A, B, C */
  rounds: FundingRoundDefault[];
  /** caveats */
  notes: string;
}

export const FUNDING_DEFAULTS: FundingDefaults = {
  asOf: '2026-11',
  market: 'Indian D2C / consumer health, 2024–26',
  // The JSON gives no round-fee figure: 3 % is the plan's own default (defaultFunding().feePct).
  feePct: 0.03,
  // Treelife (Jun 2026): 25–30 % of the equity raise, 18–36 months, 13–15 % p.a.; the 1.5 % processing fee is an assumption.
  ventureDebt: { shareOfRound: 0.25, tenureMonths: 30, ratePct: 0.14, feePct: 0.015 },
  rounds: [
    {
      name: 'Series A',
      timing: {
        afterSeedMonths: 20,
        arrAtLeastCr: 40,
        rule: '~20 months after the seed, at ≈ ₹40 Cr ARR (₹20–80 Cr), with CM2 positive or a dated path to it.',
      },
      sizeCr: { min: 25, typical: 40, max: 100 },
      preMoneyArrMultiple: { min: 2, typical: 3.5, max: 5 },
      dilutionPct: { min: 0.15, typical: 0.22, max: 0.25 },
      milestones: 'Gross margin >= 60% on core SKUs; CM2 positive, or a dated path to it; CAC payback < 6 months (< 3 ideal); Repeat >= 30% (30-40% within 90 days); Two or more channels working; offline being tested; 18-24 months runway after the round; exit path already discussed',
      sources: [
        'https://treelife.in/finance/venture-debt-vs-equity-funding/',
        'https://thed2cpulse.com/?p=720',
        'https://inc42.com/buzz/indian-startup-funding-jumps-8-yoy-to-5-7-bn-in-h1-2025',
        'https://entrackr.com/snippets/palmonas-raises-rs-55-cr-in-series-a-round-led-by-vertex-ventures-9743288',
        'https://entrackr.com/news/haircare-startup-moxie-beauty-raises-15-mn-in-series-a-led-by-bessemer-10913742',
        'https://www.outlookbusiness.com/corporate/snitch-raises-340-cr-funding-valuation-jumps-to-2500-crore-to-fuel-expansion',
        'https://backrr.com/blog/pre-seed-seed-series-a-metrics-india',
        'https://echai.ventures/startingup/raise-or-not/how-much-of-my-company-should-i-still-own-after-seed-series-a-and-beyond',
      ],
    },
    {
      name: 'Series B',
      timing: {
        afterSeedMonths: 40,
        afterPrevRoundMonths: 20,
        arrAtLeastCr: 150,
        rule: '~20 months after the Series A, at ≈ ₹150 Cr ARR (₹80–300 Cr), with offline live and an EBITDA-positive path inside 18–24 months.',
      },
      sizeCr: { min: 80, typical: 150, max: 300 },
      preMoneyArrMultiple: { min: 3, typical: 4, max: 5 },
      dilutionPct: { min: 0.12, typical: 0.2, max: 0.25 },
      milestones: 'Scaling past Rs 50 Cr without breaking unit economics; Omnichannel live: offline / GT / MT a real share, stores opening; EBITDA-positive path inside 18-24 months; Second product family contributing; Brand pull (organic, unaided recall) over paid-ads arbitrage',
      sources: [
        'https://treelife.in/finance/venture-debt-vs-equity-funding/',
        'https://inc42.com/?p=365798',
        'https://inc42.com/buzz/d2c-fashion-brand-snitch-raises-40-mn-for-offline-expansion',
        'https://india.entrepreneur.com/news-and-trends/these-8-d2c-brands-dominated-vc-funding-in-2025/501443',
        'https://yourstory.com/2024/03/ultrahuman-bags-35-million-blume-ventures-steadview-capital',
        'https://echai.ventures/d2c/d2c-scaling-1cr-100cr/how-indian-consumer-vcs-fireside-sauce-evaluate-scaling-brands',
        'https://base.com/en-IN/blog/?p=19412',
      ],
    },
    {
      name: 'Series C',
      timing: {
        afterSeedMonths: 62,
        afterPrevRoundMonths: 22,
        arrAtLeastCr: 350,
        rule: '~22 months after the Series B, at ≈ ₹350 Cr ARR (₹250–600 Cr), EBITDA positive or within reach and retail at scale.',
      },
      sizeCr: { min: 180, typical: 300, max: 550 },
      preMoneyArrMultiple: { min: 3, typical: 4.5, max: 7 },
      dilutionPct: { min: 0.1, typical: 0.16, max: 0.2 },
      milestones: 'EBITDA positive or within reach; Offline / retail at scale (tens of stores or deep GT); Mix diversified beyond Amazon + Meta; Category leadership in the core; IPO or strategic-exit path; secondary for early investors common',
      sources: [
        'https://entrackr.com/news/giva-raises-rs-530-cr-in-series-c-round-led-by-creaegis-9407202',
        'https://inc42.com/buzz/giva-loss-widens-23-to-%e2%82%b972-cr-in-fy25-revenue-jumps-90/',
        'https://startup.outlookindia.com/sector/fintech/after-raising-rs-184-crore-the-sleep-company-chases-rs-1000-crore-revenue-target-for-2025-news-10002',
        'https://entrackr.com/news/the-sleep-company-raises-rs-480-cr-in-primary-and-secondary-funding-9631069',
        'https://pulse.d2cinsider.com/renee-cosmetics-raises-30-mn-in-series-c-to-scale-its-d2c-beauty-playbook-at-200-mn-valuation/',
        'https://echai.ventures/d2c/d2c-exit-acquisition/how-is-my-d2c-brand-valued-when-sold',
      ],
    },
  ],
  notes: [
    'Mid values are planning defaults, not market quotes: most Indian deal reports omit valuation, so multiples are stated ranges (2-4x revenue per D2C Pulse 2026, 3-6x per eChai 2026) plus two back-solved deals (Snitch A ~2x, B ~4.5-5x; GIVA C ~7.5x).',
    'ARR at raise ranges are wide because the market moved: a targeted Series A at Rs 5-10 Cr is now called credible, while the funded 2025 names (Moxie, Snitch) raised their A at Rs 100 Cr+ ARR. Map Heatronics by ARR, not the round label.',
    'Dilution mids equal size / (multiple x ARR + size) so the three rounds are internally consistent; India early rounds often dilute more than the Carta medians (Entrackr, Sep 2025), and the pre-A ESOP top-up is not included.',
    'Round gaps: India seed-to-A median ~20 months (Seafund 2026); global Carta medians 26 / 30 / 29 months; the Indian D2C examples ran 13-20 months. Plan for 20, stress-test at 30.',
    'Venture debt: 25-30% of the equity raise, 18-36 months from drawdown, 13-15% p.a. (12-18% quoted), 3-6 month interest-only moratorium, warrants 0.1-2% at last-round price, prepayment 1-3%. feePct 1.5 is an ASSUMPTION: sources say some lenders charge a processing fee but give no figure.',
    'Hardware / health devices: no published separate multiple. Device rounds in India come smaller and later (Curapod Rs 20 Cr pre-A, Aether Rs 4.5 Cr pre-A), lean more on debt (inventory, capex), and are priced like consumer brands once margin and repeat are proven (Ultrahuman, The Sleep Company).',
    'Figures mix revenue, net sales and ARR as the sources printed them; FX about Rs 84/$.',
  ].join(' '),
};
