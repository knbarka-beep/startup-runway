# CLAUDE.md: rules for this repo

Portfolio project: runway dashboard for **Nordlys Analytics ApS (fictional)**. Author: Knut Barka (economics master's student, not a developer). Every choice must be explainable by him in an interview: prefer simple, readable code over clever code.

## Hard rules

- All data is synthetic. Every page and the README must say the data is fictional.
- No real company names, logos or branding. No invented benchmark sources.
- Every assumption (growth, churn, salaries, pricing) goes in `docs/assumptions.md`, marked "own assumption" unless there is an exact, named source.
- No claims of time saved or AI quality that have not been measured.
- British English in all user-facing text.
- Numbers in the UI: EUR, European format (`1.234.567`, `€1,23m`, comma decimals). Dates as `31.12.2026` or `Sep 2026`.
- No em dashes anywhere in written text.
- Do not touch `C:\Users\knbar\Projects\variance-cockpit`.
- Never push, never create a GitHub remote, never deploy.
- Record every self-made choice in `docs/decisions.md` (what, why, alternative considered).

## Data flow (one place the numbers come from)

1. `python scripts/generate.py` writes CSVs to `data/raw/` (fixed seed).
2. `python scripts/reconcile.py` must print PASS for every check.
3. `python build_db.py` loads CSVs into `data/runway.duckdb`, creates every view in `sql/` (one view per file, run in filename order) and exports JSON to `data/export/`.
4. `python scripts/check_scenario.py` and `cd web && npm test` must both pass (TypeScript scenario equals Python within €1 per month).
5. `python scripts/write_updates.py` drafts investor updates (Claude API, cost cap USD 2,00), then `python scripts/check_updates.py`, then `python build_db.py` again to export them.
6. `cd web && npm run build` produces the static site in `web/out/`.

All calculations live in SQL views. The website only reads exported JSON and never calls an API.

## AI

- Key lives in env var `PORTFOLIO_ANTHROPIC_KEY` (not `ANTHROPIC_API_KEY`). Pass it explicitly to `anthropic.Anthropic(api_key=...)`. Never print it, write it to a file or commit it.
- Model: `claude-sonnet-5-5`. Text is generated once and stored in `data/ai/`.
- Input for month m may only contain data up to and including m (look-ahead test in `write_updates.py`).
