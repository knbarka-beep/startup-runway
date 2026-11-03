"""Check the AI investor updates without using AI.

For each update:
  1. Numbers: every number in the text must match a number in that month's
     fact sheet (built from the SQL views) within rounding. Tolerance = half a
     unit of the precision the text uses: "€1,58m" may be 1.575.000 to
     1.585.000, "€110k" may be 109.500 to 110.500, "14,3" may be 14,25 to 14,35.
     Signs are ignored ("fell by €6.870" vs -6.870).
     Skipped: years (2020 to 2030) and the method constants 3 and 12 when
     followed by "month" ("3-month average", "previous 12 months").
  2. Causes: a crude keyword list. If the text names a cause, the data for that
     month must support it (for example "churn" needs churned MRR < 0). Some
     words are never supported because the data has no such column
     ("seasonal", "pipeline", ...). A keyword right after "no", "not",
     "without", "zero", "none" or "nothing", or right before "none"/"no"
     ("lost none") is ignored. This is deliberately simple and will miss
     things; it checks numbers and named causes, not writing quality.
  3. Format: 120 to 180 words, no em or en dashes.

Writes data/check/update_checks.csv and prints a summary.
"""

import csv
import re
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
from build_db import build  # noqa: E402
from write_updates import build_facts  # noqa: E402

UPDATES = ROOT / "data" / "ai" / "updates.csv"
OUT = ROOT / "data" / "check" / "update_checks.csv"

NUMBER = re.compile(r"(€)?(\d+(?:[.,]\d+)*)(\s?[km]\b)?(\s?%)?")
NEGATION = re.compile(r"\b(no|not|without|zero|none|nothing)\b[\w\s]{0,15}$")
NEGATION_AFTER = re.compile(r"^\w*\s+(none|no)\b")   # "lost none", "lost no customers"


def parse(match):
    """Return (value, tolerance) for a number written in European format."""
    _, digits, scale, _ = match.groups()
    if "," in digits:                                   # 1,58 or 19,2
        whole, dec = digits.replace(".", "").split(",", 1)
        value, decimals = float(f"{whole}.{dec}"), len(dec)
    else:                                               # 1.540 or 103 (dots are thousands)
        value, decimals = float(digits.replace(".", "")), 0
    mult = {"k": 1e3, "m": 1e6}.get((scale or "").strip(), 1)
    return value * mult, 0.5 * 10 ** -decimals * mult


def check_numbers(text, facts):
    values = [abs(v) for _, _, v in facts if isinstance(v, (int, float)) and v is not None]
    found, unmatched = 0, []
    for m in NUMBER.finditer(text):
        euro, digits, scale, pct = m.groups()
        after = text[m.end():m.end() + 7]
        if not euro and not scale and not pct and re.fullmatch(r"20[23]\d", digits):
            continue                                    # a year
        if digits in ("3", "12") and re.match(r"[\s-]month", after):
            continue                                    # method constant
        found += 1
        value, tol = parse(m)
        if not any(abs(value - v) <= tol + 1e-9 for v in values):
            unmatched.append(m.group(0).strip())
    return found, unmatched


def causes(text, f, month):
    """Return (causes named, causes named without support in the data)."""
    hc_up = f["Headcount"] > f["Headcount 3 months earlier"] or f["Payroll"] > f["Payroll previous month"]
    rules = {
        "hiring": (["hire", "hiring", "new joiner", "headcount rose", "headcount went", "team grew"], hc_up),
        "churn": (["churn", "lost", "left", "did not renew"], (f["Churned MRR"] or 0) < 0),
        "expansion": (["expansion", "upsell", "expanded"], (f["Expansion MRR"] or 0) > 0),
        "contraction": (["contraction", "downgrade"], (f["Contraction MRR"] or 0) < 0),
        "price increase": (["price increase", "pricing", "higher prices", "price rise", "raised prices"],
                           month >= "2026-06"),
        "one-off cost": (["one-off", "recruiting", "agency fee", "legal"],
                         f["Professional fees"] > 2 * f["Professional fees, average of previous 12 months"]),
        "annual billing timing": (["annual", "upfront", "renewal"], True),
        "not in data": (["seasonal", "seasonality", "summer", "holiday", "macro", "market conditions",
                         "competitor", "pipeline", "product launch", "interest rate"], False),
    }
    named, unsupported = [], []
    low = text.lower()
    for cause, (words, supported) in rules.items():
        hit = False
        for w in words:
            for m in re.finditer(r"\b" + re.escape(w), low):
                before, after = low[max(0, m.start() - 20):m.start()], low[m.start():m.end() + 15]
                if not NEGATION.search(before) and not NEGATION_AFTER.search(after):
                    hit = True
        if hit:
            named.append(cause)
            if not supported:
                unsupported.append(cause)
    return named, unsupported


def self_test():
    """The checker must accept correct rounding and catch a wrong number."""
    facts = [("Closing cash", "", 1_579_630), ("Runway", "", 14.32), ("Churned MRR", "", -9_400)]
    found, bad = check_numbers("Cash €1,58m (€1.579.630), runway 14,3 months, "
                               "churn €9.400 in Sep 2026 on a 3-month view. Wrong: €1,70m and 15,1.", facts)
    assert (found, bad) == (6, ["€1,70m", "15,1"]), (found, bad)
    named, unsupported = causes("We lost none. Pipeline is strong.", {
        "Headcount": 25, "Headcount 3 months earlier": 25, "Payroll": 1, "Payroll previous month": 1,
        "Churned MRR": 0, "Expansion MRR": 0, "Contraction MRR": 0, "Professional fees": 1,
        "Professional fees, average of previous 12 months": 1}, "2026-09")
    assert unsupported == ["not in data"] and "churn" not in named, (named, unsupported)
    print("PASS  Checker self-test: accepts correct rounding, catches wrong numbers and unsupported causes")


def main():
    self_test()
    if not UPDATES.exists():
        print("No data/ai/updates.csv (AI step skipped). Nothing to check.")
        return
    con = duckdb.connect()
    build(con)
    rows = []
    with open(UPDATES, encoding="utf-8") as fh:
        updates = list(csv.DictReader(fh))
    for u in updates:
        month = u["month"]
        facts = build_facts(con, f"{month}-01")
        fdict = {k: v for k, _, v in facts}
        text = u["text"]
        words = len(text.split())
        n_found, unmatched = check_numbers(text, facts)
        named, unsupported = causes(text, fdict, month)
        dash = any(ch in text for ch in "—–")
        passed = not unmatched and not unsupported and 120 <= words <= 180 and not dash
        rows.append([month, words, n_found, n_found - len(unmatched), "; ".join(unmatched),
                     "; ".join(named), "; ".join(unsupported), dash, passed])
        print(f"{'PASS' if passed else 'FAIL'}  {month}: {words} words, "
              f"{n_found - len(unmatched)}/{n_found} numbers matched"
              + (f", unmatched: {unmatched}" if unmatched else "")
              + (f", unsupported causes: {unsupported}" if unsupported else ""))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["month", "words", "numbers_found", "numbers_matched", "unmatched_numbers",
                    "causes_named", "unsupported_causes", "dash_found", "passed"])
        w.writerows(rows)
    n_pass = sum(r[-1] for r in rows)
    total_n = sum(r[2] for r in rows)
    total_ok = sum(r[3] for r in rows)
    print(f"\n{n_pass}/{len(rows)} updates passed. {total_ok}/{total_n} numbers matched the views.")


if __name__ == "__main__":
    main()
