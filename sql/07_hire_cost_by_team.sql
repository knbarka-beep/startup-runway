-- Average loaded monthly cost per person by team, for people employed in the
-- latest month, plus the assumed hiring mix used by the scenario sliders.
-- The mix (40/35/15/10) is an own assumption, see docs/assumptions.md.
CREATE OR REPLACE VIEW hire_cost_by_team AS
WITH last_month AS (
    SELECT MAX(month) AS month FROM cash
),
mix(team, hiring_share) AS (
    VALUES ('engineering', 0.40), ('sales', 0.35), ('customer success', 0.15), ('G&A', 0.10)
)
SELECT
    h.team,
    COUNT(*)            AS people,
    AVG(h.monthly_cost) AS avg_loaded_cost,
    mix.hiring_share
FROM headcount AS h
CROSS JOIN last_month AS l
JOIN mix USING (team)
WHERE h.start_month <= l.month AND (h.end_month IS NULL OR l.month < h.end_month)
GROUP BY h.team, mix.hiring_share;
