"""Python copy of web/lib/scenario.ts, used to check the TypeScript version.

Reads the starting point from data/export/dashboard.json (the same file the
website uses), projects the base case and one stress case, prints PASS/FAIL
for a few sanity checks, and writes data/check/scenario_python.json.
The web test (cd web && npm test) then checks that TypeScript gives the same
cash every month within EUR 1.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPORT = ROOT / "data" / "export" / "dashboard.json"
OUT = ROOT / "data" / "check" / "scenario_python.json"
MONTHS_AHEAD = 24


def add_months(month, n):
    year, mon = map(int, month.split("-"))
    total = year * 12 + (mon - 1) + n
    return f"{total // 12}-{total % 12 + 1:02d}"


def hires_started_by(t, hires):
    return sum(1 for i in range(hires) if (i * 12) // hires + 1 <= t)


def project(base, s):
    rows, mrr, cash = [], base["start_mrr"], base["start_cash"]
    for t in range(1, MONTHS_AHEAD + 1):
        mrr = mrr * (1 + s["growthRate"] - s["churnRate"])
        payroll = base["monthly_payroll"] + hires_started_by(t, s["hires"]) * base["cost_per_hire"]
        opex = base["monthly_opex"] * (1 + s["opexChange"])
        funding = s["fundingAmount"] if t == s["fundingMonth"] else 0
        cash = cash + mrr - payroll - opex + funding
        rows.append({"month": add_months(base["start_month"], t), "mrr": mrr,
                     "payroll": payroll, "opex": opex, "funding": funding, "cash": cash})
    return rows


def zero_cash_month(rows):
    return next((r["month"] for r in rows if r["cash"] < 0), None)


def main():
    base = json.loads(EXPORT.read_text(encoding="utf-8"))["scenario_base"]
    default = {"hires": 0, "growthRate": base["default_growth_rate"],
               "churnRate": base["default_churn_rate"], "opexChange": 0,
               "fundingAmount": 0, "fundingMonth": 6}
    stress = dict(default, hires=8, churnRate=default["churnRate"] * 1.5, opexChange=0.1,
                  fundingAmount=1_500_000, fundingMonth=9)
    cases = {"base": {"settings": default, "rows": project(base, default)},
             "stress": {"settings": stress, "rows": project(base, stress)}}

    b = cases["base"]["rows"]
    first = b[0]
    expected_first = base["start_cash"] + base["start_mrr"] * (1 + default["growthRate"] - default["churnRate"]) \
        - base["monthly_payroll"] - base["monthly_opex"]
    checks = [
        ("24 projected months, starting the month after the last actual",
         len(b) == 24 and b[0]["month"] == add_months(base["start_month"], 1)),
        ("Month 1 cash = start cash + MRR - payroll - opex", abs(first["cash"] - expected_first) < 0.01),
        ("Hiring helper: 3 hires start in months 1, 5, 9",
         [hires_started_by(t, 3) for t in (1, 4, 5, 8, 9, 12)] == [1, 1, 2, 2, 3, 3]),
        ("Hiring helper: 15 hires all started by month 12", hires_started_by(12, 15) == 15),
        ("Stress case funding arrives in month 9 only",
         [r["funding"] for r in cases["stress"]["rows"]].count(1_500_000) == 1
         and cases["stress"]["rows"][8]["funding"] == 1_500_000),
    ]
    for name, ok in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}")
    print(f"Base case zero-cash month: {zero_cash_month(b) or 'not within 24 months'}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(cases, indent=1), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}")
    sys.exit(0 if all(ok for _, ok in checks) else 1)


if __name__ == "__main__":
    main()
