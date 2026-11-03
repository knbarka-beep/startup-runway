-- Where the money goes each month, in long format:
--   driver_type 'team'     = payroll by team (from headcount)
--   driver_type 'category' = opex by category (from opex)
-- Gross spend, before collections. Net burn = total of these - collections.
CREATE OR REPLACE VIEW burn_drivers AS
SELECT c.month, 'team' AS driver_type, h.team AS driver, SUM(h.monthly_cost) AS amount
FROM cash AS c
JOIN headcount AS h
  ON h.start_month <= c.month AND (h.end_month IS NULL OR c.month < h.end_month)
GROUP BY c.month, h.team
UNION ALL
SELECT month, 'category' AS driver_type, category AS driver, amount
FROM opex;
