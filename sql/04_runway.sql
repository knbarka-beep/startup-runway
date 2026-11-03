-- Runway = closing cash / average net burn of the last 3 months (this month
-- and the two before). Needs 3 months of history, so Oct and Nov 2024 are empty.
-- zero_cash_month = the month in which cash would run out at that burn:
-- this month + runway rounded up. Only looks backwards (no future data).
CREATE OR REPLACE VIEW runway AS
WITH t AS (
    SELECT
        month,
        closing_cash,
        net_burn,
        CASE WHEN COUNT(*) OVER w = 3 THEN AVG(net_burn) OVER w END AS avg_net_burn_3m
    FROM monthly_summary
    WINDOW w AS (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
)
SELECT
    month,
    closing_cash,
    net_burn,
    avg_net_burn_3m,
    CASE WHEN avg_net_burn_3m > 0 THEN closing_cash / avg_net_burn_3m END AS runway_months,
    CASE WHEN avg_net_burn_3m > 0
         THEN CAST(month + to_months(CAST(CEIL(closing_cash / avg_net_burn_3m) AS INTEGER)) AS DATE)
    END AS zero_cash_month
FROM t;
