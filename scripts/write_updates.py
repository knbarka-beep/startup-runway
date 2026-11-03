"""Draft one investor update per month (Oct 2025 to Sep 2026) with the Claude API.

Steps:
  1. Look-ahead test: the fact sheet for month m must be identical whether the
     database holds all 24 months or only months up to m. If not, abort.
  2. Build a fact sheet per month from the SQL views (only months <= m).
  3. Write every prompt to data/ai/prompts/ (so they can be rerun or inspected).
  4. If PORTFOLIO_ANTHROPIC_KEY is missing: stop here, no calls.
  5. Estimate worst-case cost. Abort if above USD 2,00.
  6. Call the API month by month, stop if actual spend passes USD 2,00.
  7. Save data/ai/updates.csv and append to data/ai/spend_log.csv.

The key is read from the environment and passed directly to the client.
It is never printed or written anywhere.
"""

import csv
import hashlib
import os
import sys
from datetime import date, datetime
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from build_db import build  # noqa: E402

AI_DIR = ROOT / "data" / "ai"
PROMPT_DIR = AI_DIR / "prompts"
MODEL = "claude-sonnet-5-5"
PROMPT_VERSION = "v1"
MAX_TOKENS = 8000                     # includes the model's internal thinking
PRICE_IN, PRICE_OUT = 2.00 / 1e6, 10.00 / 1e6   # USD per token, Sonnet 5.5
COST_CAP_USD = 2.00
MONTHS = [f"{y}-{m:02d}-01" for y, m in
          [(2025, 10), (2025, 11), (2025, 12)] + [(2026, m) for m in range(1, 10)]]
MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


# ------------------------------------------------------------------ formatting
def label(d):
    """date or 'YYYY-MM-01' -> 'Sep 2026'"""
    if isinstance(d, str):
        d = date.fromisoformat(d)
    return f"{MONTH_NAMES[d.month - 1]} {d.year}"


def eur(x):
    """1579630 -> '€1.579.630' (European format)."""
    s = f"{abs(round(x)):,}".replace(",", ".")
    return ("-€" if x < 0 else "€") + s


def num(x, decimals=1):
    """14.32 -> '14,3'"""
    return f"{x:.{decimals}f}".replace(".", ",")


# ------------------------------------------------------------------ fact sheet
SYSTEM_PROMPT = """You write short monthly investor updates for the founder of Nordlys Analytics ApS, a Copenhagen B2B SaaS company.

Rules:
- 120 to 180 words. Plain text, short paragraphs, no headings, no bullet points, no markdown.
- Founder voice, plain language, calm and factual. No hype, no exclamation marks.
- Structure: headline numbers; what changed and why; runway; one ask or focus for next month.
- Use only numbers that appear in the fact sheet. You may round them (for example €1.579.630 as €1,58m, €110.316 as €110k) but never calculate new numbers.
- Explain changes only with causes visible in the fact sheet. Do not invent reasons such as seasonality, market conditions, pipeline or product launches.
- British English. Money in euros in European format (€1.234.567, €1,23m, €110k). Decimals with a comma (14,3 months). Dates as "Sep 2026".
- Never use em dashes or en dashes.
- Do not mention anything about months after the update month except the zero-cash month given in the fact sheet."""


def build_facts(con, month):
    """Fact sheet for `month` ('YYYY-MM-01'). Every query is limited to months <= month."""
    m = f"DATE '{month}'"

    def one(sql):
        cur = con.execute(sql)
        row = cur.fetchone()
        return dict(zip([d[0] for d in cur.description], row)) if row else None

    cur = one(f"""SELECT * FROM monthly_summary s JOIN mrr_bridge b USING (month)
                  JOIN runway r USING (month) JOIN unit_metrics u USING (month)
                  WHERE month = {m}""")
    prev = one(f"""SELECT * FROM monthly_summary s JOIN runway r USING (month)
                   WHERE month = (SELECT MAX(month) FROM monthly_summary WHERE month < {m})""")
    hc3 = one(f"""SELECT headcount FROM monthly_summary
                  WHERE month = (SELECT MAX(month) FROM monthly_summary WHERE month <= {m} - INTERVAL 3 MONTH)""")
    fees12 = one(f"""SELECT AVG(opex_professional_fees) AS v FROM monthly_summary
                     WHERE month < {m} AND month >= {m} - INTERVAL 12 MONTH""")["v"]
    biggest_churn = one(f"""SELECT MIN(amount) AS v FROM mrr_movements
                            WHERE month = {m} AND type = 'churn'""")["v"]
    new_avg = one(f"""SELECT AVG(amount) AS v FROM mrr_movements WHERE month = {m} AND type = 'new'""")["v"]
    new_avg12 = one(f"""SELECT AVG(amount) AS v FROM mrr_movements WHERE type = 'new'
                        AND month < {m} AND month >= {m} - INTERVAL 12 MONTH""")["v"]

    # (label, value shown to the model, raw number used by the number check)
    f = [
        ("Update month", label(month), None),
        ("Closing cash", eur(cur["closing_cash"]), cur["closing_cash"]),
        ("Closing cash previous month", eur(prev["closing_cash"]), prev["closing_cash"]),
        ("Net burn this month (payments minus collections)", eur(cur["net_burn"]), cur["net_burn"]),
        ("Net burn previous month", eur(prev["net_burn"]), prev["net_burn"]),
        ("Average net burn, last 3 months", eur(cur["avg_net_burn_3m"]), cur["avg_net_burn_3m"]),
        ("Average net burn, last 3 months, as of previous month", eur(prev["avg_net_burn_3m"]), prev["avg_net_burn_3m"]),
        ("Runway at average net burn (months)", num(cur["runway_months"]), cur["runway_months"]),
        ("Runway as of previous month (months)", num(prev["runway_months"]), prev["runway_months"]),
        ("Month cash would run out at that burn", label(cur["zero_cash_month"]), None),
        ("Collections (cash in from customers)", eur(cur["collections"]), cur["collections"]),
        ("Payments (cash out)", eur(cur["payments"]), cur["payments"]),
        ("MRR", eur(cur["closing_mrr"]), cur["closing_mrr"]),
        ("MRR previous month", eur(cur["opening_mrr"]), cur["opening_mrr"]),
        ("MRR change this month", eur(cur["closing_mrr"] - cur["opening_mrr"]), cur["closing_mrr"] - cur["opening_mrr"]),
        ("New MRR", eur(cur["new_mrr"]), cur["new_mrr"]),
        ("Expansion MRR", eur(cur["expansion_mrr"]), cur["expansion_mrr"]),
        ("Contraction MRR", eur(cur["contraction_mrr"]), cur["contraction_mrr"]),
        ("Churned MRR", eur(cur["churn_mrr"]), cur["churn_mrr"]),
        ("Largest single churned customer this month (MRR)", eur(biggest_churn) if biggest_churn else "none", biggest_churn),
        ("New customers", str(cur["new_customers"]), cur["new_customers"]),
        ("Churned customers", str(cur["churned_customers"]), cur["churned_customers"]),
        ("Active customers", str(cur["active_customers"]), cur["active_customers"]),
        ("Average MRR per new customer this month", eur(new_avg) if new_avg else "none", new_avg),
        ("Average MRR per new customer, previous 12 months", eur(new_avg12), new_avg12),
        ("ARR", eur(cur["arr"]), cur["arr"]),
        ("ARR growth vs 12 months earlier (%)", num(cur["arr_growth_12m"] * 100), cur["arr_growth_12m"] * 100),
        ("Net revenue retention, 12 months (%)", num(cur["nrr_12m"] * 100), cur["nrr_12m"] * 100),
        ("Burn multiple, last 3 months",
         num(cur["burn_multiple"]) if cur["burn_multiple"] is not None else cur["burn_multiple_note"],
         cur["burn_multiple"]),
        ("Gross margin (%)", num(cur["gross_margin_pct"] * 100), cur["gross_margin_pct"] * 100),
        ("EBITDA", eur(cur["ebitda"]), cur["ebitda"]),
        ("Headcount", str(cur["headcount"]), cur["headcount"]),
        ("Headcount previous month", str(prev["headcount"]), prev["headcount"]),
        ("Headcount 3 months earlier", str(hc3["headcount"]), hc3["headcount"]),
        ("Payroll", eur(cur["payroll"]), cur["payroll"]),
        ("Payroll previous month", eur(prev["payroll"]), prev["payroll"]),
        ("Non-payroll costs", eur(cur["opex_total"]), cur["opex_total"]),
        ("Non-payroll costs previous month", eur(prev["opex_total"]), prev["opex_total"]),
        ("Professional fees", eur(cur["opex_professional_fees"]), cur["opex_professional_fees"]),
        ("Professional fees, average of previous 12 months", eur(fees12), fees12),
        ("Marketing", eur(cur["opex_marketing"]), cur["opex_marketing"]),
    ]
    return f


def facts_text(facts):
    return "\n".join(f"- {k}: {v}" for k, v, _ in facts)


def make_prompt(facts):
    return (f"Fact sheet for the update (all figures from the company's own data):\n{facts_text(facts)}\n\n"
            "Notes on the data: annual customers pay 12 months upfront, so collections and net burn "
            "jump around from month to month. Runway uses the 3-month average to smooth that.\n\n"
            "Write the investor update for this month.")


# ------------------------------------------------------------- look-ahead test
def lookahead_test(full_con):
    """For every month m: facts from the full database == facts from a database
    that only contains data up to m. Also: no month label after m appears,
    except the computed zero-cash month."""
    ok = True
    for month in MONTHS:
        cut = duckdb.connect()
        build(cut, cutoff=month)
        a, b = build_facts(full_con, month), build_facts(cut, month)
        cut.close()
        same = a == b
        future = [k for k, v, _ in a if k != "Month cash would run out at that burn"
                  and isinstance(v, str) and v in [label(x) for x in MONTHS if x > month]]
        if not same or future:
            ok = False
            print(f"FAIL  look-ahead {label(month)}: identical={same}, future labels={future}")
    print(f"{'PASS' if ok else 'FAIL'}  Look-ahead test: input for each month uses no data after that month")
    return ok


# -------------------------------------------------------------------- main run
def main():
    con = duckdb.connect()
    build(con)
    if not lookahead_test(con):
        sys.exit(1)

    PROMPT_DIR.mkdir(parents=True, exist_ok=True)
    jobs = []
    for month in MONTHS:
        prompt = make_prompt(build_facts(con, month))
        (PROMPT_DIR / f"{month[:7]}.txt").write_text(
            f"MODEL: {MODEL}\nPROMPT VERSION: {PROMPT_VERSION}\n\n=== SYSTEM ===\n{SYSTEM_PROMPT}\n\n=== USER ===\n{prompt}\n",
            encoding="utf-8")
        jobs.append((month, prompt, hashlib.sha256((SYSTEM_PROMPT + prompt).encode()).hexdigest()[:16]))
    print(f"Wrote {len(jobs)} prompts to {PROMPT_DIR.relative_to(ROOT)}")

    key = os.environ.get("PORTFOLIO_ANTHROPIC_KEY")
    if not key:
        print("PORTFOLIO_ANTHROPIC_KEY is not set: skipping API calls. Prompts are saved for a later run.")
        return

    import anthropic
    # gzip only: on this machine the HTTP library's brotli/zstd decoder crashed (see docs/decisions.md).
    client = anthropic.Anthropic(api_key=key, default_headers={"Accept-Encoding": "gzip, deflate"})

    # Worst-case estimate: exact input tokens (count_tokens is free) + full MAX_TOKENS output.
    est = 0.0
    for _, prompt, _ in jobs:
        n_in = client.messages.count_tokens(model=MODEL, system=SYSTEM_PROMPT,
                                            messages=[{"role": "user", "content": prompt}]).input_tokens
        est += n_in * PRICE_IN + MAX_TOKENS * PRICE_OUT
    print(f"Worst-case cost estimate: USD {est:.4f} (cap USD {COST_CAP_USD:.2f})")
    if est > COST_CAP_USD:
        print("ABORT: estimate above cap.")
        sys.exit(1)

    spent, rows = 0.0, []
    for month, prompt, h in jobs:
        if spent >= COST_CAP_USD:
            print(f"STOP: spend USD {spent:.4f} reached the cap.")
            break
        resp = client.messages.create(
            model=MODEL, max_tokens=MAX_TOKENS, system=SYSTEM_PROMPT,
            output_config={"effort": "medium"},
            messages=[{"role": "user", "content": prompt}])
        cost = resp.usage.input_tokens * PRICE_IN + resp.usage.output_tokens * PRICE_OUT
        spent += cost
        text = "\n".join(b.text for b in resp.content if b.type == "text").strip()
        if resp.stop_reason != "end_turn":
            print(f"  {label(month)}: stop_reason={resp.stop_reason}, text kept as returned")
        rows.append([month[:7], text, MODEL, PROMPT_VERSION, h,
                     resp.usage.input_tokens, resp.usage.output_tokens, round(cost, 6)])
        print(f"  {label(month)}: {resp.usage.input_tokens} in / {resp.usage.output_tokens} out, "
              f"USD {cost:.4f} (total {spent:.4f})")

    with open(AI_DIR / "updates.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["month", "text", "model", "prompt_version", "input_hash",
                    "tokens_in", "tokens_out", "cost_usd"])
        w.writerows(rows)
    log = AI_DIR / "spend_log.csv"
    new_log = not log.exists()
    with open(log, "a", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        if new_log:
            w.writerow(["run_at", "model", "prompt_version", "calls", "spend_usd"])
        w.writerow([datetime.now().isoformat(timespec="seconds"), MODEL, PROMPT_VERSION, len(rows), round(spent, 6)])
    print(f"Saved {len(rows)} updates. Total spend USD {spent:.4f}")


if __name__ == "__main__":
    main()
