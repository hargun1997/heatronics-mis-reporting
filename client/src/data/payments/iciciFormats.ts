// ICICI CIB (BizPay360) file formats for the Bulk payments tool — the ONE place their columns live.
// The tool only PREPARES files; the accounts team uploads them in CIB and a second user authorises there.
// Nothing here calls a bank.
//
// 1. Payee export ("Manage Bene" download, sheet CounterPartyListUX3): read by header text in payees.ts.
// 2. Bulk Payee Registration upload (Bene_Reg_Format.xlsx): checked against ICICI's own sample, 7 Nov 2026.
// 3. Bulk PAYMENT upload: NOT confirmed. BizPay360 → File Format Settings was greyed out until bulk payment is
//    reactivated. The columns below are a PLACEHOLDER (ICICI's customised bulk format as commonly seen).
//    To change it later, edit PAYMENT_FORMAT only.

export type PayMode = 'NEFT' | 'RTGS' | 'IMPS' | 'FT';
export const PAY_MODES: PayMode[] = ['FT', 'NEFT', 'RTGS', 'IMPS'];

/** Bulk Payee Registration: one sheet, one header row, this order and spelling (note the space in "BENE_ NICK_NAME"). */
export const BENE_REG_COLUMNS = ['BNF_NAME', 'BENE_ NICK_NAME', 'BENE_ACC_NO', 'BENE_IFSC', 'BENE_EMAIL', 'BENE_MOBILE'] as const;
export const BENE_REG_SHEET = 'Sheet1';

/** Longest nick name CIB takes. UNVERIFIED: 20 is our guess, check when CIB refuses a row. */
export const NICK_MAX = 20;
export const NICK_MAX_VERIFIED = false;

/** One row of a payment batch, as the format sees it. */
export interface PaymentLine {
  name: string;
  account: string;
  ifsc: string;
  email?: string;
  mobile?: string;
  amountPaise: number;
  mode: PayMode;
  remark: string;
  ref: string;
}
export interface PaymentContext {
  debitAccount: string;
  /** ISO yyyy-mm-dd */
  date: string;
}
export interface PayFormatColumn { header: string; value: (l: PaymentLine, c: PaymentContext) => string }
export interface PaymentFormat {
  id: string;
  label: string;
  verified: boolean;
  note: string;
  sheetName: string;
  columns: PayFormatColumn[];
}

export const rupees = (paise: number) => (paise / 100).toFixed(2);
/** yyyy-mm-dd → DD-MM-YYYY */
export const ddmmyyyy = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
};
const cut = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);

/** PLACEHOLDER — UNVERIFIED. Confirm against BizPay360 → File Format Settings and run "Validate File for Upload". */
export const ICICI_CIB_CUSTOM_V0: PaymentFormat = {
  id: 'icici-cib-custom-v0',
  label: 'ICICI CIB customised bulk (placeholder)',
  verified: false,
  note: 'Check BizPay360 → File Format Settings, and run "Validate File for Upload" in CIB before "Payment File Upload".',
  sheetName: 'Sheet1',
  columns: [
    { header: 'PYMT_PROD_TYPE_CODE', value: () => 'PAB_VENDOR' },
    { header: 'PYMT_MODE', value: (l) => l.mode },
    { header: 'DEBIT_ACC_NO', value: (_l, c) => c.debitAccount },
    { header: 'BNF_NAME', value: (l) => cut(l.name, 70) },
    { header: 'BENE_ACC_NO', value: (l) => l.account },
    { header: 'BENE_IFSC', value: (l) => l.ifsc },
    { header: 'AMOUNT', value: (l) => rupees(l.amountPaise) },
    { header: 'DEBIT_NARR', value: (l) => cut(l.remark, 30) },
    { header: 'CREDIT_NARR', value: (l) => cut(l.remark, 30) },
    { header: 'MOBILE_NUM', value: (l) => l.mobile ?? '' },
    { header: 'EMAIL_ID', value: (l) => l.email ?? '' },
    { header: 'REMARK', value: (l) => cut(l.remark, 50) },
    { header: 'PYMT_DATE', value: (_l, c) => ddmmyyyy(c.date) },
    { header: 'REF_NO', value: (l) => l.ref },
    { header: 'ADDL_INFO1', value: () => '' },
    { header: 'ADDL_INFO2', value: () => '' },
    { header: 'ADDL_INFO3', value: () => '' },
    { header: 'ADDL_INFO4', value: () => '' },
    { header: 'ADDL_INFO5', value: () => '' },
  ],
};

/** The payment format in use. Swap this line once BizPay360 shows the real one. */
export const PAYMENT_FORMAT: PaymentFormat = ICICI_CIB_CUSTOM_V0;
