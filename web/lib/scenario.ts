// Scenario engine: projects cash 24 months forward from the last actual month.
//
// This is the only place the slider logic lives. It runs in the browser every
// time a slider moves. scripts/check_scenario.py is a line-by-line Python copy,
// and lib/scenario.test.ts checks that both give the same cash every month.
//
// It is a set of assumptions for "what if" questions, not a forecast.

// Starting point, exported from the SQL view scenario_base (sql/08_scenario_base.sql).
export type ScenarioBase = {
  start_month: string;          // last actual month, e.g. "2026-09"
  start_cash: number;           // closing cash in that month (EUR)
  start_mrr: number;            // closing MRR in that month (EUR)
  monthly_payroll: number;      // payroll in that month (EUR)
  monthly_opex: number;         // average non-payroll costs, last 3 months (EUR)
  default_growth_rate: number;  // new + expansion MRR as share of MRR, 12-month average
  default_churn_rate: number;   // churn + contraction MRR as share of MRR, 12-month average
  cost_per_hire: number;        // loaded monthly cost of one new hire (EUR)
  student_assistant_cost: number;  // loaded monthly cost of one part-time student assistant (EUR)
  annual_salary_increase: number;  // e.g. 0.03: all payroll rises 3 % every January
};

// What the sliders control.
export type Settings = {
  hires: number;          // full-time people hired over the next 12 months (0 to 15)
  students: number;       // part-time student assistants from projected month 1 (0 to 6)
  growthRate: number;     // monthly MRR added, e.g. 0.035 = 3,5 % of MRR
  churnRate: number;      // monthly MRR lost, e.g. 0.013 = 1,3 % of MRR
  opexChange: number;     // change to other costs, e.g. -0.1 = 10 % lower
  fundingAmount: number;  // new money raised (EUR), 0 = none
  fundingMonth: number;   // in which projected month it arrives (1 to 24)
};

// One projected month.
export type ProjectedMonth = {
  month: string;   // "YYYY-MM"
  mrr: number;
  payroll: number;
  opex: number;
  funding: number;
  cash: number;    // closing cash at the end of the month
};

export const MONTHS_AHEAD = 24;

// The three preset buttons. "Current plan" is what the page shows on load and what Reset returns to.
export type PresetName = "Current plan" | "Hiring push" | "Downside";

export function presetSettings(base: ScenarioBase, name: PresetName): Settings {
  const currentPlan: Settings = {
    hires: 2,
    students: 2,
    growthRate: base.default_growth_rate,   // 12-month trend
    churnRate: base.default_churn_rate,     // 12-month trend
    opexChange: 0,
    fundingAmount: 0,
    fundingMonth: 6,
  };
  if (name === "Hiring push") return { ...currentPlan, hires: 6 };
  if (name === "Downside") return {
    ...currentPlan,
    growthRate: base.default_growth_rate * 0.5,
    churnRate: base.default_churn_rate * 1.5,
  };
  return currentPlan;
}

export const PRESETS: PresetName[] = ["Current plan", "Hiring push", "Downside"];

// Which preset the sliders match exactly, or null once a slider has been moved away.
// The funding month only matters when there is funding.
export function activePreset(base: ScenarioBase, s: Settings): PresetName | null {
  const same = (a: Settings, b: Settings) =>
    a.hires === b.hires && a.students === b.students && a.growthRate === b.growthRate &&
    a.churnRate === b.churnRate && a.opexChange === b.opexChange && a.fundingAmount === b.fundingAmount &&
    (a.fundingAmount === 0 || a.fundingMonth === b.fundingMonth);
  return PRESETS.find((p) => same(s, presetSettings(base, p))) ?? null;
}

// "2026-09" plus 3 months gives "2026-12".
export function addMonths(month: string, n: number): string {
  const [year, mon] = month.split("-").map(Number);
  const total = year * 12 + (mon - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

// Salary factor for a projected month: 1 before the first January, then x 1,03
// from every January onwards (1,03 after one January, 1,0609 after two, ...).
export function salaryFactor(base: ScenarioBase, month: string): number {
  const januaries = Number(month.slice(0, 4)) - Number(base.start_month.slice(0, 4));
  return (1 + base.annual_salary_increase) ** januaries;
}

// How many of the planned hires have started by projected month t (1, 2, 3, ...).
// Hires are spread evenly over the first 12 months: hire number i (counting
// from 0) starts in month floor(i * 12 / hires) + 1.
// Example: 3 hires start in months 1, 5 and 9.
export function hiresStartedBy(t: number, hires: number): number {
  let started = 0;
  for (let i = 0; i < hires; i++) {
    if (Math.floor((i * 12) / hires) + 1 <= t) started++;
  }
  return started;
}

// The projection itself. Month by month:
//   MRR     = last month's MRR x (1 + growth rate - churn rate)
//   payroll = (today's payroll + hires started so far x cost per hire
//              + student assistants x their cost) x salary factor (3 % more every January)
//   opex    = today's other costs x (1 + opex change)
//   cash    = last month's cash + MRR - payroll - opex + funding
// Simplifications: all revenue is collected in the month it is earned (annual upfront
// billing is ignored), and new hires add cost but do not change the growth rate.
export function project(base: ScenarioBase, s: Settings): ProjectedMonth[] {
  const rows: ProjectedMonth[] = [];
  let mrr = base.start_mrr;
  let cash = base.start_cash;
  for (let t = 1; t <= MONTHS_AHEAD; t++) {
    mrr = mrr * (1 + s.growthRate - s.churnRate);
    const month = addMonths(base.start_month, t);
    const payroll = (base.monthly_payroll + hiresStartedBy(t, s.hires) * base.cost_per_hire
      + s.students * base.student_assistant_cost) * salaryFactor(base, month);
    const opex = base.monthly_opex * (1 + s.opexChange);
    const funding = t === s.fundingMonth ? s.fundingAmount : 0;
    cash = cash + mrr - payroll - opex + funding;
    rows.push({ month, mrr, payroll, opex, funding, cash });
  }
  return rows;
}

// First projected month where closing cash is below zero, or null if it never is.
export function zeroCashMonth(rows: ProjectedMonth[]): string | null {
  const hit = rows.find((r) => r.cash < 0);
  return hit ? hit.month : null;
}
