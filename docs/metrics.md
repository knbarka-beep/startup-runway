# Metric definitions

Every metric is defined once, here. Each one is calculated in exactly one SQL view in `sql/`. The website only displays what the views export. All data is fictional.

## Revenue and MRR

| Metric | Formula | Where | Why this definition | Common alternative |
|---|---|---|---|---|
| MRR (monthly recurring revenue) | Sum of all MRR movements up to and including the month | `02_mrr_bridge.sql` (`closing_mrr`) | Built from movements, so the bridge always adds up | Sum of active subscription prices from a billing system snapshot |
| MRR bridge | opening MRR + new + expansion + contraction + churn = closing MRR (contraction and churn are negative) | `02_mrr_bridge.sql` | Shows why MRR moved, not just that it moved | Some teams add "reactivation" as a fifth bucket |
| Revenue | Revenue = closing MRR of the month | `03_monthly_summary.sql` | Simple: subscriptions are recognised evenly, no part months in this data | Daily proration of new and churned customers |
| ARR | closing MRR x 12 | `06_unit_metrics.sql` | Standard run-rate definition | Contracted ARR (signed but not yet live) |
| ARR growth | ARR / ARR 12 months earlier - 1 | `06_unit_metrics.sql` | Year-on-year removes seasonality and renewal lumps | Month-on-month growth, compounded |

## Margin and profit

| Metric | Formula | Where | Why | Alternative |
|---|---|---|---|---|
| Cost of revenue | cloud hosting + payroll of the customer success team | `03_monthly_summary.sql` | These are the costs of serving existing customers: the servers they use and the people who onboard and support them. Customer success grows with the customer base, so leaving it out made margin look better than it is (about 91 % instead of about 63 % in Sep 2026) | Also include third-party software (part of it serves customers, but the data does not say which part, so it is left in operating costs) |
| Gross profit | revenue - cost of revenue | `03_monthly_summary.sql` | | |
| Gross margin % | gross profit / revenue | `03_monthly_summary.sql` | 63,4 % in Sep 2026 | |
| EBITDA | revenue - payroll - all opex | `03_monthly_summary.sql` | No depreciation, interest or tax in this data, so EBITDA is operating profit on an accrual basis | EBIT, or "adjusted EBITDA" excluding one-offs (not used: it hides the one-off) |

## Cash, burn and runway

| Metric | Formula | Where | Why | Alternative |
|---|---|---|---|---|
| Net burn | payments - collections (funding excluded) | `03_monthly_summary.sql` | Cash is what runs out, not profit. Annual upfront billing makes cash and revenue differ a lot | Gross burn (payments only) or EBITDA-based burn |
| Average net burn (3m) | average of net burn this month and the two before | `04_runway.sql` | Annual invoices make single months lumpy (some months even show negative burn). Three months smooths that but still reacts to recent changes like the hiring push | Single latest month (too noisy), 6 or 12 months (too slow to show the hiring push) |
| Runway (months) | closing cash / average net burn (3m). Empty if average burn is zero or negative | `04_runway.sql` | Simple and widely understood: "how long at today's pace" | Projection-based runway that includes expected growth (that is what the scenario chart does) |
| Zero-cash month | this month + runway rounded up to whole months | `04_runway.sql` | Turns runway into a date people can plan around | Month in which projected cash goes below a minimum buffer, not zero |

The dashboard KPI uses this trailing 3-month runway and says so. The scenario chart is a separate projection with its own assumptions (see below), so the two dates can differ.

## Efficiency and retention

| Metric | Formula | Where | Why | Alternative |
|---|---|---|---|---|
| Net revenue retention (NRR, 12m) | MRR today from customers who were active 12 months ago / their MRR 12 months ago | `06_unit_metrics.sql` | Includes churn, contraction and expansion of the existing base; excludes new customers | Gross revenue retention (caps expansion, so never above 100 %) |
| Burn multiple | net burn over the last 3 months / net new ARR over the same 3 months | `06_unit_metrics.sql` | How many euros burned for each euro of new ARR. Same 3-month window as runway | Quarterly or annual windows. When net new ARR is zero or negative the ratio is not meaningful, so it is left empty with a note |

## Scenario projection (sliders)

Calculated in `web/lib/scenario.ts`, with an identical Python copy in `scripts/check_scenario.py`. Starting values come from `sql/08_scenario_base.sql`.

| Input | Default | Definition |
|---|---|---|
| Growth rate | average of (new + expansion) / opening MRR over the last 12 months | Monthly MRR added, as % of MRR |
| Churn rate | average of -(churn + contraction) / opening MRR over the last 12 months | Monthly MRR lost, as % of MRR |
| Planned hires | 0 | Spread evenly over the first 12 projected months |
| Cost per hire | average loaded cost by team, weighted 40 % engineering, 35 % sales, 15 % customer success, 10 % G&A | `sql/07_hire_cost_by_team.sql` |
| Other opex | average of the last 3 months | Changed by the opex slider (-30 % to +30 %) |
| Funding | none | Optional amount in a chosen month |

Each projected month: MRR = previous MRR x (1 + growth - churn). Cash = previous cash + MRR - payroll - opex + funding. Collections are assumed equal to revenue in the projection.
