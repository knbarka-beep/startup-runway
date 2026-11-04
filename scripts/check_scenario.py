"""Python copy of web/lib/scenario.ts, used to check the TypeScript version.

Reads the starting point from data/export/dashboard.json (the same file the
website uses), projects the three presets and one stress case, prints PASS/FAIL
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


def salary_factor(base, month):
    januaries = int(month[:4]) - int(base["start_month"][:4])
    return (1 + base["annual_salary_increase"]) ** januaries


def preset_settings(base, name):
    current_plan = {"hires": 2, "students": 2, "growthRate": base["default_growth_rate"],
                    "churnRate": base["default_churn_rate"], "opexChange": 0,
                    "fundingAmount": 0, "fundingMonth": 6}
    if name == "Hiring push":
        return dict(current_plan, hires=6)
    if name == "Downside":
        return dict(current_plan, growthRate=base["default_growth_rate"] * 0.5,
                    churnRate=base["default_churn_rate"] * 1.5)
    return current_plan


def hires_started_by(t, hires):
    return sum(1 for i in range(hires) if (i * 12) // hires + 1 <= t)


def project(base, s):
    rows, mrr, cash = [], base["start_mrr"], base["start_cash"]
    for t in range(1, MONTHS_AHEAD + 1):
        mrr = mrr * (1 + s["growthRate"] - s["churnRate"])
        month = add_months(base["start_month"], t)
        payroll = (base["monthly_payroll"] + hires_started_by(t, s["hires"]) * base["cost_per_hire"]
                   + s["students"] * base["student_assistant_cost"]) * salary_factor(base, month)
        opex = base["monthly_opex"] * (1 + s["opexChange"])
        funding = s["fundingAmount"] if t == s["fundingMonth"] else 0
        cash = cash + mrr - payroll - opex + funding
        rows.append({"month": month, "mrr": mrr,
                     "payroll": payroll, "opex": opex, "funding": funding, "cash": cash})
    return rows


def zero_cash_month(rows):
    return next((r["month"] for r in rows if r["cash"] < 0), None)


def main():
    base = json.loads(EXPORT.read_text(encoding="utf-8"))["scenario_base"]
    current = preset_settings(base, "Current plan")
    stress = dict(current, hires=8, students=6, churnRate=current["churnRate"] * 1.5, opexChange=0.1,
                  fundingAmount=1_500_000, fundingMonth=9)
    cases = {name: {"settings": settings, "rows": project(base, settings)} for name, settings in [
        ("Current plan", current),
        ("Hiring push", preset_settings(base, "Hiring push")),
        ("Downside", preset_settings(base, "Downside")),
        ("Stress", stress),
    ]}

    b = cases["Current plan"]["rows"]
    first = b[0]
    # Month 1 (Oct 2026): first of the 2 hires and both student assistants have started, no raise yet.
    expected_first = base["start_cash"] + base["start_mrr"] * (1 + current["growthRate"] - current["churnRate"])         - (base["monthly_payroll"] + base["cost_per_hire"] + 2 * base["student_assistant_cost"]) - base["monthly_opex"]
    by_month = {r["month"]: r for r in b}
    checks = [
        ("24 projected months, starting the month after the last actual",
         len(b) == 24 and b[0]["month"] == add_months(base["start_month"], 1)),
        ("Month 1 cash = start cash + MRR - payroll (incl. 1 hire, 2 students) - opex",
         abs(first["cash"] - expected_first) < 0.01),
        ("Hiring helper: 3 hires start in months 1, 5, 9",
         [hires_started_by(t, 3) for t in (1, 4, 5, 8, 9, 12)] == [1, 1, 2, 2, 3, 3]),
        ("Hiring helper: 15 hires all started by month 12", hires_started_by(12, 15) == 15),
        ("Salary rise: payroll Jan 2027 = Dec 2026 x 1,03 (no hire starts in Jan)",
         abs(by_month["2027-01"]["payroll"] - by_month["2026-12"]["payroll"] * 1.03) < 0.01),
        ("Salary rise: Jan 2028 payroll = Dec 2027 x 1,03",
         abs(by_month["2028-01"]["payroll"] - by_month["2027-12"]["payroll"] * 1.03) < 0.01),
        ("Presets differ only where intended",
         cases["Hiring push"]["settings"]["hires"] == 6
         and cases["Downside"]["settings"]["growthRate"] == current["growthRate"] * 0.5
         and cases["Downside"]["settings"]["hires"] == current["hires"]),
        ("Stress case funding arrives in month 9 only",
         [r["funding"] for r in cases["Stress"]["rows"]].count(1_500_000) == 1
         and cases["Stress"]["rows"][8]["funding"] == 1_500_000),
    ]
    for name, ok in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}")
    for name, case in cases.items():
        low = min(case["rows"], key=lambda r: r["cash"])
        print(f"{name}: zero-cash month {zero_cash_month(case['rows']) or 'none within 24 months'}, "
              f"lowest cash EUR {low['cash']:,.0f} in {low['month']}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(cases, indent=1), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}")
    sys.exit(0 if all(ok for _, ok in checks) else 1)


if __name__ == "__main__":
    main()
