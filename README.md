# Startup runway dashboard: Nordlys Analytics ApS (fictional)

> **All data in this project is fictional.** Nordlys Analytics ApS does not exist. A script generated the customers, employees, costs and cash. Customer names are built from invented word parts, so any match with a real company is a coincidence.

![Dashboard, light theme](docs/screenshots/desktop-light.png)

## The problem

Every month a startup founder or finance lead has to answer three questions. How much cash do we have? How fast are we spending it? How long will it last? Then the investors want a short update on what changed and why. This project does both for a fictional Copenhagen B2B SaaS company. Every number on the dashboard comes from one SQL formula that you can open and read.

## What the dashboard shows

- **Four KPIs** for the selected month: cash in bank, net burn, runway at current burn (in months, plus the month cash would run out), and ARR with growth against 12 months earlier. Hover over the small trend lines, or drag a finger along them, to see the exact value for each month.
- **A cash chart** with 24 months of actual cash (solid line) and a 24-month projection (dashed line). The projection moves when you change the sliders: full-time hires, student assistants, growth, churn, other costs and new funding. Three buttons (Current plan, Hiring push, Downside) set all the sliders at once. Payroll goes up 3 % every January. A line under the chart says when cash runs out, or how low it gets. The projection is a set of assumptions, not a forecast.
- **An MRR bridge** (waterfall) and **where the money goes** (payroll by team, other costs by category) for the selected month.
- **A draft investor update** for each month from Oct 2025 to Sep 2026. Each one has a subject, a one-sentence TL;DR, a table of key metrics, up to two highlights and two lowlights, and one ask for investors, followed by the result of an automatic check. The table comes straight from the data. Claude drafted the text. The drafts are meant for a founder to finish: when the data does not show a reason (why a customer left, what a fee was for), the draft leaves a placeholder such as "[Founder: add reason]".
- **A "How this works" page** with definitions, method, check results and limitations.

The data has a story built in. The company hires several people in spring 2026, loses its largest customer in Jul 2026, raises prices on new contracts from Jun 2026, has a strong expansion month in Nov 2025 and pays a one-off recruiting fee in Apr 2026. At Sep 2026 it has €1,58m in the bank and about 14,3 months of runway. Fine for now, but it needs a plan.

## How it is built

| Part | Tool |
|---|---|
| Data generator, checks, AI script | Python (standard library, `duckdb`, `anthropic`) |
| Calculations | DuckDB, one SQL view per file in `sql/` |
| Website | Next.js (App Router, static export), Recharts, plain CSS |
| AI | Claude API, model `claude-sonnet-5-5`, run once, output stored |

Data flow:

```
scripts/generate.py      ->  data/raw/*.csv              (synthetic data, fixed seed)
scripts/reconcile.py     ->  PASS/FAIL checks on the raw data
build_db.py + sql/*.sql  ->  data/runway.duckdb -> data/export/dashboard.json
scripts/write_updates.py ->  data/ai/updates.csv          (Claude, once, with cost cap)
scripts/check_updates.py ->  data/check/update_checks.csv (no AI)
web/                     ->  reads dashboard.json at build time -> static site in web/out/
```

The website makes no API calls. Each metric is defined in `docs/metrics.md` and calculated in one SQL file only.

## Run it

```bash
python scripts/generate.py
python scripts/reconcile.py          # must print 8/8 PASS
python build_db.py
python scripts/check_scenario.py
cd web && npm install && npm test && npm run build && npm start
```

Optional. This needs `PORTFOLIO_ANTHROPIC_KEY` in the environment and costs a few US cents:

```bash
python scripts/write_updates.py
python scripts/check_updates.py
python build_db.py                   # re-export so the site includes the drafts
```

Screenshots, plus a touch check and a preset check: `node scripts/screenshots.mjs` (headless Microsoft Edge, after `npm run build`).

## How the AI part works and how it is checked

**The fact sheet.** For each month, a script builds a fact sheet from the SQL views. It only uses that month and the months before it. A look-ahead test rebuilds the database with all later months deleted and checks that the fact sheet comes out the same. If it does not, the script stops before calling the API.

**What the AI writes.** The subject and the key metrics table are not AI. They come from `sql/09_update_metrics.sql`. Claude (prompt v3) writes the rest: a TL;DR of at most 30 words and two numbers about the main event of the month, up to two highlights and two lowlights, and one ask. That is at most 110 words in total. It may only use numbers and causes from the fact sheet. Python gives every number in two forms, exact and rounded ("€55.811 (display: €55,8k)"), and the model has to copy one of them instead of rounding on its own. When the data does not show a cause, the model puts a placeholder in square brackets at the end of the sentence. The page shows the text exactly as the model wrote it.

**Validate and retry.** The model does not follow format rules reliably, so the pipeline checks every draft and asks for one or two corrections. Both the first-attempt and final results are shown. Right after each draft, the script runs the same checks as `check_updates.py`. If the draft fails, a follow-up message lists the failed checks and the sentence or number that broke them, without the correct values, and asks for a new full draft. Each month gets at most two retries. The last attempt is kept, pass or fail. The rule, the limit and the cost cap were committed before the run, and the run was done once. Every attempt is saved in `data/ai/update_attempts.csv`.

**Cost.** Before calling the API, the script estimates the worst case and stops if it is above USD 2,00. It also stops mid-run if real spend passes USD 2,00. v1 cost about USD 0,07 for 12 drafts, plus one earlier call that failed on a local decoding error (see `docs/decisions.md`). v2 cost USD 0,0689 for 12 drafts. v3 cost USD 0,1393 for 18 calls (12 first drafts and 6 retries), against a worst-case estimate of USD 1,1527 for 36 calls.

**The check, without AI.** Every number in the AI text has to match a value from that month's data, allowing for the rounding the text uses. Named causes have to be supported by the data, which is tested with a crude keyword list. The script also checks structure and style: one TL;DR and one ask, at most two highlights and two lowlights, at least one lowlight when a key metric got worse, at most two numbers per highlight or lowlight, a TL;DR of at most 30 words and two numbers that does not open with runway, at most 110 words, no banned filler words, no em dashes, and placeholders only in brackets at the end of a sentence.

**Results for v3, run once.** 6 of 12 drafts passed on the first attempt. After retries all 12 pass, and all 94 numbers in the kept drafts match the data. Six months (Dec 2025 to May 2026) needed one retry each. The most common first-attempt failures were three or four numbers in one highlight or lowlight (3 months), a cause not found in the data (2), three numbers in the TL;DR (2), and a TL;DR over 30 words or a draft over 110 words (1 each). Both cause flags were false flags from the keyword check ("Contraction MRR was €0", "churn was zero"). The checker was not changed after the run. No first draft rounded a number wrongly. The check covers numbers, causes, structure and a few style rules. It does not judge how well the text is written.

**Earlier results.** v2 (run once) passed 0 of 12 drafts, with 137 of 145 numbers matching (1 of 12 and 136 of 140 with the round 2 checker). The model wrote €55k for €55.811, €99k for €99.519 and €128k for €128.684. That is why v3 gets the numbers pre-formatted.

**Changes after the first run.** The checker has been changed twice, both times because of false flags, and both changes are in `docs/decisions.md`. The first time, it flagged 4 correct drafts that said "lost none" or "Nothing churned". The second time, in review round 2, it flagged "100 %" four times in the v2 drafts. That number comes from our own rule about net revenue retention below 100 %, not from the data, so the checker now skips 100 followed by % in the same way it skips the constants 3 and 12. Each fix has a self-test case. The update format also changed once, after two v1 drafts were reviewed and found too dense and missing an ask. v1 is kept in `data/ai/updates_v1.csv` and v2 in `data/ai/updates_v2.csv`. Prompt v3 is the last prompt change for this project.

## Limitations

- The data is synthetic. It is only as realistic as the assumptions in `docs/assumptions.md`.
- Revenue equals MRR. There is no proration, VAT, tax, or timing of payables and receivables.
- The projection keeps other costs flat apart from the slider. It treats collections as equal to revenue, so annual upfront billing is ignored, and new hires do not change the growth rate.
- Gross margin counts cloud hosting and customer success payroll as cost of revenue. Third-party software is left in operating costs.
- The AI check tests numbers, named causes, structure and a few style rules. It does not test whether an update puts weight on the right things, and a founder still has to fill in the placeholders. A draft that passes after a retry meets the rules, but that does not mean the model follows them on its own: half the first drafts did not.
- Some kept drafts pass the check but still read awkwardly. Sep 2026 writes "-€1.520" with a minus sign and guesses that low collections are "annual billing timing". In Jul 2026 two sentences end on a placeholder with no full stop. The Apr 2026 TL;DR says costs are "rising faster than revenue", which is a reading of the numbers rather than a number from the data. These are left exactly as the model wrote them.
- Two prompt rules are tested weakly or not at all. "A planned rise in headcount is not a lowlight on its own" is only in the prompt. "The TL;DR does not open with runway" is tested crudely, as the word "runway" in the first five words.

## Next version

- Load real exports (billing, payroll, bank) instead of the generator, with prorated revenue and payment terms.
- A "bridge round" preset and a downloadable scenario summary.
- A minimum cash buffer line (for example 6 months of burn) instead of only €0.
- Compare AI drafts across prompt versions and record a human review score for each draft.

## Documentation

- `docs/explain.md`: how everything works, with interview questions and answers
- `docs/metrics.md`: every metric, its formula, why it was chosen and the common alternative
- `docs/assumptions.md`: every assumption, marked as own assumption
- `docs/data-spec.md`: the tables and the planted story
- `docs/decisions.md`: choices made during the build

Built with Claude Code by Knut Barka.
