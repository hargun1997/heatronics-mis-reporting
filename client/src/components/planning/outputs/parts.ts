// Sub-tab lists of the plan views. The 5-year plan has 5 header tabs since 22 Nov 2026 (was 8): Overview holds the
// Business plan parts, Revenue holds Products and customers, Costs and P&L holds Capacity and the Monthly P&L.
export const BP_TABS: { id: 'money' | 'funds' | 'words' | 'milestones'; label: string }[] = [
  { id: 'money', label: 'Headline and Ask' }, { id: 'funds', label: 'Use of funds' }, { id: 'words', label: 'Assumptions and risks' }, { id: 'milestones', label: 'Milestones and team' },
];
export const PC_TABS: { id: 'products' | 'capacity' | 'd2c' | 'season'; label: string }[] = [
  { id: 'products', label: 'Roll-out' }, { id: 'capacity', label: 'Capacity' }, { id: 'd2c', label: 'D2C customers' }, { id: 'season', label: 'Seasons' },
];
export const REV_TABS: { id: 'year' | 'product' | 'month' | 'offline'; label: string }[] = [
  { id: 'year', label: 'By year' }, { id: 'product', label: 'By product' }, { id: 'month', label: 'By month' }, { id: 'offline', label: 'Offline' },
];
export type CostSection = 'revex' | 'opex' | 'capex' | 'finex';
export const COST_TABS: { id: CostSection; label: string }[] = [
  { id: 'revex', label: 'Revenue-linked' }, { id: 'opex', label: 'Opex' }, { id: 'capex', label: 'Capex' }, { id: 'finex', label: 'Finance' },
];
