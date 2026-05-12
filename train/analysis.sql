-- ============================================================
-- Focus AI — Within-Subject Productivity Impact Analysis
-- PostgreSQL | Academic Thesis
-- Schema source: backend/prisma/schema.prisma + train/schema.sql
--
-- Primary metric : sessions.productivity_score (Float, 0–100)
-- Secondary metric: post_surveys.productivity  (Int,   1–5)
-- Split strategy : Approach A = midpoint half-split (simulated)
--                 Approach B = first recommendation date (real data)
-- ============================================================


-- ============================================================
-- APPROACH A — SIMULATED SPLIT (first 3 vs last 3 sessions)
-- Use this when you want a clean within-subject baseline
-- even before any recommendations were actually generated.
-- ============================================================

-- ============================================================
-- STEP 1 — Foundation: rank all eligible sessions per user
-- Eligibility: COMPLETED status, non-null productivity_score,
--              at least 6 sessions per user
-- ============================================================

WITH session_ranked AS (
    SELECT
        s.id                  AS session_id,
        s.user_id,
        s.start_time,
        s.productivity_score,
        s.actual_duration,
        s.total_break_mins,
        s.session_type,

        -- Chronological rank within each user (1 = earliest)
        ROW_NUMBER() OVER (
            PARTITION BY s.user_id
            ORDER BY s.start_time ASC
        )                     AS rn,

        -- Total completed sessions per user
        COUNT(*) OVER (
            PARTITION BY s.user_id
        )                     AS total_sessions

    FROM sessions s
    WHERE s.status            = 'COMPLETED'
      AND s.productivity_score IS NOT NULL
),

-- ============================================================
-- STEP 2 — Keep only users with >= 6 eligible sessions
-- ============================================================

eligible_users AS (
    SELECT DISTINCT user_id
    FROM session_ranked
    WHERE total_sessions >= 6
),

-- ============================================================
-- STEP 3 — Label each session as 'before', 'after', or 'middle'
-- Strategy: first 3 sessions = before, last 3 sessions = after
-- Sessions in between are labeled 'middle' and excluded.
-- ============================================================

session_labeled AS (
    SELECT
        sr.session_id,
        sr.user_id,
        sr.start_time,
        sr.productivity_score,
        sr.actual_duration,
        sr.total_break_mins,
        sr.session_type,
        sr.rn,
        sr.total_sessions,

        CASE
            WHEN sr.rn <= 3
                THEN 'before'
            WHEN sr.rn > (sr.total_sessions - 3)
                THEN 'after'
            ELSE 'middle'
        END AS phase

    FROM session_ranked sr
    INNER JOIN eligible_users eu ON sr.user_id = eu.user_id
),

-- ============================================================
-- QUERY 1 — Per-user: before_avg, after_avg, difference
-- ============================================================

user_phase_avg AS (
    SELECT
        user_id,
        phase,
        ROUND(AVG(productivity_score)::NUMERIC, 2) AS avg_score
    FROM session_labeled
    WHERE phase IN ('before', 'after')
    GROUP BY user_id, phase
),

user_comparison AS (
    SELECT
        b.user_id,
        b.avg_score                                         AS before_avg,
        a.avg_score                                         AS after_avg,
        ROUND((a.avg_score - b.avg_score)::NUMERIC, 2)     AS difference
    FROM user_phase_avg b
    JOIN user_phase_avg a
        ON b.user_id = a.user_id
       AND a.phase   = 'after'
    WHERE b.phase = 'before'
)

-- ─── OUTPUT 1: Per-user table ────────────────────────────────
SELECT
    uc.user_id,
    u.name                              AS user_name,
    uc.before_avg,
    uc.after_avg,
    uc.difference,
    CASE
        WHEN uc.difference > 0  THEN 'Improved'
        WHEN uc.difference < 0  THEN 'Declined'
        ELSE                         'No Change'
    END                                 AS trend
FROM user_comparison uc
LEFT JOIN users u ON u.id = uc.user_id
ORDER BY uc.difference DESC;


-- ============================================================
-- QUERY 2 — Global aggregate metrics
-- ============================================================

WITH session_ranked AS (
    SELECT
        s.user_id,
        s.productivity_score,
        ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.start_time ASC) AS rn,
        COUNT(*)     OVER (PARTITION BY s.user_id)                            AS total_sessions
    FROM sessions s
    WHERE s.status = 'COMPLETED' AND s.productivity_score IS NOT NULL
),
eligible_users AS (
    SELECT DISTINCT user_id FROM session_ranked WHERE total_sessions >= 6
),
session_labeled AS (
    SELECT
        sr.user_id,
        sr.productivity_score,
        CASE
            WHEN sr.rn <= 3                          THEN 'before'
            WHEN sr.rn > (sr.total_sessions - 3)     THEN 'after'
            ELSE 'middle'
        END AS phase
    FROM session_ranked sr
    INNER JOIN eligible_users eu ON sr.user_id = eu.user_id
),
user_phase_avg AS (
    SELECT
        user_id,
        phase,
        AVG(productivity_score) AS avg_score
    FROM session_labeled
    WHERE phase IN ('before', 'after')
    GROUP BY user_id, phase
),
user_comparison AS (
    SELECT
        b.user_id,
        b.avg_score AS before_avg,
        a.avg_score AS after_avg,
        (a.avg_score - b.avg_score) AS difference
    FROM user_phase_avg b
    JOIN user_phase_avg a ON b.user_id = a.user_id AND a.phase = 'after'
    WHERE b.phase = 'before'
)

-- ─── OUTPUT 2: Global metrics ─────────────────────────────────
SELECT
    COUNT(*)                                                    AS total_users_analyzed,
    ROUND(AVG(before_avg)::NUMERIC, 2)                          AS global_before_avg,
    ROUND(AVG(after_avg)::NUMERIC,  2)                          AS global_after_avg,
    ROUND(AVG(difference)::NUMERIC, 2)                          AS avg_improvement_delta,
    ROUND(MIN(difference)::NUMERIC, 2)                          AS min_difference,
    ROUND(MAX(difference)::NUMERIC, 2)                          AS max_difference,
    ROUND(STDDEV(difference)::NUMERIC, 2)                       AS stddev_difference
FROM user_comparison;


-- ============================================================
-- QUERY 3 — Improvement distribution percentages
-- ============================================================

WITH session_ranked AS (
    SELECT
        s.user_id,
        s.productivity_score,
        ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.start_time ASC) AS rn,
        COUNT(*)     OVER (PARTITION BY s.user_id)                            AS total_sessions
    FROM sessions s
    WHERE s.status = 'COMPLETED' AND s.productivity_score IS NOT NULL
),
eligible_users AS (
    SELECT DISTINCT user_id FROM session_ranked WHERE total_sessions >= 6
),
session_labeled AS (
    SELECT
        sr.user_id,
        sr.productivity_score,
        CASE
            WHEN sr.rn <= 3                          THEN 'before'
            WHEN sr.rn > (sr.total_sessions - 3)     THEN 'after'
            ELSE 'middle'
        END AS phase
    FROM session_ranked sr
    INNER JOIN eligible_users eu ON sr.user_id = eu.user_id
),
user_phase_avg AS (
    SELECT
        user_id,
        phase,
        AVG(productivity_score) AS avg_score
    FROM session_labeled
    WHERE phase IN ('before', 'after')
    GROUP BY user_id, phase
),
user_comparison AS (
    SELECT
        b.user_id,
        (a.avg_score - b.avg_score) AS difference
    FROM user_phase_avg b
    JOIN user_phase_avg a ON b.user_id = a.user_id AND a.phase = 'after'
    WHERE b.phase = 'before'
),
counts AS (
    SELECT
        COUNT(*)                                                  AS total,
        COUNT(*) FILTER (WHERE difference > 0)                    AS improved_any,
        COUNT(*) FILTER (WHERE difference > 5)                    AS improved_5plus,
        COUNT(*) FILTER (WHERE difference <= 0)                   AS no_improvement_or_decline,
        COUNT(*) FILTER (WHERE difference < 0)                    AS declined
    FROM user_comparison
)

-- ─── OUTPUT 3: Improvement percentage breakdown ───────────────
SELECT
    total                                                           AS users_total,
    improved_any                                                    AS improved_count,
    ROUND(100.0 * improved_any            / total, 1)              AS pct_improved_any,
    improved_5plus                                                  AS improved_5plus_count,
    ROUND(100.0 * improved_5plus          / total, 1)              AS pct_improved_5plus,
    no_improvement_or_decline                                       AS no_improvement_count,
    ROUND(100.0 * no_improvement_or_decline / total, 1)            AS pct_no_improvement,
    declined                                                        AS declined_count,
    ROUND(100.0 * declined                / total, 1)              AS pct_declined
FROM counts;


-- ============================================================
-- QUERY 4 — Recommendation type effectiveness
-- (Which recommendation types correlate with higher productivity?)
-- ============================================================

SELECT
    r.type                                          AS recommendation_type,
    r.interaction,
    COUNT(DISTINCT r.user_id)                       AS users_reached,
    COUNT(r.id)                                     AS recommendation_count,
    ROUND(AVG(s.productivity_score)::NUMERIC, 2)    AS avg_session_productivity,
    ROUND(MIN(s.productivity_score)::NUMERIC, 2)    AS min_productivity,
    ROUND(MAX(s.productivity_score)::NUMERIC, 2)    AS max_productivity
FROM recommendations r
INNER JOIN sessions s
    ON  s.id     = r.session_id
   AND  s.status = 'COMPLETED'
   AND  s.productivity_score IS NOT NULL
GROUP BY r.type, r.interaction
ORDER BY r.type, avg_session_productivity DESC;


-- ============================================================
-- QUERY 5a — Time-of-day grouping
-- morning   : 06:00–11:59
-- afternoon : 12:00–16:59
-- evening   : 17:00–21:59
-- night     : 22:00–05:59
-- ============================================================

SELECT
    CASE
        WHEN EXTRACT(HOUR FROM s.start_time) BETWEEN 6  AND 11 THEN 'morning'
        WHEN EXTRACT(HOUR FROM s.start_time) BETWEEN 12 AND 16 THEN 'afternoon'
        WHEN EXTRACT(HOUR FROM s.start_time) BETWEEN 17 AND 21 THEN 'evening'
        ELSE 'night'
    END                                             AS time_of_day,

    COUNT(*)                                        AS session_count,
    ROUND(AVG(s.productivity_score)::NUMERIC, 2)    AS avg_productivity,
    ROUND(AVG(ps.productivity)::NUMERIC, 2)         AS avg_self_reported_productivity,  -- post_survey 1–5
    ROUND(AVG(ps.focus)::NUMERIC, 2)                AS avg_focus,
    ROUND(AVG(ps.satisfaction)::NUMERIC, 2)         AS avg_satisfaction

FROM sessions s
LEFT JOIN post_surveys ps ON ps.session_id = s.id
WHERE s.status            = 'COMPLETED'
  AND s.productivity_score IS NOT NULL
GROUP BY time_of_day
ORDER BY avg_productivity DESC;


-- ============================================================
-- QUERY 5b — Duration bucket grouping
-- short  : < 30 minutes
-- medium : 30–60 minutes
-- long   : > 60 minutes
-- ============================================================

SELECT
    CASE
        WHEN s.actual_duration < 30                     THEN 'short  (<30 min)'
        WHEN s.actual_duration BETWEEN 30 AND 60        THEN 'medium (30–60 min)'
        WHEN s.actual_duration > 60                     THEN 'long   (>60 min)'
        ELSE 'unknown'
    END                                                 AS duration_bucket,

    COUNT(*)                                            AS session_count,
    ROUND(AVG(s.productivity_score)::NUMERIC, 2)        AS avg_productivity,
    ROUND(AVG(s.actual_duration)::NUMERIC, 1)           AS avg_actual_duration_mins,
    ROUND(AVG(ps.focus)::NUMERIC, 2)                    AS avg_focus,
    ROUND(AVG(ps.satisfaction)::NUMERIC, 2)             AS avg_satisfaction

FROM sessions s
LEFT JOIN post_surveys ps ON ps.session_id = s.id
WHERE s.status            = 'COMPLETED'
  AND s.productivity_score IS NOT NULL
  AND s.actual_duration   IS NOT NULL
GROUP BY duration_bucket
ORDER BY avg_productivity DESC;


-- ============================================================
-- QUERY 5c — Break usage grouping
-- low  : total_break_mins <= 5
-- high : total_break_mins > 5
-- (Also shows pause_count for context)
-- ============================================================

SELECT
    CASE
        WHEN s.total_break_mins <= 5  THEN 'low break  (≤5 min)'
        ELSE                               'high break (>5 min)'
    END                                                 AS break_usage,

    COUNT(*)                                            AS session_count,
    ROUND(AVG(s.productivity_score)::NUMERIC, 2)        AS avg_productivity,
    ROUND(AVG(s.total_break_mins)::NUMERIC, 1)          AS avg_break_mins,
    ROUND(AVG(s.pause_count)::NUMERIC, 1)               AS avg_pause_count,
    ROUND(AVG(ps.focus)::NUMERIC, 2)                    AS avg_focus

FROM sessions s
LEFT JOIN post_surveys ps ON ps.session_id = s.id
WHERE s.status            = 'COMPLETED'
  AND s.productivity_score IS NOT NULL
GROUP BY break_usage
ORDER BY avg_productivity DESC;


-- ============================================================
-- QUERY 5d — Cross-tab: time_of_day × duration_bucket
-- (Combined effectiveness view)
-- ============================================================

SELECT
    CASE
        WHEN EXTRACT(HOUR FROM s.start_time) BETWEEN 6  AND 11 THEN 'morning'
        WHEN EXTRACT(HOUR FROM s.start_time) BETWEEN 12 AND 16 THEN 'afternoon'
        WHEN EXTRACT(HOUR FROM s.start_time) BETWEEN 17 AND 21 THEN 'evening'
        ELSE 'night'
    END                                                 AS time_of_day,

    CASE
        WHEN s.actual_duration < 30                     THEN 'short'
        WHEN s.actual_duration BETWEEN 30 AND 60        THEN 'medium'
        WHEN s.actual_duration > 60                     THEN 'long'
        ELSE 'unknown'
    END                                                 AS duration_bucket,

    COUNT(*)                                            AS session_count,
    ROUND(AVG(s.productivity_score)::NUMERIC, 2)        AS avg_productivity

FROM sessions s
WHERE s.status            = 'COMPLETED'
  AND s.productivity_score IS NOT NULL
  AND s.actual_duration   IS NOT NULL
GROUP BY time_of_day, duration_bucket
HAVING COUNT(*) >= 3          -- exclude cells with too few data points
ORDER BY avg_productivity DESC;


-- ============================================================
-- APPROACH B — REAL RECOMMENDATION SPLIT
-- Uses the actual first recommendation per user as the
-- before/after boundary (more scientifically rigorous
-- when recommendations were actually deployed).
-- ============================================================

WITH first_rec_per_user AS (
    -- The exact timestamp when each user first received a recommendation
    SELECT
        user_id,
        MIN(created_at) AS first_rec_at
    FROM recommendations
    GROUP BY user_id
),
session_with_phase AS (
    SELECT
        s.id              AS session_id,
        s.user_id,
        s.start_time,
        s.productivity_score,
        s.actual_duration,
        s.total_break_mins,

        CASE
            WHEN s.start_time < fr.first_rec_at THEN 'before'
            ELSE 'after'
        END AS phase,

        -- Rank within each user-phase for selecting the 3 closest sessions
        ROW_NUMBER() OVER (
            PARTITION BY s.user_id,
                CASE WHEN s.start_time < fr.first_rec_at THEN 'before' ELSE 'after' END
            ORDER BY
                CASE WHEN s.start_time < fr.first_rec_at THEN s.start_time END DESC,  -- 3 most recent before
                CASE WHEN s.start_time >= fr.first_rec_at THEN s.start_time END ASC   -- 3 earliest after
        ) AS phase_rn

    FROM sessions s
    INNER JOIN first_rec_per_user fr ON fr.user_id = s.user_id
    WHERE s.status            = 'COMPLETED'
      AND s.productivity_score IS NOT NULL
),
-- Take only 3 sessions per phase per user
filtered_sessions AS (
    SELECT *
    FROM session_with_phase
    WHERE phase_rn <= 3
),
-- Require both phases to have exactly 3 sessions
user_phase_counts AS (
    SELECT user_id
    FROM filtered_sessions
    GROUP BY user_id, phase
    HAVING COUNT(*) = 3
    -- intersect to get users with both phases satisfied
),
eligible AS (
    SELECT user_id
    FROM user_phase_counts
    GROUP BY user_id
    HAVING COUNT(*) = 2     -- has both 'before' and 'after' phases
),
user_phase_avg AS (
    SELECT
        fs.user_id,
        fs.phase,
        ROUND(AVG(fs.productivity_score)::NUMERIC, 2) AS avg_score
    FROM filtered_sessions fs
    INNER JOIN eligible e ON e.user_id = fs.user_id
    GROUP BY fs.user_id, fs.phase
)

-- ─── OUTPUT B: Per-user table (recommendation-date split) ────
SELECT
    b.user_id,
    u.name                                              AS user_name,
    b.avg_score                                         AS before_avg,
    a.avg_score                                         AS after_avg,
    ROUND((a.avg_score - b.avg_score)::NUMERIC, 2)     AS difference,
    CASE
        WHEN (a.avg_score - b.avg_score) > 0  THEN 'Improved'
        WHEN (a.avg_score - b.avg_score) < 0  THEN 'Declined'
        ELSE 'No Change'
    END                                                 AS trend
FROM user_phase_avg b
JOIN user_phase_avg a  ON b.user_id = a.user_id AND a.phase = 'after'
LEFT JOIN users u      ON u.id = b.user_id
WHERE b.phase = 'before'
ORDER BY difference DESC;
