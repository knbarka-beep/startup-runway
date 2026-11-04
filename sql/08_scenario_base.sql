-- Starting point and default slider values for the scenario projection.
-- One row. The projection itself runs in web/lib/scenario.ts (browser) and
-- scripts/check_scenario.py (Python copy for checking).
--   start_cash          closing cash in the latest month
--   start_mrr           closing MRR in the latest month
--   monthly_payroll     payroll in the latest month
--   monthly_opex        average non-payroll opex over the last 3 months
--   default_growth_rate average of (new + expansion) / opening MRR, last 12 months
--   default_churn_rate  average of -(churn + contraction) / opening MRR, last 12 months
--   cost_per_hire       average loaded cost by team, weighted by the hiring mix
--   student_assistant_cost  loaded monthly cost of one part-time student assistant (own assumption, docs/assumptions.md)
--   annual_salary_increase  all payroll rises by this share every January (own assumption, docs/assumptions.md)
CREATE OR REPLACE VIEW scenario_base AS
WITH last AS (
    SELECT * FROM monthly_summary ORDER BY month DESC LIMIT 1
),
last12 AS (
    SELECT * FROM mrr_bridge ORDER BY month DESC LIMIT 12
),
last3 AS (
    SELECT * FROM monthly_summary ORDER BY month DESC LIMIT 3
)
SELECT
    last.month                                                             AS start_month,
    last.closing_cash                                                      AS start_cash,
    last.revenue                                                           AS start_mrr,
    last.payroll                                                           AS monthly_payroll,
    (SELECT AVG(opex_total) FROM last3)                                    AS monthly_opex,
    (SELECT AVG((new_mrr + expansion_mrr) / opening_mrr) FROM last12)      AS default_growth_rate,
    (SELECT AVG(-(churn_mrr + contraction_mrr) / opening_mrr) FROM last12) AS default_churn_rate,
    (SELECT SUM(avg_loaded_cost * hiring_share) FROM hire_cost_by_team)    AS cost_per_hire,
    1420                                                                   AS student_assistant_cost,
    0.03                                                                   AS annual_salary_increase
FROM last;
