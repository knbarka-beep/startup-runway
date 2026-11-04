# Assumptions

Everything here is an **own assumption** made to build a believable fictional company. None of it comes from a named benchmark or source. With real data, each line would be replaced by actuals or by a sourced figure.

## Company and funding

| Assumption | Value | Status |
|---|---|---|
| Cash before the seed round | €350.000 | own assumption |
| Seed round, received Oct 2024 | €3.000.000 | given in the brief |
| Headcount | 15 in Oct 2024, 25 in Sep 2026 | given in the brief (approximate) |

## Pricing and customers

| Assumption | Value | Status |
|---|---|---|
| List MRR per plan | Starter €450, Growth €1.100, Enterprise €2.800 | own assumption |
| Actual MRR per customer | list price x random factor 0,8 to 1,5, rounded to €10 | own assumption |
| Plan mix of new customers | 50 % Starter, 35 % Growth, 15 % Enterprise | own assumption |
| Share on annual billing | 60 % | own assumption |
| Price increase on new contracts from Jun 2026 | +10 % | own assumption (planted event) |
| New customers per month | about 2,2 rising to 3,0, plus 0,6 from Jul 2026 | own assumption |
| Monthly plan: chance per month of churn / expansion / contraction | 1,8 % / 4 % / 1,5 % | own assumption |
| Annual plan at anniversary: churn / expansion / contraction | 10 % / 25 % / 8 % | own assumption |
| Size of expansion / contraction | +15 to 35 % / -10 to 20 % of MRR | own assumption |
| Largest customer | €9.400 MRR, annual, renews each July | own assumption (planted event) |

## People

| Assumption | Value | Status |
|---|---|---|
| Loaded cost | gross monthly salary x 1,12 (employer pension and other employer costs) | own assumption, deliberately simple |
| Gross monthly salary, engineering | €6.200 to €7.500 | own assumption |
| Gross monthly salary, sales | €5.200 to €6.200 (no commission modelled) | own assumption |
| Gross monthly salary, customer success | €4.600 to €5.300 | own assumption |
| Gross monthly salary, G&A | €5.000 to €6.000 | own assumption |
| Hiring mix used in the scenario sliders | 40 % engineering, 35 % sales, 15 % customer success, 10 % G&A | own assumption |

## Costs

| Category | Rule | Status |
|---|---|---|
| Cloud hosting | €2.500 + 7 % of MRR | own assumption |
| Software | €1.200 + €140 per employee | own assumption |
| Marketing | €5.000 rising to €9.000, +/- 10 % noise | own assumption |
| Office | €2.000 + €300 per employee | own assumption |
| Professional fees | about €2.500 +/- 20 %, plus €24.000 recruiting fee in Apr 2026 | own assumption |
| Other | €1.000 to €2.000 | own assumption |

## Accounting simplifications

- Revenue = MRR. No proration, no deferred revenue table.
- Everything is paid or collected in the month it occurs. No VAT, no corporate tax, no interest on cash.
- Annual customers pay 12 months upfront.
- Cost of revenue is cloud hosting plus customer success payroll. Third-party software is left in operating costs (see `docs/metrics.md`).

## Scenario projection (sliders)

- Default growth and churn rates are trailing 12-month averages from the actuals.
- **Salary increase: all payroll (existing staff, new hires and student assistants) rises 3 % once a year, every January.** Own assumption. Fixed, not a slider. In the projection from Sep 2026 this applies in Jan 2027 (x 1,03) and Jan 2028 (x 1,0609 compared with today). Set in `sql/08_scenario_base.sql` (`annual_salary_increase`).
- **Student assistant: €1.900 loaded cost a month each.** Own assumption, no named source. Calculation:

  | Step | Value |
  |---|---|
  | Hours a week | 15 |
  | Hours a month | 15 x 52 / 12 = 65 |
  | Hourly wage | €26 (about DKK 194 at 7,46 DKK per EUR), own assumption for a typical Danish student wage in a business or tech role |
  | Wage a month | 65 x €26 = €1.690 |
  | Holiday pay 12,5 % | €1.690 x 1,125 = €1.901 |
  | Rounded | **€1.900** |

  No pension or other employer costs are added (smaller for part-time student jobs; left out to keep it simple). Student assistants start in projected month 1 and do not change the growth rate. Set in `sql/08_scenario_base.sql` (`student_assistant_cost`).
- **Presets** (own assumptions, buttons above the sliders):
  - *Current plan* (on load, and what Reset returns to): 2 full-time hires, 2 student assistants, growth and churn at their 12-month trend, no change in other costs, no funding.
  - *Hiring push*: as Current plan, but 6 full-time hires.
  - *Downside*: as Current plan, but growth at half the trend and churn at 1,5 times the trend.
- Collections in the projection equal revenue (no annual upfront timing).
- Other opex stays flat at its trailing 3-month average unless the slider changes it.
- New hires are spread evenly over the first 12 months and cost the mix-weighted average loaded cost.
- These are assumptions for exploring "what if", not a forecast.
