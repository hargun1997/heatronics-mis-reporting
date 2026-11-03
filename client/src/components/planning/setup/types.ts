// The contract every Setup section follows (docs/planning/ONE-SETUP.md §1).
import type { JSX } from 'react';
import type { Plan, PlanResult } from '../../../data/planning/engine';

/** Mutate a deep clone of the plan (PlanningPage: structuredClone → fn(next) → setPlan). Synchronous only. */
export type Update = (fn: (p: Plan) => void) => void;

export interface SetupSectionProps {
  /** the current plan (never mutate directly) */
  plan: Plan;
  /** update((p) => { p.levers.inflationPct = 0.05; }) */
  update: Update;
  /** runPlan(plan) — for read-only feedback lines next to inputs */
  result: PlanResult;
}

export type SetupSectionId =
  | 'start' | 'assumptions' | 'products' | 'customers' | 'retail' | 'team' | 'capacity' | 'funding' | 'targets' | 'narrative' | 'sheet';

export interface SetupSectionDef {
  id: SetupSectionId;
  /** e.g. 'Team & hiring' */
  title: string;
  /** one line under the title when open (≤ 110 chars) */
  blurb: string;
  Section: (props: SetupSectionProps) => JSX.Element;
  /** collapsed line; pure, cheap (no runPlan), ≤ 90 chars */
  summary: (plan: Plan) => string;
}
