// AUTO-GENERATED from channel settlement & ad-spend uploads. Do not edit by hand.
// Sources: Blinkit seller settlement summary; Amazon Payments monthly summary (+ Jun-25 SKU
// report patch; Oct-24 launch month excluded — itemised fees not captured); Meta & Google Ads
// net cost; Shiprocket freight/COD/VAS invoices; Shopflo checkout billing; payment-gateway
// settlement charges. All values in INR. This feed powers the "Channel P&L (Actuals)" tab only;
// the rest of the MIS deck is unaffected.

/** Product COGS assumption for the actuals contribution view (30% of net revenue). */
export const COGS_RATE = 0.30;

export interface BlinkitActual { sales: number; fulfilment: number; ads: number; taxes: number; credits: number; payout: number; }
export interface AmazonActual { netSales: number; referral: number; fba: number; ads: number; }
export interface D2CCost { meta: number; google: number; shiprocket: number; shopflo: number; gateway: number; }

/** Blinkit: revenue (sales) and settlement deductions. payout = sales − fulfilment − ads − taxes + credits. */
export const BLINKIT_ACTUALS: Record<string, BlinkitActual> = {
  "2025-02": { sales: 28971.0, fulfilment: 6031.16, ads: 0.0, taxes: 165.59, credits: 0.0, payout: 22774.25 },
  "2025-03": { sales: 168445.0, fulfilment: 48514.74, ads: 338.22, taxes: 962.64, credits: 0.0, payout: 118629.4 },
  "2025-04": { sales: 397687.0, fulfilment: 84484.92, ads: 12177.28, taxes: 2272.33, credits: 0.0, payout: 298752.47 },
  "2025-05": { sales: 290945.0, fulfilment: 52099.93, ads: 12071.81, taxes: 1662.38, credits: 0.0, payout: 225110.88 },
  "2025-06": { sales: 289060.0, fulfilment: 61103.59, ads: 0.0, taxes: 1641.94, credits: 110669.0, payout: 336983.47 },
  "2025-07": { sales: 509771.0, fulfilment: 117897.8, ads: 0.0, taxes: 2868.63, credits: 0.0, payout: 389004.57 },
  "2025-08": { sales: 331197.0, fulfilment: 94977.03, ads: 0.0, taxes: 1858.4, credits: 27227.0, payout: 261588.57 },
  "2025-09": { sales: 275859.0, fulfilment: 79361.91, ads: 0.0, taxes: 1546.26, credits: 0.0, payout: 194950.83 },
  "2025-10": { sales: 297615.0, fulfilment: 95437.4, ads: 0.0, taxes: 1699.15, credits: 40480.1, payout: 240958.55 },
  "2025-11": { sales: 272261.0, fulfilment: 100532.65, ads: 0.0, taxes: 1557.44, credits: 855.88, payout: 171026.79 },
  "2025-12": { sales: 127128.0, fulfilment: 69814.83, ads: 0.0, taxes: 488.51, credits: 6491.94, payout: 63316.6 },
  "2026-01": { sales: 71720.0, fulfilment: 40923.16, ads: 0.0, taxes: 68.55, credits: 8430.56, payout: 39158.85 },
  "2026-02": { sales: 40521.0, fulfilment: 24112.55, ads: 0.0, taxes: 38.68, credits: 538.8, payout: 16908.57 },
  "2026-03": { sales: 112886.0, fulfilment: 43763.28, ads: 0.0, taxes: 107.51, credits: 0.0, payout: 69015.21 },
  "2026-04": { sales: 158085.0, fulfilment: 46656.01, ads: 0.0, taxes: 150.56, credits: 0.0, payout: 111278.43 },
  "2026-05": { sales: 85638.0, fulfilment: 31270.48, ads: 0.0, taxes: 81.56, credits: 1404.78, payout: 55690.74 },
  "2026-06": { sales: 34780.0, fulfilment: 16072.55, ads: 0.0, taxes: 33.13, credits: 14617.86, payout: 33292.18 },
  "2026-07": { sales: 21529.0, fulfilment: 10218.29, ads: 0.0, taxes: 20.5, credits: 981.77, payout: 12271.98 },
};

/** Amazon: net sales and itemised fees from the Payments monthly summary. */
export const AMAZON_ACTUALS: Record<string, AmazonActual> = {
  "2024-11": { netSales: 3471509.62, referral: 185548.47, fba: 158195.6, ads: 349405.16 },
  "2024-12": { netSales: 4853010.74, referral: 486035.07, fba: 127594.58, ads: 938649.08 },
  "2025-01": { netSales: 3691621.87, referral: 335454.01, fba: 124089.98, ads: 942250.15 },
  "2025-02": { netSales: 953710.02, referral: 83835.41, fba: 112273.16, ads: 0.0 },
  "2025-03": { netSales: 921455.14, referral: 98899.98, fba: 115661.3, ads: 0.0 },
  "2025-04": { netSales: 951536.02, referral: 109556.19, fba: 190035.6, ads: 0.0 },
  "2025-05": { netSales: 1509016.08, referral: 160297.06, fba: 318794.78, ads: 0.0 },
  "2025-06": { netSales: 1754957.02, referral: 240864.99, fba: 363574.52, ads: 253317.41 },
  "2025-07": { netSales: 2585278.61, referral: 93727.71, fba: 529274.88, ads: 578743.76 },
  "2025-08": { netSales: 2015822.11, referral: 76599.61, fba: 381878.72, ads: 447876.99 },
  "2025-09": { netSales: 2543677.83, referral: 90219.72, fba: 513780.36, ads: 665710.57 },
  "2025-10": { netSales: 2467945.24, referral: 128157.71, fba: 385885.02, ads: 574282.53 },
  "2025-11": { netSales: 2151793.46, referral: 190463.94, fba: 297173.96, ads: 411000.82 },
  "2025-12": { netSales: 1411363.6, referral: 110983.94, fba: 215160.22, ads: 315982.12 },
  "2026-01": { netSales: 354264.9, referral: 25364.54, fba: 67735.58, ads: 64640.91 },
  "2026-02": { netSales: 289437.44, referral: 22103.66, fba: 44130.82, ads: 81144.09 },
  "2026-03": { netSales: 893327.22, referral: 78062.63, fba: 127074.2, ads: 190309.98 },
  "2026-04": { netSales: 1787405.03, referral: 157743.87, fba: 232057.62, ads: 313998.31 },
  "2026-05": { netSales: 2460913.66, referral: 179904.98, fba: 331146.94, ads: 327952.56 },
  "2026-06": { netSales: 1387147.39, referral: 114801.17, fba: 146498.18, ads: 182631.82 },
  "2026-07": { netSales: 1199337.38, referral: 102153.35, fba: 127332.62, ads: 375111.64 },
};

/** D2C (Shopify/Shopflo): channel-tagged cost feeds. Revenue comes from the model netByChannel.D2C. */
export const D2C_COSTS: Record<string, D2CCost> = {
  "2025-08": { meta: 29458.94, google: 36329.2, shiprocket: 0, shopflo: 3480.0, gateway: 69 },
  "2025-09": { meta: 138283.46, google: 166044.5, shiprocket: 31469.92, shopflo: 2398.03, gateway: 1168 },
  "2025-10": { meta: 370578.2, google: 483885.29, shiprocket: 201559.37, shopflo: 10277.79, gateway: 4464 },
  "2025-11": { meta: 662641.87, google: 761744.94, shiprocket: 369189.71, shopflo: 37425.2, gateway: 12714 },
  "2025-12": { meta: 811876.97, google: 1048894.93, shiprocket: 440194.94, shopflo: 38553.69, gateway: 20342 },
  "2026-01": { meta: 799426.18, google: 1004480.02, shiprocket: 1091081.28, shopflo: 48045.05, gateway: 16771 },
  "2026-02": { meta: 1236132.55, google: 713244.63, shiprocket: 848914.33, shopflo: 46581.59, gateway: 13042 },
  "2026-03": { meta: 1303809.18, google: 527104.36, shiprocket: 688319.46, shopflo: 30247.86, gateway: 10323 },
  "2026-04": { meta: 957885.31, google: 626781.85, shiprocket: 462810.37, shopflo: 26032.98, gateway: 6744 },
  "2026-05": { meta: 892645.29, google: 428883.47, shiprocket: 292597.57, shopflo: 18882.88, gateway: 4990 },
  "2026-06": { meta: 476986.97, google: 257450.64, shiprocket: 241678.64, shopflo: 17419.32, gateway: 3864 },
  "2026-07": { meta: 696759.75, google: 156024.54, shiprocket: 187114.57, shopflo: 17416.88, gateway: 2937 },
  "2026-08": { meta: 256522.64, google: 103970.46, shiprocket: 7268.3, shopflo: 15466.85, gateway: 0 },
};
