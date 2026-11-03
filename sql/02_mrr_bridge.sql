-- MRR bridge: opening MRR + new + expansion + contraction + churn = closing MRR.
-- Contraction and churn are stored as negative numbers.
-- Opening MRR = every movement before the month (customers that started before
-- Oct 2024 have one 'new' row at their real start month).
CREATE OR REPLACE VIEW mrr_bridge AS
WITH moves AS (
    SELECT
        c.month,
        COALESCE(SUM(m.amount) FILTER (WHERE m.type = 'new'), 0)         AS new_mrr,
        COALESCE(SUM(m.amount) FILTER (WHERE m.type = 'expansion'), 0)   AS expansion_mrr,
        COALESCE(SUM(m.amount) FILTER (WHERE m.type = 'contraction'), 0) AS contraction_mrr,
        COALESCE(SUM(m.amount) FILTER (WHERE m.type = 'churn'), 0)       AS churn_mrr,
        COUNT(m.customer_id) FILTER (WHERE m.type = 'new')               AS new_customers,
        COUNT(m.customer_id) FILTER (WHERE m.type = 'churn')             AS churned_customers
    FROM cash AS c
    LEFT JOIN mrr_movements AS m ON m.month = c.month
    GROUP BY c.month
)
SELECT
    mv.month,
    (SELECT SUM(amount) FROM mrr_movements x WHERE x.month < mv.month)  AS opening_mrr,
    mv.new_mrr,
    mv.expansion_mrr,
    mv.contraction_mrr,
    mv.churn_mrr,
    (SELECT SUM(amount) FROM mrr_movements x WHERE x.month <= mv.month) AS closing_mrr,
    mv.new_customers,
    mv.churned_customers,
    (SELECT COUNT(*) FROM customer_mrr_monthly cm WHERE cm.month = mv.month) AS active_customers
FROM moves AS mv;
