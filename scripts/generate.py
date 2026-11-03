"""Generate synthetic data for Nordlys Analytics ApS (fictional).

Writes CSV files to data/raw/. Everything is made up. A fixed random seed
means every run gives exactly the same numbers.

The planted story (see docs/data-spec.md):
  1. Hiring push Mar to May 2026 (6 hires) that raises burn before revenue follows.
  2. The largest customer churns in Jul 2026 (does not renew its annual contract).
  3. Price increase of 10 % on new contracts from Jun 2026.
  4. One quiet good month with strong expansion revenue (Nov 2025).
  5. A one-off recruiting agency fee in Apr 2026.

Simple rules used throughout:
  - Revenue in a month = MRR in that month (no part-month proration).
  - Monthly plans pay every month. Annual plans pay 12 x MRR upfront at the
    start and at every anniversary. Annual customers can only expand, shrink
    or leave at an anniversary.
  - Salaries and costs are paid in the month they occur.
"""

import csv
import random
from pathlib import Path

SEED = 42
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw"

# 24 months: Oct 2024 (index 0) to Sep 2026 (index 23).
N_MONTHS = 24
START_YEAR, START_MONTH = 2024, 10


def month_str(i):
    """Month index (0 = Oct 2024, can be negative) -> 'YYYY-MM-01'."""
    total = START_YEAR * 12 + (START_MONTH - 1) + i
    return f"{total // 12}-{total % 12 + 1:02d}-01"


# ---------------------------------------------------------------- assumptions
# All of these are own assumptions, listed in docs/assumptions.md.
STARTING_CASH = 350_000          # cash in bank before the seed round lands
SEED_ROUND = 3_000_000           # closed in month 1 (Oct 2024)
LOADED_COST_FACTOR = 1.12        # gross salary x 1.12 = employer cost

LIST_PRICE = {"Starter": 450, "Growth": 1_100, "Enterprise": 2_800}  # EUR MRR
PLAN_MIX = [("Starter", 0.50), ("Growth", 0.35), ("Enterprise", 0.15)]
ANNUAL_SHARE = 0.60              # share of new customers on annual plans
PRICE_INCREASE_FROM = 20         # Jun 2026: new contracts +10 %
PRICE_INCREASE = 1.10

MONTHLY_CHURN_P = 0.018          # monthly plan: chance of leaving each month
MONTHLY_EXPAND_P = 0.04
MONTHLY_CONTRACT_P = 0.015
RENEWAL_CHURN_P = 0.10           # annual plan: chance of leaving at anniversary
RENEWAL_EXPAND_P = 0.25
RENEWAL_CONTRACT_P = 0.08

GOOD_MONTH = 13                  # Nov 2025: strong expansion month
BIG_CHURN_MONTH = 21             # Jul 2026: largest customer leaves
HIRING_PUSH = {17: ["sales", "sales", "engineering"],   # Mar 2026
               18: ["sales", "engineering"],            # Apr 2026
               19: ["customer success"]}                # May 2026
ONE_OFF_MONTH = 18               # Apr 2026 recruiting agency fee
ONE_OFF_AMOUNT = 24_000

SALARY_RANGE = {                 # gross monthly salary in EUR
    "engineering": (6_200, 7_500),
    "sales": (5_200, 6_200),
    "customer success": (4_600, 5_300),
    "G&A": (5_000, 6_000),
}

SEGMENTS = ["Logistics", "Retail", "Manufacturing", "Professional services", "Energy"]
NAME_A = ["Tind", "Vester", "Kvist", "Moll", "Ravn", "Ostra", "Lyng", "Hvid",
          "Strand", "Birke", "Skjold", "Fure", "Solve", "Varde", "Ekel", "Hals"]
NAME_B = ["myr", "holt", "vik", "dal", "sund", "lund", "berg", "nes", "rud", "toft"]
NAME_C = ["Logistik", "Handel", "Industri", "Partners", "Energi", "Gruppen", "Systems"]
LEGAL = ["A/S", "ApS", "AB", "AS", "Oy"]


def main():
    rng = random.Random(SEED)
    used_names = set()

    def new_name():
        while True:
            n = f"{rng.choice(NAME_A)}{rng.choice(NAME_B)} {rng.choice(NAME_C)} {rng.choice(LEGAL)}"
            if n not in used_names:
                used_names.add(n)
                return n

    def pick_plan():
        r, acc = rng.random(), 0.0
        for plan, share in PLAN_MIX:
            acc += share
            if r < acc:
                return plan
        return PLAN_MIX[-1][0]

    def round10(x):
        return int(round(x / 10.0)) * 10

    customers = []   # dicts; 'mrr' is current MRR while active
    movements = []   # (month_index, customer_id, type, amount)

    def add_customer(start, plan, billing, mrr):
        c = {"id": f"C{len(customers) + 1:03d}", "name": new_name(),
             "segment": rng.choice(SEGMENTS), "plan": plan, "billing": billing,
             "start": start, "end": None, "mrr": mrr}
        customers.append(c)
        movements.append((start, c["id"], "new", mrr))
        return c

    # ---- opening book on 1 Oct 2024: 40 customers that started before the window.
    # Their history is compressed into one 'new' row at the MRR they had on 1 Oct 2024.
    # The largest customer is created first so it is easy to find.
    add_customer(-15, "Enterprise", "annual", 9_400)   # started Jul 2023, renews every July
    for _ in range(39):
        plan = pick_plan()
        billing = "annual" if rng.random() < ANNUAL_SHARE else "monthly"
        start = -rng.randint(1, 23)
        add_customer(start, plan, billing, round10(LIST_PRICE[plan] * rng.uniform(0.8, 1.5)))
    big_customer = customers[0]

    snapshot = []     # (month_index, customer_id, mrr) for every active customer
    collections = []  # per month

    for m in range(N_MONTHS):
        good = m == GOOD_MONTH
        # 1) existing customers: churn, expansion, contraction
        for c in customers:
            if c["end"] is not None or c["start"] >= m:
                continue
            age = m - c["start"]
            if c["billing"] == "monthly":
                churn_p, exp_p, con_p = MONTHLY_CHURN_P, MONTHLY_EXPAND_P, MONTHLY_CONTRACT_P
                if good:
                    exp_p = 0.35
            elif age % 12 == 0:  # annual plan at its anniversary
                churn_p, exp_p, con_p = RENEWAL_CHURN_P, RENEWAL_EXPAND_P, RENEWAL_CONTRACT_P
                if good:
                    exp_p = 0.70
            else:
                continue  # annual plan mid-term: nothing changes
            if c is big_customer:
                churn_p, exp_p, con_p = (1.0, 0, 0) if m == BIG_CHURN_MONTH else (0, 0, 0)
            r = rng.random()
            if r < churn_p:
                c["end"] = m
                movements.append((m, c["id"], "churn", -c["mrr"]))
            elif r < churn_p + exp_p:
                delta = round10(c["mrr"] * rng.uniform(0.15, 0.35))
                c["mrr"] += delta
                movements.append((m, c["id"], "expansion", delta))
            elif r < churn_p + exp_p + con_p:
                delta = round10(c["mrr"] * rng.uniform(0.10, 0.20))
                c["mrr"] -= delta
                movements.append((m, c["id"], "contraction", -delta))

        # 2) new customers. Expected count rises over time and a bit more
        #    once the spring 2026 sales hires have ramped up (from Jul 2026).
        expected = 2.2 + 0.8 * m / (N_MONTHS - 1) + (0.6 if m >= 21 else 0)
        n_new = int(expected) + (1 if rng.random() < expected - int(expected) else 0)
        price_factor = PRICE_INCREASE if m >= PRICE_INCREASE_FROM else 1.0
        for _ in range(n_new):
            plan = pick_plan()
            billing = "annual" if rng.random() < ANNUAL_SHARE else "monthly"
            mrr = round10(LIST_PRICE[plan] * price_factor * rng.uniform(0.8, 1.5))
            add_customer(m, plan, billing, mrr)

        # 3) snapshot and collections for the month
        coll = 0
        for c in customers:
            if c["start"] <= m and c["end"] is None:
                snapshot.append((m, c["id"], c["mrr"]))
                if c["billing"] == "monthly":
                    coll += c["mrr"]
                elif (m - c["start"]) % 12 == 0:
                    coll += 12 * c["mrr"]
        collections.append(coll)

    # ---------------------------------------------------------------- headcount
    staff = []

    def hire(role, team, start, end=None):
        lo, hi = SALARY_RANGE[team]
        gross = round(rng.uniform(lo, hi) / 50) * 50
        staff.append({"employee_id": f"E{len(staff) + 1:02d}", "role": role, "team": team,
                      "start": start, "end": end,
                      "monthly_cost": round(gross * LOADED_COST_FACTOR)})

    hire("CEO and co-founder", "G&A", -30)
    hire("CTO and co-founder", "engineering", -30)
    for i in range(6):
        hire("Software engineer", "engineering", -rng.randint(3, 26))
    hire("Account executive", "sales", -rng.randint(3, 20))
    hire("Account executive", "sales", -rng.randint(3, 20), end=8)  # leaves Jun 2025
    hire("Head of sales", "sales", -rng.randint(3, 20))
    for i in range(3):
        hire("Customer success manager", "customer success", -rng.randint(3, 20))
    hire("Finance and operations lead", "G&A", -rng.randint(3, 20))
    # steady hires during 2025
    hire("Software engineer", "engineering", 3)          # Jan 2025
    hire("Account executive", "sales", 6)                # Apr 2025
    hire("Account executive", "sales", 11)               # Sep 2025, replaces leaver
    hire("Customer success manager", "customer success", 10)  # Aug 2025
    hire("Software engineer", "engineering", 12)         # Oct 2025
    # spring 2026 hiring push
    for m, teams in HIRING_PUSH.items():
        for team in teams:
            role = {"sales": "Account executive", "engineering": "Software engineer",
                    "customer success": "Customer success manager"}[team]
            hire(role, team, m)

    def active_staff(m):
        # 'end' is the first month the person is no longer employed
        return [s for s in staff if s["start"] <= m and (s["end"] is None or m < s["end"])]

    # --------------------------------------------------------------------- opex
    opex = []  # (month, category, amount)
    mrr_by_month = [sum(v for (mm, _, v) in snapshot if mm == m) for m in range(N_MONTHS)]
    for m in range(N_MONTHS):
        heads = len(active_staff(m))
        rows = {
            "cloud hosting": 2_500 + 0.07 * mrr_by_month[m],
            "software": 1_200 + 140 * heads,
            "marketing": (5_000 + 4_000 * m / (N_MONTHS - 1)) * rng.uniform(0.9, 1.1),
            "office": 2_000 + 300 * heads,
            "professional fees": 2_500 * rng.uniform(0.8, 1.2) + (ONE_OFF_AMOUNT if m == ONE_OFF_MONTH else 0),
            "other": rng.uniform(1_000, 2_000),
        }
        for cat, amt in rows.items():
            opex.append((m, cat, round(amt)))

    # --------------------------------------------------------------------- cash
    cash_rows = []
    balance = STARTING_CASH
    for m in range(N_MONTHS):
        payroll = sum(s["monthly_cost"] for s in active_staff(m))
        other = sum(a for (mm, _, a) in opex if mm == m)
        funding = SEED_ROUND if m == 0 else 0
        closing = balance + collections[m] - (payroll + other) + funding
        cash_rows.append([month_str(m), balance, collections[m], payroll, other,
                          payroll + other, funding, closing])
        balance = closing

    # -------------------------------------------------------------------- write
    OUT.mkdir(parents=True, exist_ok=True)

    def write(name, header, rows):
        with open(OUT / name, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(header)
            w.writerows(rows)

    write("customers.csv",
          ["customer_id", "name", "segment", "plan", "billing", "start_month", "end_month", "mrr"],
          [[c["id"], c["name"], c["segment"], c["plan"], c["billing"], month_str(c["start"]),
            month_str(c["end"]) if c["end"] is not None else "", c["mrr"]] for c in customers])
    write("mrr_movements.csv", ["month", "customer_id", "type", "amount"],
          [[month_str(m), cid, t, a] for (m, cid, t, a) in movements])
    write("mrr_snapshot.csv", ["month", "customer_id", "mrr"],
          [[month_str(m), cid, v] for (m, cid, v) in snapshot])
    write("headcount.csv",
          ["employee_id", "role", "team", "start_month", "end_month", "monthly_cost"],
          [[s["employee_id"], s["role"], s["team"], month_str(s["start"]),
            month_str(s["end"]) if s["end"] is not None else "", s["monthly_cost"]] for s in staff])
    write("opex.csv", ["month", "category", "amount"],
          [[month_str(m), cat, a] for (m, cat, a) in opex])
    write("cash.csv",
          ["month", "opening_balance", "collections", "payments_payroll", "payments_opex",
           "payments", "funding", "closing_balance"], cash_rows)

    print(f"customers: {len(customers)}, movements: {len(movements)}, staff: {len(staff)}")
    print(f"MRR Oct 2024: {mrr_by_month[0]:,}  Sep 2026: {mrr_by_month[-1]:,}")
    print(f"Headcount Oct 2024: {len(active_staff(0))}  Sep 2026: {len(active_staff(23))}")
    last3 = [r[5] - r[2] for r in cash_rows[-3:]]
    print(f"Closing cash Sep 2026: {cash_rows[-1][-1]:,}  avg net burn 3m: {sum(last3)/3:,.0f}"
          f"  runway: {cash_rows[-1][-1] / (sum(last3)/3):.1f} months")


if __name__ == "__main__":
    main()
