// The only data source of the website: data/export/dashboard.json, written by build_db.py.
// It is bundled into the static site at build time. No API calls at runtime.
import raw from "../../data/export/dashboard.json";
import type { ScenarioBase } from "./scenario";

export type Month = {
  month: string;
  revenue: number;
  gross_margin_pct: number;
  headcount: number;
  payroll: number;
  opex_total: number;
  ebitda: number;
  collections: number;
  payments: number;
  net_burn: number;
  funding: number;
  closing_cash: number;
  opening_mrr: number;
  new_mrr: number;
  expansion_mrr: number;
  contraction_mrr: number;
  churn_mrr: number;
  closing_mrr: number;
  new_customers: number;
  churned_customers: number;
  active_customers: number;
  avg_net_burn_3m: number | null;
  runway_months: number | null;
  zero_cash_month: string | null;
  arr: number;
  arr_growth_12m: number | null;
  nrr_12m: number | null;
  burn_multiple: number | null;
  burn_multiple_note: string | null;
};

export type BurnDriver = { month: string; driver_type: "team" | "category"; driver: string; amount: number };
export type Update = { month: string; text: string; model: string; prompt_version: string };
export type UpdateCheck = {
  month: string;
  words: number;
  numbers_found: number;
  numbers_matched: number;
  unmatched_numbers: string | null;
  causes_named: string | null;
  unsupported_causes: string | null;
  dash_found: boolean;
  passed: boolean;
};

type Dashboard = {
  company: string;
  monthly: Month[];
  burn_drivers: BurnDriver[];
  hire_cost_by_team: { team: string; people: number; avg_loaded_cost: number; hiring_share: number }[];
  scenario_base: ScenarioBase;
  updates: Update[];
  update_checks: UpdateCheck[];
  reconciliation: { check: string; passed: boolean }[];
};

export const data = raw as unknown as Dashboard;
