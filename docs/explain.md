# Explain: how this project works, for Knut

This is your guide to the project. Read it once from top to bottom. Everything is in plain English. All data is fictional.

## The one-paragraph version

A Python script invents 24 months of data for a fictional SaaS company. DuckDB turns that data into metrics with SQL. The metrics are exported to one JSON file. A Next.js website shows that file as a dashboard. Sliders and three preset buttons on the website project cash forward. For each month there is a draft investor update: the subject and a key metrics table come straight from the data, and Claude drafted the short text parts (TL;DR, highlights, lowlights, ask) for a founder to finish. A separate script without AI checks those text parts.

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

### Runway at current burn
- **Shows:** how many months the cash lasts at today's pace, and the month it would run out. The label says "at current burn" because it assumes burn stays at the trailing 3-month average, unlike the scenario projection.
- **Formula:** closing cash / average net burn of the last 3 months. Zero-cash month = this month + runway, rounded up.
- **Computed in:** `sql/04_runway.sql`.
- **Why 3 months:** one month is too noisy because of annual invoices. Twelve months would still be showing the cheaper period before the spring 2026 hiring push. Three is a middle ground and the dashboard says it is used.

### ARR
- **Shows:** annual recurring revenue and its growth versus 12 months earlier.
- **Formula:** closing MRR x 12. Growth = ARR / ARR 12 months ago - 1.
- **Computed in:** `sql/06_unit_metrics.sql`.
- **Why:** the standard size measure for a subscription business. Year-on-year growth avoids monthly noise.

The small lines under each KPI (sparklines) show the same number for every month up to the selected one. Hovering over a line, or dragging a finger along it on a phone, shows the month and the exact value just above the line (for example "Jul 2026: €1.785.615", or "14,3 months" for runway). Where: `Sparkline` in `web/components/charts.tsx`.

### Gross margin (used in the AI fact sheet and the docs, not a KPI card)
- **Formula:** (revenue - cost of revenue) / revenue. Cost of revenue = cloud hosting + payroll of the customer success team.
- **Computed in:** `sql/03_monthly_summary.sql`.
- **Value:** 63,4 % in Sep 2026. The first version counted hosting only and showed about 91 %, which flattered the business. See question 7.

## The charts

### Cash curve (main chart)
- **Shows:** actual cash for 24 months (solid line) and a 24-month projection (dashed line) that moves with the sliders. The red dashed line is €0. If cash falls below zero, a red vertical line marks the month.
- **Line under the chart:** one sentence that reads the current projection: either "With these settings cash runs out in Mon YYYY" (in red) or "With these settings cash bottoms out at €X in Mon YYYY". Below it, one line on the two biggest simplifications: new hires add cost but do not change the growth slider, and customers are assumed to pay in the month revenue is earned (annual upfront billing is ignored in the projection).
- **Formula, each projected month:**
  - MRR = last MRR x (1 + growth - churn).
  - Payroll = (today's payroll + full-time hires started x cost per hire + student assistants x €1.420) x salary factor. The salary factor is 1 until the first January, 1,03 in 2027 and 1,0609 in 2028: all payroll rises 3 % every January.
  - Cash = last cash + MRR - payroll - other costs + funding.
- **Sliders:** full-time hires (0 to 15, spread evenly over 12 months), student assistants (0 to 6, part-time, all start in the first projected month), growth, churn, other costs, new funding.
- **Presets** (buttons above the sliders; clicking one sets the sliders, moving a slider afterwards is fine and clears the highlight):
  - *Current plan* (on load; Reset returns here): 2 full-time hires, 2 student assistants, growth and churn at their 12-month trend, no change to other costs, no funding.
  - *Hiring push*: as Current plan with 6 full-time hires.
  - *Downside*: as Current plan with growth at half the trend and churn at 1,5 times the trend.
- **Results from Sep 2026 (€1,58m in the bank):** Current plan runs out of cash in Feb 2028; Hiring push and Downside both run out in Nov 2027. The runway KPI (burn stays as it is) says Dec 2027.
- **Computed in:** `web/lib/scenario.ts` (browser). Same logic in `scripts/check_scenario.py` (Python). Starting values, the student assistant cost and the 3 % raise come from `sql/08_scenario_base.sql`, so both versions read the same numbers.
- **Why:** it answers "what if" questions live. It is labelled as assumptions, not a forecast.

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
- **Shows:** a draft for the selected month (Oct 2025 to Sep 2026) in five parts, then the check result:
  1. Subject: "Nordlys Analytics: Mon YYYY update". Not AI.
  2. TL;DR: one sentence with the most important thing this month and what it means. AI.
  3. Key metrics table: cash, net burn, runway at current burn, MRR, ARR growth, customers, headcount, each with the change vs last month. Not AI: from `sql/09_update_metrics.sql`.
  4. Up to two highlights and two lowlights, one short sentence each. AI.
  5. Ask: one concrete thing investors can help with. AI.
- **Placeholders:** the data shows what happened, not why. Where a reason matters (why a customer left, what a fee was for, why someone was hired), the AI writes "[Founder: add reason]" instead of guessing. The dashboard highlights these. The drafts are for a founder to finish.
- **Computed in:** `scripts/write_updates.py` (draft, prompt v2) and `scripts/check_updates.py` (check). Card: `web/components/UpdateCard.tsx`.
- **History:** v1 was 120 to 180 words of prose. After reviewing two v1 drafts (Apr and Jul 2026) they were too dense (20 or more numbers in running text), had no ask, and wrote as the founder about causes the founder would know but the data does not. v1 is kept in `data/ai/updates_v1.csv`.

## Main design choices and why

1. **All maths in SQL views, one per file.** One place the numbers come from. Anyone can open a `.sql` file and read the formula.
2. **A static website.** No server and no database online. Cheap, fast and nothing to break. The trade-off: new data means rebuilding.
3. **Sliders run in the browser in one small file.** The logic is readable top to bottom, and a test proves it matches an independent Python version to within €1 every month.
4. **AI text generated once and stored.** Repeatable, cheap (about USD 0,07 for all 12 drafts, each time) and reviewable. Visitors never trigger an API call.
5. **The AI gets a prepared fact sheet, not raw data.** It can only use numbers we gave it, and a script can check them. The numbers investors need most sit in a table built from SQL, so the AI text only has to carry the story.
6. **Honest check results.** The v2 check was run once: 0 of 12 drafts pass every rule. The results are shown, not regenerated away.
7. **Planted story.** The data has a hiring push, a big churn, a price increase, a strong expansion month and a one-off fee, so the dashboard and the updates have something to explain.

## Checks you can run

| Command | What it checks | Current result |
|---|---|---|
| `python scripts/reconcile.py` | Cash roll-forward, MRR movements against customer snapshots, payroll against headcount, opex, collections against billing | 8 of 8 pass |
| `python scripts/check_scenario.py` | Sanity checks on the projection (month 1 cash, hiring spread, 3 % raise every January, presets) | 8 of 8 pass |
| `cd web && npm test` | Python and TypeScript projections are equal within €1, for each of the three presets and a stress case; preset buttons set the same values as Python | 5 of 5 pass |
| `python scripts/write_updates.py` (first lines) | Look-ahead test: the input for each month uses no later data | pass |
| `python scripts/check_updates.py` | Numbers, named causes, structure and style of the AI parts (v2) | 0 of 12 drafts pass, 137 of 145 numbers match |
| `node scripts/screenshots.mjs` | A finger dragged along a sparkline at 375 px moves the tooltip; presets highlight and clear correctly | both pass |

## 13 likely interview questions

**1. Why trailing 3 months for burn?**
Annual customers pay upfront, so one month's burn can be very high or even negative. Three months smooths that but still reacts fast. When we hired six people in spring 2026, the 3-month average showed it within one or two months. A 12-month average would still be showing last year's lower costs.

**2. Why does the runway KPI say Dec 2027 but Current plan says Feb 2028?**
They answer different questions. The KPI says: if nothing changes, burn stays at the trailing 3-month average. Current plan assumes revenue keeps growing at the past year's pace, and also adds 2 hires, 2 student assistants and a 3 % raise every January. Growth wins by about two months. Hiring push and Downside both run out in Nov 2027, one month before the KPI date. So the KPI is a reasonable middle, and the presets show the range.

**3. How do you know the AI text is right?**
I do not trust it by default. The model only gets a fact sheet built from the SQL views, and the key numbers sit in a table that does not come from the AI at all. Then a separate script, without AI, checks every number in the AI text against that fact sheet, flags causes the data does not support, and checks the format rules. In v2, 137 of 145 numbers matched. Four misses are real rounding errors (€128.684 written as €128k). Four are "100%", the threshold from the fact sheet, which the checker cannot match: that is a weakness of my checker. No draft passed every rule, mostly because the model put three or four numbers in one sentence where I asked for two. I left that visible. The check does not judge writing quality; the founder still reads and finishes each draft.

**4. How do you know the AI did not see the future?**
For each month I rebuild the database with every later month deleted, build the input again and check it is identical. If it is not, the script stops before calling the API. My previous project had a look-ahead bug, so this test is there on purpose.

**5. Why not a forecast model?**
With 24 months of synthetic data, a statistical forecast would look precise but mean little. A transparent driver model (growth, churn, hires, costs) is easier to explain and to challenge. In a real company, the board conversation is about those drivers anyway.

**6. What would change with real data?**
The generator would be replaced by exports from the billing system, payroll and the bank. Revenue recognition would need proration and deferred revenue. Collections would have payment terms and late payers. The SQL views and the dashboard would mostly stay the same, which is the point of keeping the calculations in one place.

**7. How do you define gross margin, and why is it about 63 %?**
Cost of revenue is cloud hosting plus the payroll of the customer success team, because those are the costs of serving the customers we already have. Sep 2026: 63,4 %. The first version counted hosting only and showed about 91 %, which flattered the business, so I changed it. Third-party software could also go in, but the data does not say which tools serve customers, so it stays in operating costs.

**8. What is the burn multiple and why is it 12,3 in Sep 2026?**
Net burn divided by net new ARR, over 3 months. It says how many euros we burned for each euro of new ARR. Lower is better. It is high because the largest customer (€9.400 MRR) churned in July and cancelled out most of the new ARR won in Jul to Sep. Aug (7,1) is high for the same reason. In Jul itself ARR shrank over the 3 months, so the ratio is not meaningful, and the dashboard says so instead of showing a number. I kept the 3-month method and added a note rather than switching to a longer window that would hide the event.

**9. How do you know the numbers add up?**
A reconciliation script checks the raw data before anything else runs: cash rolls forward every month, MRR movements add up to the customer-level snapshot, payroll equals the headcount table, and collections equal monthly payments plus annual invoices. All 8 checks pass. The browser projection is tested against a Python version.

**10. What did you do and what did Claude Code do?**
Be honest and specific. Claude Code wrote the code from a detailed brief I wrote: the company, the planted story, the metric definitions, the checks and the rules (no invented sources, fictional data, look-ahead test, cost cap). My job was to review the output, the decisions log and the check results (only say this once you have done it). I can explain every formula because they are written down in `docs/metrics.md` and each lives in one SQL file.

**11. Why does the projection never hit zero in Current plan, or does it?**
It does: Current plan runs out of cash in Feb 2028. The first version of the dashboard opened on "no hires, no changes", and there cash never reached zero within 24 months (lowest point about €42k in Sep 2028), because MRR keeps growing at the past year's trend. Current plan is more realistic: it adds 2 full-time hires, 2 student assistants and a 3 % raise every January. Together those extra costs are enough to push the line below zero in Feb 2028, before revenue growth can catch up. The line under the chart says this in words, and it turns red when cash runs out.

**12. Why are student assistants a separate slider?**
Because they cost very differently. A student assistant works about 15 hours a week and costs about €1.420 a month including holiday pay (65 hours x DKK 145, plus 12,5 % holiday pay, at 7,46 DKK per EUR), against about €6.700 for a full-time hire. If I counted them as hires, two students would look like €13.400 a month instead of €2.840. They also start straight away, while full-time hires are spread over 12 months. The calculation is in `docs/assumptions.md` and is my own assumption, not a published rate.

**13. Why does the AI leave placeholders instead of writing the causes?**
Because the data only shows what happened, not why. The data shows that the largest customer left in July, but not why it left. It shows €26.668 of professional fees in April, about ten times the usual level, but not what they were for. The first version of the prompt made the model write as the founder, and it filled those gaps with vague phrases like "understanding why that customer left". An investor would read that as the founder not knowing their own business. Now the model writes "[Founder: add reason]" and the founder fills it in. That makes it an honest draft: the AI does the numbers and the structure, the human adds what only the human knows.

## Where to look first in the code

1. `sql/04_runway.sql`: the runway formula, 20 lines.
2. `web/lib/scenario.ts`: the slider logic and the three presets, with comments.
3. `scripts/write_updates.py` (the v2 prompt, near the top) and `scripts/check_updates.py` (how the AI text is checked).
4. `scripts/generate.py`: the planted story is at the top.
5. `docs/decisions.md`: every choice made without you.
