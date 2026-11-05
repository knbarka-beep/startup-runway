// The only data source of the website: web/data/dashboard.json, an exact copy of
// data/export/dashboard.json made by build_db.py. It is bundled into the static site
// at build time. No API calls at runtime.
import raw from "../data/dashboard.json";
import type { ScenarioBase } from "./scenario";
import { eur, eurShort } from "./format";

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
export type Update = {
  month: string; tldr: string; highlights: string; lowlights: string; ask: string;
  model: string; prompt_version: string;
  attempt: number;  // which attempt was kept (1 = first draft, up to 3)
};
// One row per API call in the v3 run: data/ai/update_attempts.csv
export type UpdateAttempt = { month: string; attempt: number; passed: boolean; checks_failed: string | null };
// One row per number in a kept draft: the fact it matched (data/check/update_number_matches.csv)
export type NumberMatch = {
  month: string; number: string; metric: string;
  period_end: string; period_months: number;  // the fact covers period_months months up to period_end
  value: number;
};
export type UpdateCheck = {
  month: string;
  attempt: number;
  checks_failed: string | null;
  words: number;
  placeholders: number;
  numbers_found: number;
  numbers_matched: number;
  unmatched_numbers: string | null;
  causes_named: string | null;
  unsupported_causes: string | null;
  banned_words: string | null;
  metrics_worse: string | null;
  problems: string | null;
  passed: boolean;
};
// Key metrics table of the investor update (sql/09_update_metrics.sql). Changes are vs the previous month.
export type UpdateMetrics = {
  month: string;
  cash: number; cash_change: number | null;
  net_burn: number; net_burn_change: number | null;
  runway_months: number | null; runway_change: number | null;
  mrr: number; mrr_change: number | null;
  arr_growth_12m: number | null; arr_growth_change: number | null;
  customers: number; customers_change: number | null;
  headcount: number; headcount_change: number | null;
};

type Dashboard = {
  company: string;
  monthly: Month[];
  burn_drivers: BurnDriver[];
  hire_cost_by_team: { team: string; people: number; avg_loaded_cost: number; hiring_share: number }[];
  scenario_base: ScenarioBase;
  updates: Update[];
  update_checks: UpdateCheck[];
  update_attempts: UpdateAttempt[];
  update_number_matches: NumberMatch[];
  update_metrics: UpdateMetrics[];
  reconciliation: { check: string; passed: boolean }[];
};

export const data = raw as unknown as Dashboard;

// Summary of the v3 run with retries, shown on the update card and the How this works page.
export function attemptSummary() {
  const attempts = data.update_attempts;
  const first = attempts.filter((a) => a.attempt === 1);
  const counts = new Map<string, number>();
  for (const a of first) {
    for (const name of (a.checks_failed ?? "").split("; ").filter(Boolean)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const checks = data.update_checks;
  return {
    months: first.length,
    firstPass: first.filter((a) => a.passed).length,
    finalPass: checks.filter((c) => c.passed).length,
    retried: data.updates.filter((u) => u.attempt > 1).map((u) => u.month),
    calls: attempts.length,
    numbersFound: checks.reduce((sum, c) => sum + c.numbers_found, 0),
    numbersMatched: checks.reduce((sum, c) => sum + c.numbers_matched, 0),
    // [check name, months that failed it on the first attempt], most common first
    firstFailures: [...counts.entries()].sort((a, b) => b[1] - a[1]),
  };
}

export const RETRY_SENTENCE =
  "The model does not follow format rules reliably, so the pipeline checks every draft and asks for one or two " +
  "corrections. Both the first-attempt and final results are shown.";

// Up to three events marked on the actual cash line. Each month is picked from the exported data
// (no new numbers are calculated); the wording follows the planted story in docs/data-spec.md.
// `short` is the flag label on the chart, `text` the full description (hover title and the chart's (i)).
export type Annotation = { month: string; cash: number; short: string; text: string };
export function cashAnnotations(): Annotation[] {
  const months = data.monthly;
  const pick = (better: (a: number, b: number) => boolean, value: (i: number) => number) =>
    months.reduce((best, _m, i) => (i > 0 && better(value(i), value(best)) ? i : best), 1);
  // 1. The month with the largest headcount increase: start of the hiring push.
  const hire = pick((a, b) => a > b, (i) => months[i].headcount - months[i - 1].headcount);
  // 2. The month with the highest professional fees: the one-off recruiting agency fee.
  const fees = (i: number) => data.burn_drivers.find((d) => d.month === months[i].month && d.driver === "professional fees")?.amount ?? 0;
  const fee = pick((a, b) => a > b, fees);
  // 3. The month with the largest churned MRR: the largest customer leaves.
  const churn = pick((a, b) => a < b, (i) => months[i].churn_mrr);
  const at = (i: number, short: string, text: string) => ({ month: months[i].month, cash: months[i].closing_cash, short, text });
  return [
    at(hire, "Hiring push", `Hiring push starts, headcount ${months[hire - 1].headcount} to ${months[hire].headcount}`),
    at(fee, "Recruiting fee", `One-off recruiting agency fee, professional fees ${eurShort(fees(fee))}`),
    at(churn, "Largest customer churns", `Largest customer churns, ${eur(months[churn].churn_mrr)} MRR`),
  ].sort((a, b) => a.month.localeCompare(b.month));
}
