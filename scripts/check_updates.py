"""Check the AI investor updates (prompt v3) without using AI.

Only the AI-written parts are checked: TL;DR, highlights, lowlights and ask.
The key metrics table comes straight from the SQL views, so there is nothing to check there.
Text inside square brackets is a placeholder for the founder and is left out of the
number and cause checks.

For each update:
  1. Numbers: every number must match a number in that month's fact sheet (built from
     the SQL views) within rounding. Tolerance = half a unit of the precision the text
     uses: "€1,58m" may be 1.575.000 to 1.585.000, "€55,8k" may be 55.750 to 55.850,
     "14,3" may be 14,25 to 14,35. So both forms the model is given match: the exact
     value ("€55.811") and the display form ("€55,8k"). Signs are ignored ("fell by
     €6.870" vs -6.870). Skipped: years (2020 to 2039), the method constants 3 and 12
     when followed by "month" ("3-month average", "12 months ago"), and 100 when
     followed by "%" (our own rule "net revenue retention below 100 %", not a data value).
  2. Causes: a crude keyword list. If the text names a cause, the data for that month
     must support it (for example "churn" needs churned MRR < 0). Some words are never
     supported because the data has no such column ("seasonal", "pipeline", ...). A
     keyword right after "no", "not", "without", "zero", "none" or "nothing", or right
     before "none"/"no" ("lost none"), is ignored. Deliberately simple; it will miss things.
  3. Structure: exactly one TL;DR and one ask, at most two highlights and two lowlights,
     at least one lowlight when a key metric got worse (same list the AI was given),
     at most two numbers in each highlight or lowlight, no unlabelled lines.
  4. TL;DR (v3): at most 30 words and two numbers, and it does not lead with runway
     ("runway" in its first five words).
  5. Style: at most 110 words in the AI parts, none of the banned filler words, no em or
     en dashes, placeholders only inside square brackets and only at the end of a sentence.

This checks numbers, causes, structure and a few style rules, not writing quality.
check_draft() is also used by scripts/write_updates.py to check each draft right after
it is written, and to tell the model which checks failed.
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
MAX_TLDR_WORDS = 30
NUMBER = re.compile(r"(€)?(\d+(?:[.,]\d+)*)(\s?[km]\b)?(\s?%)?")
NEGATION = re.compile(r"\b(no|not|without|zero|none|nothing)\b[\w\s]{0,15}$")
NEGATION_AFTER = re.compile(r"^\w*\s+(none|no)\b")   # "lost none", "lost no customers"
# Filler words from the prompt. A word counts if it starts with one of these stems,
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


def count_numbers(text):
    """Numbers in a sentence, counted the same way as the number check (placeholders left out)."""
    return check_numbers(PLACEHOLDER.sub("", text), [])[0]


def structure_and_style(u, worse):
    """Return the failed structure and style checks as (check, detail) pairs (empty list = fine).
    The detail names the offending sentence or word, so it can be shown to the model as it is."""
    fails = []
    tldr, highs, lows, ask = lines(u["tldr"]), lines(u["highlights"]), lines(u["lowlights"]), lines(u["ask"])
    ai_text = " ".join(tldr + highs + lows + ask)
    if len(tldr) != 1:
        fails.append(("structure", f"{len(tldr)} TL;DR lines (need 1)"))
    if len(ask) != 1:
        fails.append(("structure", f"{len(ask)} ask lines (need 1)"))
    if len(highs) > 2:
        fails.append(("structure", f"{len(highs)} highlights (max 2)"))
    if len(lows) > 2:
        fails.append(("structure", f"{len(lows)} lowlights (max 2)"))
    if worse and not lows:
        fails.append(("missing lowlight", "no lowlight although these metrics got worse: " + "; ".join(worse)))
    for sentence in highs + lows:
        n = count_numbers(sentence)
        if n > 2:
            fails.append(("numbers per sentence", f'{n} numbers (max 2) in "{sentence}"'))
    for sentence in tldr[:1]:
        n, w = count_numbers(sentence), len(sentence.split())
        if w > MAX_TLDR_WORDS:
            fails.append(("TL;DR length", f'{w} words (max {MAX_TLDR_WORDS}) in "{sentence}"'))
        if n > 2:
            fails.append(("TL;DR numbers", f'{n} numbers (max 2) in "{sentence}"'))
        if "runway" in " ".join(sentence.lower().split()[:5]):
            fails.append(("TL;DR leads with runway", f'"{sentence}"'))
    if (u.get("unparsed") or "").strip():
        fails.append(("unlabelled text", f'"{u["unparsed"].strip()}"'))
    words = len(ai_text.split())
    if words > MAX_WORDS:
        fails.append(("word limit", f"{words} words (max {MAX_WORDS})"))
    banned = sorted({m.group(0).lower() for m in BANNED_RE.finditer(ai_text)})
    if banned:
        fails.append(("banned words", ", ".join(banned)))
    if "—" in ai_text or "–" in ai_text:   # em dash or en dash
        fails.append(("dash", "em or en dash used"))
    outside = PLACEHOLDER.sub("", ai_text)
    if "[" in outside or "]" in outside or LOOSE_PLACEHOLDER.search(outside):
        fails.append(("placeholder format", "placeholder text outside square brackets"))
    for sentence in tldr + highs + lows + ask:
        for m in PLACEHOLDER.finditer(sentence):
            if sentence[m.end():].strip() not in ("", ".", "!", "?"):
                fails.append(("placeholder position", f'placeholder in the middle of "{sentence}"'))
    return fails, words, len(PLACEHOLDER.findall(ai_text)), banned


def check_draft(u, con, month):
    """All checks for one draft. u has the keys tldr, highlights, lowlights, ask, unparsed.
    month is 'YYYY-MM'. Returns a dict; 'failures' is a list of (check, detail) pairs."""
    facts = build_facts(con, f"{month}-01")
    fdict = {k: v for k, _, v in facts}
    worse = worsened(con, f"{month}-01")
    ai_text = " ".join(lines(u["tldr"]) + lines(u["highlights"]) + lines(u["lowlights"]) + lines(u["ask"]))
    no_placeholders = PLACEHOLDER.sub("", ai_text)
    n_found, unmatched = check_numbers(no_placeholders, facts)
    named, unsupported = causes(no_placeholders, fdict, month)
    fails, words, n_placeholders, banned = structure_and_style(u, worse)
    fails = ([("number not in the data", n) for n in unmatched]
             + [("cause not in the data", c) for c in unsupported] + fails)
    return {"words": words, "placeholders": n_placeholders, "numbers_found": n_found,
            "numbers_matched": n_found - len(unmatched), "unmatched": unmatched, "named": named,
            "unsupported": unsupported, "banned": banned, "worse": worse, "failures": fails,
            "passed": not fails}


def failed_checks(failures):
    """Short names of the failed checks, each once: 'numbers per sentence; word limit'."""
    return "; ".join(dict.fromkeys(name for name, _ in failures))


def self_test():
    """The checker must accept correct text and catch each kind of mistake."""
    facts = [("Closing cash", "", 1_579_630), ("Runway", "", 14.32), ("Churned MRR", "", -9_400)]
    found, bad = check_numbers("Cash €1,58m (€1.579.630), runway 14,3 months, "
                               "churn €9.400 in Sep 2026 on a 3-month view. Wrong: €1,70m and 15,1.", facts)
    assert (found, bad) == (6, ["€1,70m", "15,1"]), (found, bad)
    found, bad = check_numbers("Net revenue retention is below 100% (100 % is the line). Not a percent: 100 customers.",
                               facts)
    assert (found, bad) == (1, ["100"]), (found, bad)  # "100%" is skipped, a bare 100 is still checked
    found, bad = check_numbers("MRR €55,8k or €55.811 (display and exact), not €55k.", [("MRR", "", 55_811)])
    assert (found, bad) == (3, ["€55k"]), (found, bad)
    named, unsupported = causes("We lost none. Pipeline is strong.", {
        "Headcount": 25, "Headcount 3 months earlier": 25, "Payroll": 1, "Payroll previous month": 1,
        "Churned MRR": 0, "Expansion MRR": 0, "Contraction MRR": 0, "Professional fees": 1,
        "Professional fees, average of previous 12 months": 1}, "2026-09")
    assert unsupported == ["not in data"] and "churn" not in named, (named, unsupported)
    good = {"tldr": "We lost our largest customer, worth €9.400 MRR [Founder: add reason].",
            "highlights": "MRR is €103k.", "lowlights": "Runway is 14,3 months.",
            "ask": "Intros to Nordic prospects.", "unparsed": ""}
    assert structure_and_style(good, ["runway got shorter"])[0] == []
    bad = dict(good, lowlights="", highlights="A significant month: €1k, €2k and €3k.",
               ask="Founder: add reason here.",
               tldr="Runway fell to 14,3 months from 16,1 as burn rose to €125k [Founder: add reason] this month.")
    names = [n for n, _ in structure_and_style(bad, ["runway got shorter"])[0]]
    assert names == ["missing lowlight", "numbers per sentence", "TL;DR numbers", "TL;DR leads with runway",
                     "banned words", "placeholder format", "placeholder position"], names
    long_tldr = dict(good, tldr=" ".join(["word"] * 31) + ".")
    assert [n for n, _ in structure_and_style(long_tldr, [])[0]] == ["TL;DR length"]
    print("PASS  Checker self-test: accepts correct text, catches wrong numbers, unsupported causes, "
          "the 100 % threshold, own rounding, missing lowlight, dense sentences, long or runway-led TL;DR, "
          "banned words, loose placeholders and placeholders mid-sentence")


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
        r = check_draft(u, con, month)
        rows.append([month, u.get("attempt", ""), r["words"], r["placeholders"], r["numbers_found"],
                     r["numbers_matched"], "; ".join(r["unmatched"]), "; ".join(r["named"]),
                     "; ".join(r["unsupported"]), "; ".join(r["banned"]), "; ".join(r["worse"]),
                     failed_checks(r["failures"]),
                     "; ".join(f"{n}: {d}" for n, d in r["failures"]
                               if n not in ("number not in the data", "cause not in the data")),
                     r["passed"]])
        print(f"{'PASS' if r['passed'] else 'FAIL'}  {month}: {r['words']} words, {r['placeholders']} placeholders, "
              f"{r['numbers_matched']}/{r['numbers_found']} numbers matched"
              + (f", failed: {failed_checks(r['failures'])}" if r["failures"] else ""))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["month", "attempt", "words", "placeholders", "numbers_found", "numbers_matched",
                    "unmatched_numbers", "causes_named", "unsupported_causes", "banned_words", "metrics_worse",
                    "checks_failed", "problems", "passed"])
        w.writerows(rows)
    n_pass = sum(r[-1] for r in rows)
    total_n = sum(r[4] for r in rows)
    total_ok = sum(r[5] for r in rows)
    print(f"\n{n_pass}/{len(rows)} updates passed. {total_ok}/{total_n} numbers matched the views.")


if __name__ == "__main__":
    main()
