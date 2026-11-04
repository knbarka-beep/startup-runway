# Decisions

Every choice made during the unattended first build, as a list: what, why, and the alternative considered.

**AI status:** the AI step ran. `PORTFOLIO_ANTHROPIC_KEY` is set at Windows user level but was not visible to the build shell, so the script was started from PowerShell with the variable copied from the user environment for that one process. The key was never printed or written to a file.

## Setup

1. **Installed `duckdb` (2.0.0) and `anthropic` (2.4.0) into the existing Anaconda Python.** Neither was installed. Alternative: a virtual environment (cleaner, but one more thing to explain). pip warned about an existing streamlit/protobuf version conflict in that Python; it was there before and is not used by this project.
2. **Plain CSS with CSS variables, no Tailwind or UI library.** Fewer dependencies; easier to read. Alternative: Tailwind.
3. **TypeScript 5.9, not 7.** TypeScript 7 is very new and Next.js support was uncertain. Alternative: latest.
4. **The web test uses Node's built-in test runner (`node --test`) with Node's built-in TypeScript support.** No Jest or Vitest needed. Alternative: Vitest.
5. **The website imports `data/export/dashboard.json` directly at build time** (Turbopack root set to the repo). Keeps one copy of the data. Alternative: copy the JSON into `web/public` (two copies that can drift).
6. **`data/runway.duckdb` is not committed** (in `.gitignore`); it is rebuilt by `python build_db.py` in a second. The CSVs and the exported JSON are committed. Alternative: commit the binary database file.

## Data generator

7. **Python's built-in `random` with seed 42**, not numpy. One fewer dependency.
8. **Added columns and a table beyond the brief:** `billing` (annual or monthly) on customers, `payments_payroll` and `payments_opex` on cash, and `mrr_snapshot.csv`. Without them the collections, payroll and MRR checks could not be independent. Alternative: fewer columns, weaker checks.
9. **Customers that started before Oct 2024 have one `new` movement at their real start month**, with the MRR they had on 1 Oct 2024. Gives a correct opening MRR without inventing two years of extra history.
10. **`end_month` means the first month the customer stops paying (or the person stops being employed).** One rule everywhere.
11. **Annual customers can only change or leave at their anniversary** and pay 12 months upfront. Simple and realistic enough to make cash differ from revenue.
12. **Starting cash before the round: €350.000.** Needed a number; small next to the €3,0m round.
13. **Parameters were set once and not tuned**, apart from checking runway landed in the 10 to 16 month range (it is 14,3).
14. **Customer names are random combinations of invented word parts** (for example "Tindmyr Logistik A/S"). A collision with a real company name is possible, so the README and data spec say any resemblance is a coincidence. Alternative: "Customer 001" names (safer but less readable).
15. **Price increase is planted but not stored as a column.** It shows up only as higher MRR for new customers from Jun 2026.

## Metrics

16. **Revenue = closing MRR of the month.** No proration. Alternative: daily proration.
17. **Gross margin counts only cloud hosting as cost of revenue.** Flatters margin; the alternative (adding customer success payroll) is described in `docs/metrics.md`. *Replaced in review round 1, see decision 51.*
18. **Net burn is cash-based (payments minus collections).** Cash is what runs out. Alternative: EBITDA-based burn.
19. **Runway and the 3-month burn average are empty until 3 months of history exist** (Oct and Nov 2024). Alternative: average whatever months exist.
20. **Burn multiple uses the same trailing 3 months and is empty, with a note, when net new ARR is zero or negative.**
21. **NRR is shown from Oct 2025**, the first month with 12 months of history inside the data.
22. **Runway KPI turns red below 12 months.** Red is reserved for cash risk. At Sep 2026 it is 14,3, so it is not red.

## Scenario engine

23. **Default growth and churn are trailing 12-month averages** of (new + expansion) and (churn + contraction) as a share of opening MRR. Twelve months is less noisy than three. It includes the Jul 2026 large churn, which is real data.
24. **Growth slider range: half to one and a half times the trend. Churn slider: 0 % to 4 %.** "Around the recent trend" as the brief asked.
25. **Default hires = 0.** The base case is "current team, no changes". Alternative: a guessed hiring plan. *Replaced in review round 1: the page now opens on the "Current plan" preset (2 hires, 2 student assistants).*
26. **Cost per hire = average loaded cost by team, weighted by an assumed hiring mix** (40 % engineering, 35 % sales, 15 % customer success, 10 % G&A). One number, computed in SQL.
27. **Hires are spread evenly over the first 12 projected months.**
28. **In the projection, collections equal revenue** and other costs stay flat at the trailing 3-month average. Keeps the module short. The annual upfront effect averages out over a year.
29. **The base case does not hit zero cash within 24 months** (lowest point about €42k in Sep 2028). *No longer true after review round 1: with 2 hires, 2 student assistants and the January salary rise, Current plan runs out of cash in Feb 2028.* This is because the projection assumes MRR keeps growing at the recent trend. It was not tuned. The red zero-cash label appears as soon as a slider makes cash run out.
30. **Python and TypeScript are compared on two cases** (base and a stress case with hires, higher churn, higher costs and funding), not just the base case.

## AI updates

31. **The model receives a fact sheet, not raw tables.** Numbers are pre-formatted in European style, with the previous month's values for comparison. This makes the number check possible.
32. **Effort `medium`, `max_tokens` 8000.** The cost estimate assumes every call uses all 8000 output tokens (worst case USD 0,99), so the real spend can only be lower.
33. **No server-side model fallback on refusal.** A fallback could switch to a different model and break the cost estimate and the "model" column. Any stop reason other than a normal finish is printed.
34. **Look-ahead test method:** rebuild the database with every row after month m deleted and confirm the fact sheet is identical. Runs before any API call; the script aborts if it fails.
35. **The first API call crashed while decoding the compressed response** (a compatibility problem between the HTTP library and a compression package on this machine). The request reached the API, so it was probably billed, but it was not logged. The other calls averaged about USD 0,006 each. Fix: ask the API for gzip responses only. Alternative: upgrade compression packages in the shared Python.
36. **Number check tolerance = half a unit of the precision written** (for example "€1,58m" covers €1.575.000 to €1.585.000). Years and the method constants 3 and 12 (as in "3-month average") are skipped.
37. **The cause check's negation rule was extended after the first run.** It flagged four correct drafts that said "lost none" or "Nothing churned". The checker was fixed; the AI text was not changed. A self-test confirms the checker still catches wrong numbers and unsupported causes.
38. **Three real rounding errors are left visible** (€160.518 written as "€160k" twice, €55.811 as "€55k"). Regenerating until everything passes would hide how the model actually behaved. Result: 10 of 12 drafts pass, 281 of 284 numbers match.
39. **"Price increase" counts as supported from Jun 2026**, based on the data spec, because price is not a data column.

## Dashboard

40. **Static export with trailing slashes** so `/method/` works on any plain file server.
41. **The MRR bridge axis does not start at zero**, and the card says so. Otherwise movements of a few thousand euros would be invisible next to about €100k MRR. Bar labels are shortened (Open, New, Exp., Contr., Churn, Close) to fit a phone; the tooltip shows the full name.
42. **Burn drivers are simple CSS bars**, not a chart library component. Easier to read and style.
43. **Decreases in the bridge are drawn in the text colour, not red.** Red is reserved for cash risk.
44. **A one-sentence summary of the month sits above the KPIs**, built from the data with a template (no AI), to help the two-minute read.
45. **Theme can be forced with `?theme=dark` or `?theme=light`** (used for the screenshots). Otherwise the saved choice or the system setting decides.
46. **Mobile screenshots load the page in a 375 px iframe**, because headless Edge will not make a window narrower than about 504 px. See `scripts/screenshots.ps1`. *Replaced in review round 1, see decision 50.*
47. **`npm start` serves `web/out` with Python's built-in web server** instead of a Node package that would be downloaded on first use.
48. **Rebuilding can change the last decimal places in `data/check/scenario_python.json`.** DuckDB averages in parallel, so the final digits of the cost per hire can differ between runs. This is far inside the €1 tolerance and does not change any displayed number.

## Review round 1

49. **Sparkline tooltip sits just above the line and follows the cursor or finger.** It shows the month and the exact value ("Jul 2026: €1.785.615", runway as "14,3 months"), in the same style as the other chart tooltips. The sparkline area uses `touch-action: pan-y`, so a sideways drag moves the tooltip and an up or down drag still scrolls the page. A tap without any movement shows nothing, because the chart library reacts to a moving finger. Alternative: a fixed label under the line (always visible, but takes space in a small card).
50. **Screenshots are now taken by `scripts/screenshots.mjs`, which drives headless Edge through its built-in DevTools protocol** (a WebSocket that Node already has). This gives a true 375 px phone screen, can simulate a finger dragging along a sparkline (an automated touch check that prints PASS or FAIL), and can click preset buttons. It replaces `scripts/screenshots.ps1` and its 375 px iframe workaround (decision 46). Alternative: Playwright or Puppeteer (a large extra dependency for a few screenshots).
51. **Cost of revenue = cloud hosting + customer success payroll** (as requested in the review). Customer success payroll is taken from the headcount table by team in the same SQL view, so the number has one source. Gross margin in Sep 2026 goes from about 91 % to 63,4 %. Third-party software stays out because the data does not split it between customer-facing and internal tools. Alternative: also include a fixed share of software (would need an invented split).
52. **The salary increase and the student assistant cost live in the SQL view `scenario_base`**, not as constants in the code. TypeScript and Python then read the same two numbers from the exported file, so they cannot drift apart. Alternative: a constant in each file (two places to change).
53. **Salary factor counts Januaries by calendar year**: a projected month in 2027 has passed one January (x 1,03), 2028 two (x 1,0609). The raise applies to the whole payroll, including hires who started a few months earlier. Alternative: raise each person on their work anniversary (more realistic, much harder to explain).
54. **Student assistants have their own slider and their own cost** instead of counting as half a hire. Their cost (€1.900) is far below a full-time loaded cost (€6.719 with the hiring mix), and they do not follow the full-time hiring mix or the 12-month spread; they all start in month 1. Alternative: one slider with "full-time equivalents" (hides the difference).
55. **A preset is highlighted only when every slider matches it exactly** (the funding month only counts when funding is above zero). Moving any slider clears the highlight, even if the projection hardly changes. Moving the slider back by hand may not re-highlight it, because sliders move in fixed steps and the trend values fall between steps. Clicking the button again does.
56. **The "cash runs out" or "bottoms out" line under the chart replaces the result box under the sliders**, so the message appears once. When the lowest point is the last projected month (cash still falling), the line says so. Alternative: keep both (repetitive).
57. **Python and TypeScript are compared on four cases:** the three presets and a stress case (8 hires, 6 student assistants, churn x 1,5, other costs +10 %, €1,5m funding in month 9). A separate test checks that each preset button sets exactly the same values as the Python copy, and that moving a slider clears the highlight.
58. **Prompt v2 asks for labelled lines** ("TL;DR:", "Highlight:", "Lowlight:", "Ask:"), and a short function in `write_updates.py` splits the answer by those labels. Anything without a label is stored as "unparsed" and flagged by the checker; nothing is rewritten. The full answer is also kept (`raw_text` in `data/ai/updates.csv`). Alternative: ask the API for JSON with a fixed schema (more robust parsing, harder to read and explain).
59. **"Metrics that got worse" has a fixed definition**, used both in the fact sheet the AI gets and by the checker: net burn up, runway shorter, MRR down, ARR growth slower, fewer customers, or net revenue retention below 100 %. Falling cash is not on the list, because cash falls every month while the company burns money. A missing change (no previous value) counts as not worse. Because NRR is below 100 % in every update month, every draft needs at least one lowlight.
60. **The key metrics table is a SQL view (`sql/09_update_metrics.sql`)** with seven numbers and their change vs the previous month. The change in ARR growth is shown in percentage points ("-9,2 pts"). The table is shown on the dashboard and is not checked, because it is the data itself.
61. **Checker v2 details:** text in square brackets is left out of the number and cause checks; the "at most two numbers" rule is checked for each highlight and lowlight, not for the TL;DR (the example TL;DR in the brief itself has two numbers in a longer sentence); banned words are matched by their start ("significant" also catches "significantly"); a placeholder counts as loose if words like "Founder:" or "add reason" appear outside brackets.
62. **v1 is kept for the record:** `data/ai/updates_v1.csv`, `data/check/update_checks_v1.csv` (the v1 check, run before gross margin changed) and `data/ai/prompts/v1/`. The v2 prompts are in `data/ai/prompts/v2/`.
63. **The v2 check was run once and its result is reported as it is: 0 of 12 drafts pass, 137 of 145 numbers match.** Nothing was regenerated. Four of the eight unmatched numbers are "100%", which the model took from the fact sheet line "net revenue retention below 100 %"; the checker only compares against data values, so it cannot match a threshold. That is a limit of the checker. It was not changed after the run, as the review asked for the results as they are. Every month also fails on other checks (mostly three or four numbers in one highlight or lowlight, three drafts over 110 words), so the 0 of 12 does not depend on it. The fix, if wanted: allow 100 as a constant the way 3 and 12 are allowed.
64. **AI spend this round:** worst-case estimate USD 0,9987 (every call using all 8.000 output tokens), actual USD 0,0689 for 12 calls. Logged in `data/ai/spend_log.csv`.
65. **The update card is its own component (`web/components/UpdateCard.tsx`)** and shows placeholders highlighted, so a reader sees at once what the founder still has to fill in.
66. **The burn multiple note appears for Aug and Sep 2026**, not only Sep, because both 3-month windows contain the Jul 2026 churn (Aug: 7,1; Sep: 12,3). The note text is written by hand, since it explains a known event in the data, and it is tied to those two months in `web/components/Dashboard.tsx`. Alternative: a rule that detects any large churn inside the window (more general, more code for one event).
67. **"Runway" is renamed "Runway at current burn"** on the KPI card, the update table, the method page and in the docs, so it is clear that it assumes burn stays at the trailing 3-month average, unlike the scenario projection.
68. **The final full data-flow run used `write_updates.py` without the key.** It ran the look-ahead test and rewrote the prompts but made no API calls, because the review asked for the 12 months to be regenerated once, and that had already happened in step 4. Alternative: a second paid run (would replace the drafts that were checked and reported).
69. **Full-page screenshots first make the virtual screen as tall as the page**, then capture. Capturing beyond the screen made the charts redraw mid-capture and come out blank on the phone layout.
70. **New screenshots:** `mobile-sparkline-tooltip.png` (finger on the cash sparkline at 375 px), `preset-hiring-push.png` (all three presets show the red "cash runs out" line; Hiring push was photographed) and `update-jul-2026.png` (the v2 update card).
