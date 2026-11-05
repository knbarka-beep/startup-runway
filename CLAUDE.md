# CLAUDE.md: rules for this repo

Claude Code reads this file at the start of every session. It stays in the public repo because it shows the rules the project was built under.

Portfolio project: runway dashboard for **Nordlys Analytics ApS (fictional)**. Author: Knut Barka (economics student, not a developer). Every choice must be explainable by him in an interview: prefer simple, readable code over clever code.

## Hard rules

- All data is synthetic. Every page and the README must say the data is fictional.
- No real company names, logos or branding. No invented benchmark sources.
- Every assumption (growth, churn, salaries, pricing) goes in `docs/assumptions.md`, marked "own assumption" unless there is an exact, named source.
- No claims of time saved or AI quality that have not been measured.
- British English in all user-facing text.
- Numbers in the UI: EUR, European format (`1.234.567`, `€1,23m`, comma decimals). Dates as `31.12.2026` or `Sep 2026`.
- No em dashes anywhere in written text.
- Do not touch the sibling project `../variance-cockpit`.
- Never push, create a GitHub remote or deploy unless Knut is at the keyboard and has said yes in that session.
- Record every self-made choice in `docs/decisions.md` (what, why, alternative considered).

## Design

- Polished and smooth, with clear hierarchy and soft transitions, but nothing that hides or decorates the numbers. Smooth over flashy. No typical "AI" look: no bright UI blue, indigo, violet or purple accent (P2 uses a deep ink blue, `#2A5788` light and `#7FA6D6` dark), no gradient backgrounds, glassmorphism, glow, emoji, sparkle icons or marketing phrases.
- Tokens live in `web/styles/tokens.css` (colours, fonts, radius), base styles in `web/styles/kit.css`, shared components in `web/components/kit/` (see its README). Use the tokens, never raw hex values in components. Red is reserved for risk and unfavourable changes.
- Light theme by default, dark behind the toggle. Source Serif 4 for headings, IBM Plex Sans for text, tabular figures for numbers. Transitions 150 to 200 ms; charts animate once on load (max 400 ms); respect prefers-reduced-motion.

## Data flow (one place the numbers come from)

1. `python scripts/generate.py` writes CSVs to `data/raw/` (fixed seed).
2. `python scripts/reconcile.py` must print PASS for every check.
3. `python build_db.py` loads CSVs into `data/runway.duckdb`, creates every view in `sql/` (one view per file, run in filename order) and exports JSON to `data/export/`.
4. `python scripts/check_scenario.py` and `cd web && npm test` must both pass (TypeScript scenario equals Python within €1 per month).
5. `python scripts/write_updates.py` drafts investor updates (Claude API, cost cap USD 2,00), then `python scripts/check_updates.py`, then `python build_db.py` again to export them.
6. `cd web && npm run build` produces the static site in `web/out/`.
7. `node scripts/screenshots.mjs` retakes the screenshots in headless Edge and runs a touch check (sparkline tooltip at 375 px) and a preset check.

All calculations live in SQL views. The website only reads exported JSON and never calls an API.

## AI

- Key lives in env var `PORTFOLIO_ANTHROPIC_KEY` (not `ANTHROPIC_API_KEY`). Pass it explicitly to `anthropic.Anthropic(api_key=...)`. Never print it, write it to a file or commit it.
- Model: `claude-sonnet-5-5`. Text is generated once and stored in `data/ai/`.
- Input for month m may only contain data up to and including m (look-ahead test in `write_updates.py`).
- Prompt v3 (final, no further prompt changes): the AI writes only TL;DR, highlights, lowlights and ask; subject and key metrics table come from SQL. Numbers are given exact and in a display form computed in Python. Causes not in the data become "[Founder: add reason]" placeholders at the end of a sentence. Each draft is checked in `write_updates.py` with the same checks as `check_updates.py`; on failure, one follow-up lists the failed checks (no correct values), at most 2 retries per month, last attempt kept. Never rerun the whole thing to improve the result. Earlier drafts: `data/ai/updates_v1.csv`, `data/ai/updates_v2.csv`.
