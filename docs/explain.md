# Explain: how this project works, for Knut

This is your guide to the project. Read it once from top to bottom. All data is fictional.

## The short version

A Python script makes up 24 months of data for a fictional SaaS company. DuckDB turns that data into metrics with SQL, and the metrics go into one JSON file. A Next.js website shows that file as a dashboard. On the website, sliders and three preset buttons project cash forward. Each month also has a draft investor update. The subject and the key metrics table come straight from the data. Claude wrote the short text parts (TL;DR, highlights, lowlights, ask) as a draft for a founder to finish. A separate script, with no AI in it, checks those text parts.

```
generate.py -> data/raw/*.csv -> reconcile.py (checks)
            -> build_db.py + sql/*.sql -> data/export/dashboard.json -> web/ (static site)
            -> write_updates.py (Claude) -> data/ai/updates.csv -> check_updates.py
```

## Cash versus revenue

This is the one accounting idea you need. Revenue is what the company has earned. Cash is what has actually arrived in the bank.

Monthly customers pay every month, so for them cash and revenue are the same. Annual customers pay 12 months up front. In the month they renew, a lot of cash comes in. In the next 11 months none comes in, even though the company earns revenue from them every month.

So net burn, which is about cash, jumps around a lot. In a few months it is even negative, meaning more cash came in than went out. EBITDA is based on revenue, so it is much smoother. Runway is about cash, so it uses net burn, smoothed over 3 months.

Where to look: `scripts/generate.py` has the billing rules. `scripts/reconcile.py` checks that collections equal monthly payments plus annual invoices.

## The four KPIs

### Cash in bank
- **Shows:** money in the bank at the end of the selected month.
- **Formula:** opening cash + collections - payments + funding.
- **Computed in:** `data/raw/cash.csv` (from the generator), shown as `closing_cash` in `sql/03_monthly_summary.sql`.
- **Why:** this is the number that decides how long the company survives.

### Net burn (monthly)
- **Shows:** how much more cash went out than came in that month.
- **Formula:** payments - collections. Funding is left out.
- **Computed in:** `sql/03_monthly_summary.sql` (`net_burn`).
- **Why cash and not profit:** a company dies when the cash runs out, not when profit is negative. The card also shows the 3-month average.

### Runway at current burn
- **Shows:** how many months the cash lasts at today's pace, and the month it would run out. The label says "at current burn" because it assumes burn stays at the 3-month average. The scenario projection does not assume that.
- **Formula:** closing cash / average net burn over the last 3 months. Zero-cash month = this month + runway, rounded up.
- **Computed in:** `sql/04_runway.sql`.
- **Why 3 months:** one month is too noisy because of the annual invoices. Twelve months would still include the cheaper period before the spring 2026 hiring push. Three months sits in between, and the dashboard says which method it uses.

### ARR
- **Shows:** annual recurring revenue, and its growth against 12 months earlier.
- **Formula:** closing MRR x 12. Growth = ARR / ARR 12 months ago - 1.
- **Computed in:** `sql/06_unit_metrics.sql`.
- **Why:** it is the standard way to measure the size of a subscription business. Comparing with a year ago avoids the month-to-month noise.

The small lines in each KPI card (sparklines) show the same number for every month up to the selected one. Hover over a line, or drag a finger along it on a phone, and the month and exact value appear just above it, for example "Jul 2026: €1.785.615", or "14,3 months" for runway. Where: `Sparkline` in `web/components/charts.tsx`.

### Gross margin (used in the AI fact sheet and the docs, not a KPI card)
- **Formula:** (revenue - cost of revenue) / revenue. Cost of revenue = cloud hosting + payroll of the customer success team.
- **Computed in:** `sql/03_monthly_summary.sql`.
- **Value:** 63,4 % in Sep 2026. The first version only counted hosting and showed about 91 %, which made the business look better than it is. See question 7.

## The charts

### Cash curve (main chart)
- **Shows:** actual cash for 24 months (solid line) and a 24-month projection (dashed line) that moves with the sliders. The red dashed line is €0. If cash goes below zero, a red vertical line marks that month.
- **Line under the chart:** one sentence that reads the current projection. It says either "With these settings cash runs out in Mon YYYY" (in red) or "With these settings cash bottoms out at €X in Mon YYYY". Below it is one line about the two biggest simplifications: new hires add cost but do not change the growth slider, and customers are assumed to pay in the month the revenue is earned, so the projection ignores annual upfront billing.
- **Formula, for each projected month:**
  - MRR = last month's MRR x (1 + growth - churn).
  - Payroll = (today's payroll + full-time hires started x cost per hire + student assistants x €1.420) x salary factor. The salary factor is 1 until the first January, 1,03 in 2027 and 1,0609 in 2028, because all payroll goes up 3 % every January.
  - Cash = last month's cash + MRR - payroll - other costs + funding.
- **Sliders:** full-time hires (0 to 15, spread evenly over 12 months), student assistants (0 to 6, part-time, all starting in the first projected month), growth, churn, other costs and new funding.
- **Presets:** the buttons above the sliders. Clicking one sets the sliders. You can move a slider afterwards, and then the button is no longer highlighted.
  - *Current plan* (what you see on load, and what Reset goes back to): 2 full-time hires, 2 student assistants, growth and churn at their 12-month trend, no change to other costs, no funding.
  - *Hiring push*: Current plan with 6 full-time hires.
  - *Downside*: Current plan with growth at half the trend and churn at 1,5 times the trend.
- **Results from Sep 2026 (€1,58m in the bank):** Current plan runs out of cash in Feb 2028. Hiring push and Downside both run out in Nov 2027. The runway KPI, which assumes burn stays as it is, says Dec 2027.
- **Computed in:** `web/lib/scenario.ts` in the browser, and the same logic in Python in `scripts/check_scenario.py`. The starting values, the student assistant cost and the 3 % raise come from `sql/08_scenario_base.sql`, so both versions read the same numbers.
- **Why:** it answers "what if" questions while you watch. The page says it is assumptions, not a forecast.

### MRR bridge (waterfall)
- **Shows:** why MRR changed in the selected month. Opening MRR, plus new, plus expansion, minus contraction, minus churn, gives closing MRR.
- **Computed in:** `sql/02_mrr_bridge.sql`.
- **Why:** the total change in MRR does not tell you whether growth came from new customers or existing ones. The bridge splits it up.
- **Note:** the axis does not start at zero, and the chart says so. If it did, the movements would be too small to see.

### Where the money goes (burn drivers)
- **Shows:** payroll by team and other costs by category for the selected month.
- **Computed in:** `sql/05_burn_drivers.sql`.
- **Why:** payroll is about 80 % of spending. This chart makes that obvious and shows which team costs the most.

### Draft investor update
- **Shows:** a draft for the selected month (Oct 2025 to Sep 2026) in five parts, then the check result:
  1. Subject: "Nordlys Analytics: Mon YYYY update". Not AI.
  2. TL;DR: one sentence, at most 30 words and two numbers. It names the main event of the month (a churn, a hiring push, a one-off cost, a strong expansion month) and what it means. It may not open with the change in runway, because runway is already in the table and the early runway changes are mostly annual billing timing. AI.
  3. Key metrics table: cash, net burn, runway at current burn, MRR, ARR growth, customers and headcount, each with the change from last month. Not AI. It comes from `sql/09_update_metrics.sql`.
  4. Up to two highlights and two lowlights, one short sentence each. AI.
  5. Ask: one concrete thing investors can help with. AI.
- **Placeholders:** the data shows what happened, not why. When a reason matters (why a customer left, what a fee was for, why someone was hired), the AI writes "[Founder: add reason]" at the end of the sentence instead of guessing. The dashboard highlights these. The drafts are for a founder to finish.
- **Pre-formatted numbers:** Python gives every number in the fact sheet twice, exact and in a display form: "€55.811 (display: €55,8k)", "€1.579.630 (display: €1,58m)", "93,04 % (display: 93,0 %)". The model must copy one of the two and never round on its own.
- **Validate and retry:** the model does not follow format rules reliably, so the pipeline checks every draft and asks for one or two corrections. Both the first-attempt and final results are shown. Right after each draft, `write_updates.py` runs the same checks as `check_updates.py`. If the draft fails, one follow-up message in the same conversation lists the failed checks and the sentence or number that broke them, and asks for a new full draft. There are at most two retries, so three attempts in total. The last attempt is kept, pass or fail. Every attempt is saved in `data/ai/update_attempts.csv`, and the card shows which attempt was kept and its check result.
- **Result (v3, run once):** 6 of 12 first drafts passed. After retries all 12 pass, and all 94 numbers in the kept drafts match. Six months (Dec 2025 to May 2026) needed one retry each. The most common first-attempt failure was three or four numbers in one highlight or lowlight (3 months). Two of the failures were false flags from the cause check ("Contraction MRR was €0", "churn was zero"). The checker was not changed after the run. The run used 18 API calls and cost USD 0,1393.
- **Computed in:** `scripts/write_updates.py` (draft, prompt v3, check and retry) and `scripts/check_updates.py` (the check). The card is `web/components/UpdateCard.tsx`.
- **History:** v1 was 120 to 180 words of running text. After two v1 drafts (Apr and Jul 2026) were reviewed, three problems stood out. They were too dense, with 20 or more numbers in the text. They had no ask. And they wrote as the founder about causes a founder would know but the data does not show. v2 introduced the five parts and passed 0 of 12 checks. The main reasons were too many numbers per sentence, and three numbers the model rounded wrongly (€55k for €55.811). v3 added the pre-formatted numbers, the TL;DR rules and validate and retry. v1 and v2 are kept in `data/ai/updates_v1.csv` and `updates_v2.csv`. v3 is the last prompt change for this project.

## Main design choices and why

1. **All the maths sits in SQL views, one per file.** There is one place the numbers come from, and anyone can open a `.sql` file and read the formula.
2. **The website is static.** There is no server and no online database. It is cheap and fast and has little that can break. The downside is that new data means a rebuild.
3. **The sliders run in the browser, in one small file.** You can read the logic from top to bottom, and a test shows it matches a separate Python version to within €1 every month.
4. **The AI text is generated once and stored.** That makes it repeatable, cheap and easy to review. v1 and v2 cost about USD 0,07 each for 12 drafts, and v3 cost USD 0,14 with its 6 retries. Visitors never trigger an API call.
5. **The AI gets a prepared fact sheet, not the raw data.** It can only use numbers we gave it, and a script can check them. The numbers investors care about most are in a table built from SQL, so the AI text only has to tell the story.
6. **The check results are shown honestly.** Each AI run was done once. The page shows both the first-attempt result (6 of 12) and the result after retries (12 of 12), and the retry rule and its limit were fixed before the run.
7. **The data has a planted story.** A hiring push, a big churn, a price increase, a strong expansion month and a one-off fee give the dashboard and the updates something to explain.

## Checks you can run

| Command | What it checks | Current result |
|---|---|---|
| `python scripts/reconcile.py` | Cash roll-forward, MRR movements against customer snapshots, payroll against headcount, opex, collections against billing | 8 of 8 pass |
| `python scripts/check_scenario.py` | Sanity checks on the projection (month 1 cash, how hires are spread, 3 % raise every January, presets) | 8 of 8 pass |
| `cd web && npm test` | Python and TypeScript projections are equal within €1 for each of the three presets and a stress case, and the preset buttons set the same values as Python | 5 of 5 pass |
| `python scripts/write_updates.py` (first lines) | Look-ahead test: the input for each month uses no later data | pass |
| `python scripts/check_updates.py` | Numbers, named causes, structure and style of the AI parts (v3), after a self-test of the checker | 12 of 12 kept drafts pass (6 of 12 on the first attempt), 94 of 94 numbers match |
| `node scripts/screenshots.mjs` | Dragging a finger along a sparkline at 375 px moves the tooltip, and presets highlight and clear correctly | both pass |

## 15 likely interview questions

Read these, then say the answers in your own words. Do not learn them by heart.

**1. Why use the last 3 months for burn?**
Annual customers pay up front, so the burn in a single month can be very high or even negative. Three months smooths that out but still reacts quickly. When the company hired six people in spring 2026, the 3-month average picked it up within a month or two. A 12-month average would still mostly reflect last year's lower costs.

**2. Why does the runway KPI say Dec 2027 when Current plan says Feb 2028?**
They answer different questions. The KPI asks: what if burn stays at the 3-month average? Current plan assumes revenue keeps growing at last year's pace, and it also adds 2 hires, 2 student assistants and a 3 % raise every January. The growth wins by about two months. Hiring push and Downside both run out in Nov 2027, one month before the KPI date. So the KPI sits in the middle, and the presets show the range around it.

**3. How do you know the AI text is right?**
I don't assume it is. The model only gets a fact sheet built from the SQL views, and the most important numbers are in a table the AI never touches. Then a separate script without AI checks every number in the AI text against the fact sheet. It also flags causes the data doesn't support and checks the format rules. In v2 the model rounded three numbers wrongly, for example €128.684 written as €128k, and no draft passed every rule. In v3 the numbers come pre-formatted, and the script checks each draft and asks for a correction when it fails. Half the first drafts failed. After at most one retry each, all 12 pass and all 94 numbers match, and both results are on the page. The checker isn't perfect either. It has been changed twice because of false flags, and in the v3 run it flagged two correct sentences, like "churn was zero", as unsupported causes. It also doesn't judge how well the text is written. The founder still reads and finishes every draft.

**4. How do you know the AI didn't see the future?**
For each month, the script rebuilds the database with all later months deleted, builds the input again and checks that it comes out the same. If it doesn't, the script stops before it calls the API. My previous project had a look-ahead bug, so this test is there on purpose.

**5. Why not a forecast model?**
With 24 months of made-up data, a statistical forecast would look precise but wouldn't mean much. A simple driver model with growth, churn, hires and costs is easier to explain and easier to challenge. In a real company, the board discusses those drivers anyway.

**6. What would change with real data?**
Exports from the billing system, payroll and the bank would replace the generator. Revenue would need proration and deferred revenue. Collections would have payment terms and customers who pay late. The SQL views and the dashboard would mostly stay the same, and that is the point of keeping all the calculations in one place.

**7. How do you define gross margin, and why is it about 63 %?**
Cost of revenue is cloud hosting plus the pay of the customer success team, because those are the costs of serving the customers we already have. In Sep 2026 that gives 63,4 %. The first version only counted hosting and showed about 91 %, which made the business look better than it is, so I changed it. You could also include third-party software, but the data doesn't say which tools serve customers, so it stays in operating costs.

**8. What is the burn multiple, and why is it 12,3 in Sep 2026?**
It is net burn divided by net new ARR over 3 months. It tells you how many euros the company burned for each euro of new ARR, and lower is better. It is high because the largest customer (€9.400 MRR) left in July and wiped out most of the new ARR won from July to September. August (7,1) is high for the same reason. In July itself, ARR shrank over the 3 months, so the ratio means nothing, and the dashboard says that instead of showing a number. I kept the 3-month window and added a note, because a longer window would hide the event.

**9. How do you know the numbers add up?**
Before anything else runs, a reconciliation script checks the raw data. Cash rolls forward every month, MRR movements add up to the customer-level snapshot, payroll equals the headcount table, and collections equal monthly payments plus annual invoices. All 8 checks pass. The projection in the browser is also tested against a Python version.

**10. What did you do, and what did Claude Code do?**
Be honest and specific here. Claude Code wrote the code from a detailed brief. The brief set the company, the planted story, the metric definitions, the checks and the rules: no invented sources, fictional data, a look-ahead test and a cost cap. I read the investor update drafts and decided to change their format, and I made the calls on gross margin, the presets, the student wage and the retry rule. (Only add "I checked the key numbers against the raw data in Excel" once you have done that check yourself. Check that the whole list matches what you actually did before you say it.) I can explain every formula, because each one is written down in `docs/metrics.md` and lives in one SQL file.

**11. Why does the projection never hit zero in Current plan? Or does it?**
It does. Current plan runs out of cash in Feb 2028, and the lowest point is -€475.864 in Sep 2028, the last projected month. The first version of the dashboard opened on "no hires, no changes", and there cash never reached zero within 24 months. The lowest point was about €42k in Sep 2028, because MRR keeps growing at last year's trend. Current plan is more realistic. It adds 2 full-time hires, 2 student assistants and a 3 % raise every January, and those extra costs push the line below zero in Feb 2028, before revenue growth can catch up. The line under the chart says this in words and turns red when cash runs out.

**12. Why are student assistants a separate slider?**
Because they cost much less. A student assistant works about 15 hours a week and costs €1.420 a month including holiday pay: 65 hours x DKK 145, plus 12,5 % holiday pay, at 7,46 DKK per EUR. A full-time hire costs about €6.700. If students counted as hires, two of them would show up as €13.400 a month instead of €2.840. They also start straight away, while full-time hires are spread over 12 months. The calculation is in `docs/assumptions.md`. It is my own assumption, not a published rate. The first version used €1.900, which had been worked out backwards, with an hourly wage picked to hit a target number. Now it starts from the wage and works forwards.

**13. Why does the AI leave placeholders instead of writing the causes?**
Because the data shows what happened, not why. It shows that the largest customer left in July, but not why it left. It shows €26.668 of professional fees in April, about ten times the usual level, but not what they were for. In the first version the model wrote as the founder, and it filled those gaps with vague lines like "understanding why that customer left". An investor would read that as a founder who doesn't know their own business. Now the model writes "[Founder: add reason]" and the founder fills it in. The AI handles the numbers and the structure, and the person adds what only they know.

**14. Isn't retrying until it passes a kind of cheating?**
It would be if I kept going until I liked the result, or quietly showed only the final drafts. Three things prevent that. First, the rule and the limit were set and committed before the run: at most two retries per month, the last attempt kept whether it passes or not, and the run done once. Second, both results are shown: 6 of 12 passed on the first attempt and 12 of 12 after retries, and every attempt is stored. Third, the retry only gets the checker's output, meaning which checks failed and the sentence or number that broke them, never the correct values. The model has to fix its own draft from its own fact sheet. That is also how a founder would use it: a draft that breaks a rule goes back for a fix before anyone reads it. What it doesn't prove is that the model follows the rules on its own. The first-attempt result says it does about half the time. One more honest point: two of the six retries were caused by false flags in my cause check, so those two months didn't actually need a retry.

**15. Why give the model pre-formatted numbers?**
Because it rounded wrongly on its own. In v1 and v2 it wrote €55k for €55.811 three times, and also €99k for €99.519 and €128k for €128.684. It cut numbers off instead of rounding them. Rounding is easy for Python and unreliable for a language model, so Python does it now. Every number comes as "€55.811 (display: €55,8k)", and the model copies one of the forms. In the v3 run no draft had a wrongly rounded number. It also keeps the text consistent with the dashboard, and the checker accepts both forms.

## Where to look first in the code

1. `sql/04_runway.sql`: the runway formula, 20 lines.
2. `web/lib/scenario.ts`: the slider logic and the three presets, with comments.
3. `scripts/write_updates.py` (the v3 prompt near the top, the retry loop in `main()`) and `scripts/check_updates.py` (how the AI text is checked).
4. `scripts/generate.py`: the planted story is at the top.
5. `docs/decisions.md`: every choice made without you.
