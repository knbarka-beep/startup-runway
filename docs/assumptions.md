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
- Gross margin counts only cloud hosting as cost of revenue (see `docs/metrics.md`).

## Scenario projection (sliders)

- Default growth and churn rates are trailing 12-month averages from the actuals.
- Collections in the projection equal revenue (no annual upfront timing).
- Other opex stays flat at its trailing 3-month average unless the slider changes it.
- New hires are spread evenly over the first 12 months and cost the mix-weighted average loaded cost.
- These are assumptions for exploring "what if", not a forecast.
