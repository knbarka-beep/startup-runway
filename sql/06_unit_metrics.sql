-- ARR, ARR growth, net revenue retention (NRR) and burn multiple.
--   ARR             = closing MRR x 12
--   arr_growth_12m  = ARR / ARR 12 months earlier - 1
--   NRR (12m)       = MRR today from customers who were active 12 months ago
--                     / their MRR 12 months ago. New customers are excluded.
--   burn multiple   = net burn over the last 3 months / net new ARR over the
--                     same 3 months. Only shown when net new ARR is positive.
-- All windows look backwards only.
CREATE OR REPLACE VIEW unit_metrics AS
WITH base AS (
    SELECT
        b.month,
        b.closing_mrr * 12                                   AS arr,
        LAG(b.closing_mrr * 12, 12) OVER (ORDER BY b.month) AS arr_12m_ago,
        LAG(b.closing_mrr * 12, 3)  OVER (ORDER BY b.month) AS arr_3m_ago,
        CASE WHEN COUNT(*) OVER w3 = 3 THEN SUM(s.net_burn) OVER w3 END AS net_burn_3m
    FROM mrr_bridge AS b
    JOIN monthly_summary AS s USING (month)
    WINDOW w3 AS (ORDER BY b.month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
),
nrr AS (
    SELECT
        now.month,
        SUM(COALESCE(cur.mrr, 0)) / SUM(old.mrr) AS nrr_12m
    FROM (SELECT DISTINCT month FROM cash) AS now
    JOIN customer_mrr_monthly AS old
      ON old.month = CAST(now.month - INTERVAL 12 MONTH AS DATE)
    LEFT JOIN customer_mrr_monthly AS cur
      ON cur.month = now.month AND cur.customer_id = old.customer_id
    GROUP BY now.month
)
SELECT
    base.month,
    base.arr,
    base.arr_12m_ago,
    base.arr / base.arr_12m_ago - 1 AS arr_growth_12m,
    nrr.nrr_12m,
    base.net_burn_3m,
    base.arr - base.arr_3m_ago      AS net_new_arr_3m,
    CASE WHEN base.arr - base.arr_3m_ago > 0
         THEN base.net_burn_3m / (base.arr - base.arr_3m_ago) END AS burn_multiple,
    CASE WHEN base.arr_3m_ago IS NULL OR base.net_burn_3m IS NULL THEN 'Not enough history yet'
         WHEN base.arr - base.arr_3m_ago <= 0
         THEN 'Not meaningful: ARR did not grow over the last 3 months'
    END AS burn_multiple_note
FROM base
LEFT JOIN nrr USING (month);
