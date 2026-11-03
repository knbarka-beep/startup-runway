-- MRR of each active customer in each month.
-- Built only from mrr_movements: a customer's MRR in a month is the sum of all
-- their movements up to and including that month. Churned customers sum to 0
-- and drop out. Used for net revenue retention (unit_metrics).
CREATE OR REPLACE VIEW customer_mrr_monthly AS
SELECT
    c.month,
    m.customer_id,
    SUM(m.amount) AS mrr
FROM cash AS c
JOIN mrr_movements AS m ON m.month <= c.month
GROUP BY c.month, m.customer_id
HAVING SUM(m.amount) <> 0;
