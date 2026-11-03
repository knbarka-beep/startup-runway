"""Reconciliation checks on the raw CSVs. Prints PASS/FAIL per check.

Exit code 1 if any check fails, so it can block the build.
Uses DuckDB to read the CSVs directly (no database file needed).
"""

import sys
from pathlib import Path

import duckdb

RAW = (Path(__file__).resolve().parent.parent / "data" / "raw").as_posix()
con = duckdb.connect()
for t in ["customers", "mrr_movements", "mrr_snapshot", "headcount", "opex", "cash"]:
    con.execute(f"CREATE VIEW {t} AS SELECT * FROM read_csv_auto('{RAW}/{t}.csv')")


def check(name, sql):
    """sql must return the rows that BREAK the rule. Zero rows = PASS."""
    bad = con.execute(sql).fetchall()
    print(f"{'PASS' if not bad else 'FAIL'}  {name}" + (f"  ({len(bad)} bad rows, first: {bad[0]})" if bad else ""))
    return not bad


results = [
    check("Cash: closing = opening + collections - payments + funding", """
        SELECT month FROM cash
        WHERE closing_balance <> opening_balance + collections - payments + funding"""),
    check("Cash: opening = previous month's closing", """
        SELECT month FROM (
            SELECT month, opening_balance,
                   LAG(closing_balance) OVER (ORDER BY month) AS prev_close FROM cash)
        WHERE prev_close IS NOT NULL AND opening_balance <> prev_close"""),
    check("Cash: payments = payroll + other opex", """
        SELECT month FROM cash WHERE payments <> payments_payroll + payments_opex"""),
    check("MRR: roll-forward of movements ties to customer snapshot each month", """
        WITH snap AS (SELECT month, SUM(mrr) AS mrr FROM mrr_snapshot GROUP BY month),
             roll AS (SELECT c.month, (SELECT SUM(amount) FROM mrr_movements m
                                       WHERE m.month <= c.month) AS mrr FROM cash c)
        SELECT r.month, r.mrr, s.mrr FROM roll r LEFT JOIN snap s USING (month)
        WHERE r.mrr IS DISTINCT FROM s.mrr"""),
    check("MRR: each customer's movements sum to their MRR (0 if churned)", """
        SELECT c.customer_id FROM customers c
        JOIN (SELECT customer_id, SUM(amount) AS total FROM mrr_movements GROUP BY 1) m
          USING (customer_id)
        WHERE m.total <> CASE WHEN c.end_month IS NULL THEN c.mrr ELSE 0 END"""),
    check("Payroll: headcount cost ties to payroll in payments", """
        SELECT c.month FROM cash c
        WHERE c.payments_payroll <> (
            SELECT COALESCE(SUM(monthly_cost), 0) FROM headcount h
            WHERE h.start_month <= c.month AND (h.end_month IS NULL OR c.month < h.end_month))"""),
    check("Opex: opex table ties to other payments", """
        SELECT c.month FROM cash c
        WHERE c.payments_opex <> (SELECT SUM(amount) FROM opex o WHERE o.month = c.month)"""),
    check("Collections: monthly plans + annual upfront invoices tie to collections", """
        WITH billed AS (
            SELECT s.month,
                   SUM(CASE WHEN cu.billing = 'monthly' THEN s.mrr
                            WHEN date_diff('month', cu.start_month, s.month) % 12 = 0 THEN 12 * s.mrr
                            ELSE 0 END) AS amount
            FROM mrr_snapshot s JOIN customers cu USING (customer_id) GROUP BY s.month)
        SELECT c.month FROM cash c LEFT JOIN billed b USING (month)
        WHERE c.collections IS DISTINCT FROM b.amount"""),
]

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
