-- Key metrics table for the investor update (not written by AI).
-- One row per month: seven numbers plus their change versus the previous month.
-- The dashboard shows this table inside each update. NRR is included only so the
-- update scripts can see whether it is below 100 %; the table does not show it.
--   runway_months = runway at current burn (closing cash / 3-month average net burn)
--   arr_growth_12m change is in percentage points (0.012 = +1,2 points)
CREATE OR REPLACE VIEW update_metrics AS
WITH m AS (
    SELECT
        s.month,
        s.closing_cash      AS cash,
        s.net_burn,
        r.runway_months,
        b.closing_mrr       AS mrr,
        u.arr_growth_12m,
        b.active_customers  AS customers,
        s.headcount,
        u.nrr_12m
    FROM monthly_summary AS s
    JOIN mrr_bridge AS b USING (month)
    JOIN runway AS r USING (month)
    JOIN unit_metrics AS u USING (month)
)
SELECT
    *,
    cash           - LAG(cash)           OVER w AS cash_change,
    net_burn       - LAG(net_burn)       OVER w AS net_burn_change,
    runway_months  - LAG(runway_months)  OVER w AS runway_change,
    mrr            - LAG(mrr)            OVER w AS mrr_change,
    arr_growth_12m - LAG(arr_growth_12m) OVER w AS arr_growth_change,
    customers      - LAG(customers)      OVER w AS customers_change,
    headcount      - LAG(headcount)      OVER w AS headcount_change
FROM m
WINDOW w AS (ORDER BY month);
