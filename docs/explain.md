# Explain: how this project works, for Knut

This is your guide to the project. Read it once from top to bottom. Everything is in plain English. All data is fictional.

## The one-paragraph version

A Python script invents 24 months of data for a fictional SaaS company. DuckDB turns that data into metrics with SQL. The metrics are exported to one JSON file. A Next.js website shows that file as a dashboard. Sliders on the website project cash forward. Claude wrote one investor update per month from that month's numbers, and a separate script without AI checks the numbers in those updates.

```
generate.py -> data/raw/*.csv -> reconcile.py (checks)
            -> build_db.py + sql/*.sql -> data/export/dashboard.json -> web/ (static site)
            -> write_updates.py (Claude) -> data/ai/updates.csv -> check_updates.py
```

## Cash versus revenue (the one accounting idea you need)

Revenue is what the company has earned. Cash is what has actually arrived in the bank.

Monthly customers pay every month, so for them cash and revenue match. Annual customers pay 12 months in advance. So in a renewal month a lot of cash arrives, and in the next 11 months none does, even though revenue is earned every month.

That is why net burn (cash) jumps around a lot, and in a few months is even negative (more cash in than out). EBITDA (revenue based) is much smoother. Runway is about cash, so it uses net burn, smoothed over 3 months.

Where: `scripts/generate.py` (billing rules) and `scripts/reconcile.py` (the check that collections equal monthly payments plus annual invoices).

## The four KPIs

### Cash in bank
- **Shows:** money in the bank at the end of the selected month.
- **Formula:** opening cash + collections - payments + funding.
- **Computed in:** `data/raw/cash.csv` (from the generator), exposed as `closing_cash` in `sql/03_monthly_summary.sql`.
- **Why:** it is the number that decides how long the company survives.

### Net burn (monthly)
- **Shows:** how much more cash went out than came in that month.
- **Formula:** payments - collections. Funding is not counted.
- **Computed in:** `sql/03_monthly_summary.sql` (`net_burn`).
- **Why cash and not profit:** a company dies when cash runs out, not when profit is negative. The card also shows the 3-month average.

### Runway
- **Shows:** how many months the cash lasts at today's pace, and the month it would run out.
- **Formula:** closing cash / average net burn of the last 3 months. Zero-cash month = this month + runway, rounded up.
- **Computed in:** `sql/04_runway.sql`.
- **Why 3 months:** one month is too noisy because of annual invoices. Twelve months would still be showing the cheaper period before the spring 2026 hiring push. Three is a middle ground and the dashboard says it is used.

### ARR
- **Shows:** annual recurring revenue and its growth versus 12 months earlier.
- **Formula:** closing MRR x 12. Growth = ARR / ARR 12 months ago - 1.
- **Computed in:** `sql/06_unit_metrics.sql`.
- **Why:** the standard size measure for a subscription business. Year-on-year growth avoids monthly noise.

The small lines under each KPI (sparklines) show the same number for every month up to the selected one.

## The charts

### Cash curve (main chart)
- **Shows:** actual cash for 24 months (solid line) and a 24-month projection (dashed line) that moves with the sliders. The red dashed line is €0. If cash falls below zero, a red label shows the month.
- **Formula, each projected month:** MRR = last MRR x (1 + growth - churn). Payroll = today's payroll + hires started x cost per hire. Cash = last cash + MRR - payroll - other costs + funding.
- **Computed in:** `web/lib/scenario.ts` (browser). Same logic in `scripts/check_scenario.py` (Python). Starting values from `sql/08_scenario_base.sql`.
- **Why:** it answers "what if" questions live. It is labelled as assumptions, not a forecast.
- **Note:** at default settings cash does not reach zero within 24 months (lowest point about €42k in Sep 2028), while the runway KPI says Dec 2027. Both are right: the KPI assumes burn stays as it is; the projection assumes MRR keeps growing at the recent trend. Be ready to explain that difference. It is a good talking point.

### MRR bridge (waterfall)
- **Shows:** why MRR changed in the selected month: opening MRR, plus new, plus expansion, minus contraction, minus churn, equals closing MRR.
- **Computed in:** `sql/02_mrr_bridge.sql`.
- **Why:** the change in MRR on its own hides whether growth comes from new customers or from existing ones. The bridge shows the parts.
- **Note:** the axis does not start at zero, and the chart says so. Otherwise the movements would be too small to see.

### Where the money goes (burn drivers)
- **Shows:** payroll by team and other costs by category for the selected month.
- **Computed in:** `sql/05_burn_drivers.sql`.
- **Why:** payroll is about 80 % of spending. This makes that obvious and shows which team drives it.

### Draft investor update
- **Shows:** Claude's draft for the selected month (Oct 2025 to Sep 2026) and whether the number check passed.
- **Computed in:** `scripts/write_updates.py` (draft) and `scripts/check_updates.py` (check).

## Main design choices and why

1. **All maths in SQL views, one per file.** One place the numbers come from. Anyone can open a `.sql` file and read the formula.
2. **A static website.** No server and no database online. Cheap, fast and nothing to break. The trade-off: new data means rebuilding.
3. **Sliders run in the browser in one small file.** The logic is readable top to bottom, and a test proves it matches an independent Python version to within €1 every month.
4. **AI text generated once and stored.** Repeatable, cheap (about USD 0,07 for all 12 drafts) and reviewable. Visitors never trigger an API call.
5. **The AI gets a prepared fact sheet, not raw data.** It can only use numbers we gave it, and a script can check them.
6. **Honest check results.** 3 of 284 numbers were rounding errors by the model. They are shown, not hidden.
7. **Planted story.** The data has a hiring push, a big churn, a price increase, a strong expansion month and a one-off fee, so the dashboard and the updates have something to explain.

## Checks you can run

| Command | What it checks | Current result |
|---|---|---|
| `python scripts/reconcile.py` | Cash roll-forward, MRR movements against customer snapshots, payroll against headcount, opex, collections against billing | 8 of 8 pass |
| `python scripts/check_scenario.py` then `cd web && npm test` | Python and TypeScript projections are equal within €1 | pass (2 cases) |
| `python scripts/write_updates.py` (first lines) | Look-ahead test: the input for each month uses no later data | pass |
| `python scripts/check_updates.py` | Numbers and named causes in the AI drafts | 10 of 12 drafts pass, 281 of 284 numbers match |

## 10 likely interview questions

**1. Why trailing 3 months for burn?**
Annual customers pay upfront, so one month's burn can be very high or even negative. Three months smooths that but still reacts fast. When we hired six people in spring 2026, the 3-month average showed it within one or two months. A 12-month average would still be showing last year's lower costs.

**2. Why does the runway KPI say Dec 2027 but the chart says cash lasts beyond Sep 2028?**
They answer different questions. The KPI says: if nothing changes, burn stays where it is. The chart assumes revenue keeps growing at the past year's pace. The truth is probably in between, and the sliders let you test how sensitive it is.

**3. How do you know the AI text is right?**
I do not trust it by default. The model only gets a fact sheet built from the SQL views. Then a separate script, without AI, checks every number against that fact sheet and flags causes that the data does not support. 281 of 284 numbers matched. The three misses were rounding errors, and I left them visible. The check does not judge writing quality; I still read the drafts.

**4. How do you know the AI did not see the future?**
For each month I rebuild the database with every later month deleted, build the input again and check it is identical. If it is not, the script stops before calling the API. My previous project had a look-ahead bug, so this test is there on purpose.

**5. Why not a forecast model?**
With 24 months of synthetic data, a statistical forecast would look precise but mean little. A transparent driver model (growth, churn, hires, costs) is easier to explain and to challenge. In a real company, the board conversation is about those drivers anyway.

**6. What would change with real data?**
The generator would be replaced by exports from the billing system, payroll and the bank. Revenue recognition would need proration and deferred revenue. Collections would have payment terms and late payers. The SQL views and the dashboard would mostly stay the same, which is the point of keeping the calculations in one place.

**7. How do you define gross margin, and why is it about 63 %?**
Cost of revenue is cloud hosting plus the payroll of the customer success team, because those are the costs of serving the customers we already have. Sep 2026: 63,4 %. The first version counted hosting only and showed about 91 %, which flattered the business, so I changed it. Third-party software could also go in, but the data does not say which tools serve customers, so it stays in operating costs.

**8. What is the burn multiple and why is it 12,3 in Sep 2026?**
Net burn divided by net new ARR, over 3 months. It says how many euros we burned for each euro of new ARR. It is high because the largest customer left in July, so net new ARR over those 3 months was small. Lower is better. When ARR shrinks, the ratio is not meaningful, and the dashboard says so instead of showing a number.

**9. How do you know the numbers add up?**
A reconciliation script checks the raw data before anything else runs: cash rolls forward every month, MRR movements add up to the customer-level snapshot, payroll equals the headcount table, and collections equal monthly payments plus annual invoices. All 8 checks pass. The browser projection is tested against a Python version.

**10. What did you do and what did Claude Code do?**
Be honest and specific. Claude Code wrote the code from a detailed brief I wrote: the company, the planted story, the metric definitions, the checks and the rules (no invented sources, fictional data, look-ahead test, cost cap). My job was to review the output, the decisions log and the check results (only say this once you have done it). I can explain every formula because they are written down in `docs/metrics.md` and each lives in one SQL file.

## Where to look first in the code

1. `sql/04_runway.sql`: the runway formula, 20 lines.
2. `web/lib/scenario.ts`: the slider logic, with comments.
3. `scripts/check_updates.py`: how the AI text is checked.
4. `scripts/generate.py`: the planted story is at the top.
5. `docs/decisions.md`: every choice made without you.
