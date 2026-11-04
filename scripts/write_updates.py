"""Draft one investor update per month (Oct 2025 to Sep 2026) with the Claude API.

Prompt v3 (review round 2): the AI writes only four parts of each update: a TL;DR (at most
30 words and 2 numbers, not led by runway), up to two highlights, up to two lowlights and
one ask. The subject line and the key metrics table are not AI; they come from the SQL views
(sql/09_update_metrics.sql). Every number in the fact sheet is given exact and in a display
form computed here ("€55.811 (display: €55,8k)"), so the model does not round on its own.
Where a cause is not in the data, the AI writes a placeholder such as "[Founder: add reason]"
at the end of the sentence. Earlier drafts: data/ai/updates_v1.csv and updates_v2.csv.

Steps:
  1. Look-ahead test: the fact sheet for month m must be identical whether the
     database holds all 24 months or only months up to m. If not, abort.
  2. Build a fact sheet per month from the SQL views (only months <= m).
  3. Write every prompt to data/ai/prompts/v3/ (so they can be rerun or inspected).
  4. If PORTFOLIO_ANTHROPIC_KEY is missing: stop here, no calls.
  5. Estimate worst-case cost. Abort if above USD 2,00.
  6. Call the API month by month, stop if actual spend passes USD 2,00.
  7. Split each answer into its parts, save data/ai/updates.csv and append to data/ai/spend_log.csv.

The key is read from the environment and passed directly to the client.
It is never printed or written anywhere.
"""

import csv
import hashlib
import os
import re
import sys
from datetime import date, datetime
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from build_db import build  # noqa: E402

AI_DIR = ROOT / "data" / "ai"
PROMPT_VERSION = "v3"
PROMPT_DIR = AI_DIR / "prompts" / PROMPT_VERSION
MODEL = "claude-sonnet-5-5"
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


def eur_display(x):
    """Short form for running text: 1579630 -> '€1,58m', 55811 -> '€55,8k', 9400 -> '€9.400'."""
    sign, a = ("-" if x < 0 else ""), abs(x)
    if a >= 1e6:
        return f"{sign}€{num(a / 1e6, 2)}m"
    if a >= 1e4:
        return f"{sign}€{num(a / 1e3, 1)}k"
    return eur(x)


# Prompt v3: every number is given in two forms, exact and a display form computed here,
# so the model never has to round on its own (it rounded €55.811 to €55k in v1 and v2).
def e2(x):
    """Euro amount: '€55.811 (display: €55,8k)'."""
    return f"{eur(x)} (display: {eur_display(x)})"


def p2(x):
    """Percentage (already x 100): '93,04 % (display: 93,0 %)'."""
    return f"{num(x, 2)} % (display: {num(x, 1)} %)"


def d2(x):
    """Decimal such as months or a multiple: '19,68 (display: 19,7)'."""
    return f"{num(x, 2)} (display: {num(x, 1)})"


# ------------------------------------------------------------------ fact sheet
SYSTEM_PROMPT = """You draft the monthly investor update for the founder of Nordlys Analytics ApS, a Copenhagen B2B SaaS company. The founder reads and finishes the draft before sending it.

The email already has a subject line and a table with the key metrics (cash in bank, net burn, runway, MRR, ARR growth, customers, headcount, each with the change vs last month). You write only the text parts. Do not repeat the table.

Answer with exactly these lines and nothing else, each part on its own line:
TL;DR: <one sentence>
Highlight: <one sentence>
Highlight: <one sentence, optional>
Lowlight: <one sentence>
Lowlight: <one sentence, optional>
Ask: <one sentence>

What goes in each part:
- TL;DR: at most 30 words and at most 2 numbers. Name the most important event of the month (for example a churn, a hiring push, a one-off cost or a strong expansion month) and what it means for the company. Do not lead with the change in runway: runway is in the table, and early-period runway moves are mostly annual billing timing. Do not bury bad news and do not dramatise it.
- Highlights and lowlights: at most two of each, one short sentence each, at most two numbers per sentence. The table carries the other numbers. If the fact sheet lists metrics that got worse, write at least one lowlight.
- A planned increase in headcount is not a lowlight on its own. The higher burn it causes can be.
- Ask: one concrete thing investors can help with, tied to this month's data. For example introductions to mid-sized Nordic prospects after a churn, or candidate referrals during a hiring push.

Numbers:
- Every number in the fact sheet is given as the exact value followed by a display form, for example "€55.811 (display: €55,8k)". Use the display form or the exact value, copied as written. Never round a number yourself and never calculate new numbers.

Facts and causes:
- Name only causes that are visible in the fact sheet. The data does not say why a customer left, what a professional fee was for, why someone was hired or what the founder plans next. Where such a reason matters, write a placeholder in square brackets for the founder, for example "[Founder: add reason]". Put the placeholder at the end of the sentence, never in the middle. Never guess the reason and never promise to look into it.
- Do not mention any month after the update month except the zero-cash month given in the fact sheet.

Style:
- At most 110 words in total.
- Plain words a founder would use in an email to investors. Short sentences. Write as "we".
- No hype or filler words, for example: exciting, significant, robust, momentum, landscape, leverage. No exclamation marks.
- No em dashes or en dashes. No rhetorical lists of three. No closing pleasantries.
- British English. Euros in European format, decimals with a comma, dates as "Sep 2026"."""


def worsened(con, month):
    """Which key metrics got worse vs the previous month (from sql/09_update_metrics.sql).
    Falling cash is not listed: it falls every month while the company burns cash."""
    cur = con.execute(f"SELECT * FROM update_metrics WHERE month = DATE '{month}'")
    # A missing change (no previous value, e.g. ARR growth in Oct 2025) counts as "not worse".
    r = {k: (0 if v is None else v) for k, v in zip([d[0] for d in cur.description], cur.fetchone())}
    rules = [
        ("net burn went up", r["net_burn_change"] > 0),
        ("runway got shorter", r["runway_change"] < 0),
        ("MRR went down", r["mrr_change"] < 0),
        ("ARR growth vs 12 months ago slowed", r["arr_growth_change"] < 0),
        ("fewer active customers", r["customers_change"] < 0),
        ("net revenue retention below 100 %", 0 < r["nrr_12m"] < 1),
    ]
    return [name for name, hit in rules if hit]


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
        ("Closing cash", e2(cur["closing_cash"]), cur["closing_cash"]),
        ("Closing cash previous month", e2(prev["closing_cash"]), prev["closing_cash"]),
        ("Net burn this month (payments minus collections)", e2(cur["net_burn"]), cur["net_burn"]),
        ("Net burn previous month", e2(prev["net_burn"]), prev["net_burn"]),
        ("Average net burn, last 3 months", e2(cur["avg_net_burn_3m"]), cur["avg_net_burn_3m"]),
        ("Average net burn, last 3 months, as of previous month", e2(prev["avg_net_burn_3m"]), prev["avg_net_burn_3m"]),
        ("Runway at average net burn (months)", d2(cur["runway_months"]), cur["runway_months"]),
        ("Runway as of previous month (months)", d2(prev["runway_months"]), prev["runway_months"]),
        ("Month cash would run out at that burn", label(cur["zero_cash_month"]), None),
        ("Collections (cash in from customers)", e2(cur["collections"]), cur["collections"]),
        ("Payments (cash out)", e2(cur["payments"]), cur["payments"]),
        ("MRR", e2(cur["closing_mrr"]), cur["closing_mrr"]),
        ("MRR previous month", e2(cur["opening_mrr"]), cur["opening_mrr"]),
        ("MRR change this month", e2(cur["closing_mrr"] - cur["opening_mrr"]), cur["closing_mrr"] - cur["opening_mrr"]),
        ("New MRR", e2(cur["new_mrr"]), cur["new_mrr"]),
        ("Expansion MRR", e2(cur["expansion_mrr"]), cur["expansion_mrr"]),
        ("Contraction MRR", e2(cur["contraction_mrr"]), cur["contraction_mrr"]),
        ("Churned MRR", e2(cur["churn_mrr"]), cur["churn_mrr"]),
        ("Largest single churned customer this month (MRR)", e2(biggest_churn) if biggest_churn else "none", biggest_churn),
        ("New customers", str(cur["new_customers"]), cur["new_customers"]),
        ("Churned customers", str(cur["churned_customers"]), cur["churned_customers"]),
        ("Active customers", str(cur["active_customers"]), cur["active_customers"]),
        ("Average MRR per new customer this month", e2(new_avg) if new_avg else "none", new_avg),
        ("Average MRR per new customer, previous 12 months", e2(new_avg12), new_avg12),
        ("ARR", e2(cur["arr"]), cur["arr"]),
        ("ARR growth vs 12 months earlier (%)", p2(cur["arr_growth_12m"] * 100), cur["arr_growth_12m"] * 100),
        ("Net revenue retention, 12 months (%)", p2(cur["nrr_12m"] * 100), cur["nrr_12m"] * 100),
        ("Burn multiple, last 3 months",
         d2(cur["burn_multiple"]) if cur["burn_multiple"] is not None else cur["burn_multiple_note"],
         cur["burn_multiple"]),
        ("Gross margin (%)", p2(cur["gross_margin_pct"] * 100), cur["gross_margin_pct"] * 100),
        ("EBITDA", e2(cur["ebitda"]), cur["ebitda"]),
        ("Headcount", str(cur["headcount"]), cur["headcount"]),
        ("Headcount previous month", str(prev["headcount"]), prev["headcount"]),
        ("Headcount 3 months earlier", str(hc3["headcount"]), hc3["headcount"]),
        ("Payroll", e2(cur["payroll"]), cur["payroll"]),
        ("Payroll previous month", e2(prev["payroll"]), prev["payroll"]),
        ("Non-payroll costs", e2(cur["opex_total"]), cur["opex_total"]),
        ("Non-payroll costs previous month", e2(prev["opex_total"]), prev["opex_total"]),
        ("Professional fees", e2(cur["opex_professional_fees"]), cur["opex_professional_fees"]),
        ("Professional fees, average of previous 12 months", e2(fees12), fees12),
        ("Marketing", e2(cur["opex_marketing"]), cur["opex_marketing"]),
        ("Metrics that got worse vs previous month", "; ".join(worsened(con, month)) or "none", None),
    ]
    return f


def facts_text(facts):
    return "\n".join(f"- {k}: {v}" for k, v, _ in facts)


def make_prompt(facts):
    return (f"Fact sheet for the update (all figures from the company's own data):\n{facts_text(facts)}\n\n"
            "Notes on the data: annual customers pay 12 months upfront, so collections and net burn "
            "jump around from month to month. Runway uses the 3-month average to smooth that.\n\n"
            "Write the text parts of the investor update for this month.")


LABELS = {"TL;DR": "tldr", "Highlight": "highlights", "Lowlight": "lowlights", "Ask": "ask"}


def split_parts(text):
    """Split the model's answer into its parts by the line labels. Several highlights or
    lowlights are joined with a newline. Lines without a known label go to 'unparsed',
    which the checker flags. Nothing is rewritten."""
    parts = {"tldr": [], "highlights": [], "lowlights": [], "ask": [], "unparsed": []}
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^\**(TL;DR|Highlight|Lowlight|Ask)\**\s*:\**\s*(.+)$", line)
        if m:
            parts[LABELS[m.group(1)]].append(m.group(2).strip())
        else:
            parts["unparsed"].append(line)
    return {k: "\n".join(v) for k, v in parts.items()}


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
        parts = split_parts(text)
        rows.append([month[:7], parts["tldr"], parts["highlights"], parts["lowlights"], parts["ask"],
                     parts["unparsed"], text, MODEL, PROMPT_VERSION, h,
                     resp.usage.input_tokens, resp.usage.output_tokens, round(cost, 6)])
        print(f"  {label(month)}: {resp.usage.input_tokens} in / {resp.usage.output_tokens} out, "
              f"USD {cost:.4f} (total {spent:.4f})")

    with open(AI_DIR / "updates.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["month", "tldr", "highlights", "lowlights", "ask", "unparsed", "raw_text",
                    "model", "prompt_version", "input_hash", "tokens_in", "tokens_out", "cost_usd"])
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
