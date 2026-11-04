"""Check the AI investor updates (prompt v2) without using AI.

Only the AI-written parts are checked: TL;DR, highlights, lowlights and ask.
The key metrics table comes straight from the SQL views, so there is nothing to check there.
Text inside square brackets is a placeholder for the founder and is left out of the
number and cause checks.

For each update:
  1. Numbers: every number must match a number in that month's fact sheet (built from
     the SQL views) within rounding. Tolerance = half a unit of the precision the text
     uses: "€1,58m" may be 1.575.000 to 1.585.000, "€110k" may be 109.500 to 110.500,
     "14,3" may be 14,25 to 14,35. Signs are ignored ("fell by €6.870" vs -6.870).
     Skipped: years (2020 to 2039), the method constants 3 and 12 when followed
     by "month" ("3-month average", "12 months ago"), and 100 when followed by "%"
     (our own rule "net revenue retention below 100 %", not a data value).
  2. Causes: a crude keyword list. If the text names a cause, the data for that month
     must support it (for example "churn" needs churned MRR < 0). Some words are never
     supported because the data has no such column ("seasonal", "pipeline", ...). A
     keyword right after "no", "not", "without", "zero", "none" or "nothing", or right
     before "none"/"no" ("lost none"), is ignored. Deliberately simple; it will miss things.
  3. Structure: exactly one TL;DR and one ask, at most two highlights and two lowlights,
     at least one lowlight when a key metric got worse (same list the AI was given),
     at most two numbers in each highlight or lowlight, no unlabelled lines.
  4. Style: at most 110 words in the AI parts, none of the banned filler words, no em or
     en dashes, placeholders only inside square brackets.

This checks numbers, causes, structure and a few style rules, not writing quality.
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
from write_updates import build_facts, worsened  # noqa: E402

UPDATES = ROOT / "data" / "ai" / "updates.csv"
OUT = ROOT / "data" / "check" / "update_checks.csv"

MAX_WORDS = 110
NUMBER = re.compile(r"(€)?(\d+(?:[.,]\d+)*)(\s?[km]\b)?(\s?%)?")
NEGATION = re.compile(r"\b(no|not|without|zero|none|nothing)\b[\w\s]{0,15}$")
NEGATION_AFTER = re.compile(r"^\w*\s+(none|no)\b")   # "lost none", "lost no customers"
# Filler words from the v2 prompt. A word counts if it starts with one of these stems,
# so "significantly" and "leveraging" are caught too.
BANNED = ["exciting", "excited", "significant", "robust", "momentum", "landscape", "leverag"]
BANNED_RE = re.compile(r"\b(" + "|".join(BANNED) + r")\w*", re.IGNORECASE)
PLACEHOLDER = re.compile(r"\[[^\[\]]*\]")
LOOSE_PLACEHOLDER = re.compile(r"founder\s*:|add reason|\btbd\b|placeholder", re.IGNORECASE)


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
    """Return (numbers found, numbers that match nothing in the fact sheet)."""
    values = [abs(v) for _, _, v in facts if isinstance(v, (int, float)) and v is not None]
    found, unmatched = 0, []
    for m in NUMBER.finditer(text):
        euro, digits, scale, pct = m.groups()
        after = text[m.end():m.end() + 7]
        if not euro and not scale and not pct and re.fullmatch(r"20[23]\d", digits):
            continue                                    # a year
        if digits in ("3", "12") and re.match(r"[\s-]month", after):
            continue                                    # method constant
        if digits == "100" and pct:
            continue                                    # the 100 % NRR threshold from our own rule
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


def lines(part):
    return [x for x in (part or "").split("\n") if x.strip()]


def structure_and_style(u, worse):
    """Return a list of problems with structure and style (empty list = fine)."""
    problems = []
    tldr, highs, lows, ask = lines(u["tldr"]), lines(u["highlights"]), lines(u["lowlights"]), lines(u["ask"])
    ai_text = " ".join(tldr + highs + lows + ask)
    if len(tldr) != 1:
        problems.append(f"{len(tldr)} TL;DR lines (need 1)")
    if len(ask) != 1:
        problems.append(f"{len(ask)} ask lines (need 1)")
    if len(highs) > 2:
        problems.append(f"{len(highs)} highlights (max 2)")
    if len(lows) > 2:
        problems.append(f"{len(lows)} lowlights (max 2)")
    if worse and not lows:
        problems.append("no lowlight although a metric got worse")
    for sentence in highs + lows:
        n, _ = check_numbers(PLACEHOLDER.sub("", sentence), [])
        if n > 2:
            problems.append(f"{n} numbers in one highlight or lowlight (max 2)")
    if (u.get("unparsed") or "").strip():
        problems.append("text outside the labelled parts")
    words = len(ai_text.split())
    if words > MAX_WORDS:
        problems.append(f"{words} words (max {MAX_WORDS})")
    banned = sorted({m.group(0).lower() for m in BANNED_RE.finditer(ai_text)})
    if banned:
        problems.append("banned words: " + ", ".join(banned))
    if "\u2014" in ai_text or "\u2013" in ai_text:   # em dash or en dash
        problems.append("dash")
    outside = PLACEHOLDER.sub("", ai_text)
    if "[" in outside or "]" in outside or LOOSE_PLACEHOLDER.search(outside):
        problems.append("placeholder not in square brackets")
    return problems, words, len(PLACEHOLDER.findall(ai_text)), banned


def self_test():
    """The checker must accept correct text and catch each kind of mistake."""
    facts = [("Closing cash", "", 1_579_630), ("Runway", "", 14.32), ("Churned MRR", "", -9_400)]
    found, bad = check_numbers("Cash €1,58m (€1.579.630), runway 14,3 months, "
                               "churn €9.400 in Sep 2026 on a 3-month view. Wrong: €1,70m and 15,1.", facts)
    assert (found, bad) == (6, ["€1,70m", "15,1"]), (found, bad)
    found, bad = check_numbers("Net revenue retention is below 100% (100 % is the line). Not a percent: 100 customers.",
                               facts)
    assert (found, bad) == (1, ["100"]), (found, bad)  # "100%" is skipped, a bare 100 is still checked
    named, unsupported = causes("We lost none. Pipeline is strong.", {
        "Headcount": 25, "Headcount 3 months earlier": 25, "Payroll": 1, "Payroll previous month": 1,
        "Churned MRR": 0, "Expansion MRR": 0, "Contraction MRR": 0, "Professional fees": 1,
        "Professional fees, average of previous 12 months": 1}, "2026-09")
    assert unsupported == ["not in data"] and "churn" not in named, (named, unsupported)
    good = {"tldr": "We lost our largest customer [Founder: add reason].", "highlights": "MRR is €103k.",
            "lowlights": "Runway is 14,3 months.", "ask": "Intros to Nordic prospects.", "unparsed": ""}
    assert structure_and_style(good, ["runway got shorter"])[0] == []
    bad = dict(good, lowlights="", highlights="A significant month: €1k, €2k and €3k.",
               ask="Founder: add reason here.")
    problems = structure_and_style(bad, ["runway got shorter"])[0]
    assert problems == ["no lowlight although a metric got worse", "3 numbers in one highlight or lowlight (max 2)",
                        "banned words: significant", "placeholder not in square brackets"], problems
    print("PASS  Checker self-test: accepts correct text, catches wrong numbers, unsupported causes, "
          "the 100 % threshold, missing lowlight, dense sentences, banned words and loose placeholders")


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
        worse = worsened(con, f"{month}-01")
        ai_text = " ".join(lines(u["tldr"]) + lines(u["highlights"]) + lines(u["lowlights"]) + lines(u["ask"]))
        no_placeholders = PLACEHOLDER.sub("", ai_text)
        n_found, unmatched = check_numbers(no_placeholders, facts)
        named, unsupported = causes(no_placeholders, fdict, month)
        problems, words, n_placeholders, banned = structure_and_style(u, worse)
        passed = not unmatched and not unsupported and not problems
        rows.append([month, words, n_placeholders, n_found, n_found - len(unmatched), "; ".join(unmatched),
                     "; ".join(named), "; ".join(unsupported), "; ".join(banned), "; ".join(worse),
                     "; ".join(problems), passed])
        print(f"{'PASS' if passed else 'FAIL'}  {month}: {words} words, {n_placeholders} placeholders, "
              f"{n_found - len(unmatched)}/{n_found} numbers matched"
              + (f", unmatched: {unmatched}" if unmatched else "")
              + (f", unsupported causes: {unsupported}" if unsupported else "")
              + (f", problems: {problems}" if problems else ""))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["month", "words", "placeholders", "numbers_found", "numbers_matched", "unmatched_numbers",
                    "causes_named", "unsupported_causes", "banned_words", "metrics_worse", "problems", "passed"])
        w.writerows(rows)
    n_pass = sum(r[-1] for r in rows)
    total_n = sum(r[3] for r in rows)
    total_ok = sum(r[4] for r in rows)
    print(f"\n{n_pass}/{len(rows)} updates passed. {total_ok}/{total_n} numbers matched the views.")


if __name__ == "__main__":
    main()
