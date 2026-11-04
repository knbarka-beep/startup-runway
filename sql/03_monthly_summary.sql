-- One row per month: revenue, gross margin, payroll, opex by category, EBITDA,
-- net burn and cash. The main table behind the dashboard.
--   revenue        = closing MRR of the month (revenue recognised = MRR)
--   cost of revenue = cloud hosting + customer success payroll
--   gross profit   = revenue - cost of revenue
--   EBITDA         = revenue - payroll - all opex
--   net burn       = payments - collections (cash out minus cash in, funding excluded)
CREATE OR REPLACE VIEW monthly_summary AS
WITH o AS (
    SELECT
        month,
        SUM(amount) FILTER (WHERE category = 'cloud hosting')     AS opex_cloud_hosting,
        SUM(amount) FILTER (WHERE category = 'software')          AS opex_software,
        SUM(amount) FILTER (WHERE category = 'marketing')         AS opex_marketing,
        SUM(amount) FILTER (WHERE category = 'office')            AS opex_office,
        SUM(amount) FILTER (WHERE category = 'professional fees') AS opex_professional_fees,
        SUM(amount) FILTER (WHERE category = 'other')             AS opex_other,
        SUM(amount)                                               AS opex_total
    FROM opex
    GROUP BY month
),
h AS (
    -- end_month is the first month a person is no longer employed
    SELECT
        c.month,
        COUNT(*)                                                          AS headcount,
        SUM(h.monthly_cost)                                               AS payroll,
        SUM(h.monthly_cost) FILTER (WHERE h.team = 'customer success')    AS payroll_customer_success
    FROM cash AS c
    JOIN headcount AS h
      ON h.start_month <= c.month AND (h.end_month IS NULL OR c.month < h.end_month)
    GROUP BY c.month
)
SELECT
    c.month,
    b.closing_mrr                                          AS revenue,
    o.opex_cloud_hosting + h.payroll_customer_success      AS cost_of_revenue,
    b.closing_mrr - (o.opex_cloud_hosting + h.payroll_customer_success)                 AS gross_profit,
    (b.closing_mrr - (o.opex_cloud_hosting + h.payroll_customer_success)) / b.closing_mrr AS gross_margin_pct,
    h.headcount,
    h.payroll,
    h.payroll_customer_success,
    o.opex_cloud_hosting,
    o.opex_software,
    o.opex_marketing,
    o.opex_office,
    o.opex_professional_fees,
    o.opex_other,
    o.opex_total,
    b.closing_mrr - h.payroll - o.opex_total               AS ebitda,
    c.collections,
    c.payments,
    c.payments - c.collections                             AS net_burn,
    c.funding,
    c.opening_balance                                      AS opening_cash,
    c.closing_balance                                      AS closing_cash
FROM cash AS c
JOIN mrr_bridge AS b USING (month)
JOIN o USING (month)
JOIN h USING (month);
