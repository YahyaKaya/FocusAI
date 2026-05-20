"""
Focus AI — Synthetic Session Data Generator
Run from ml-service/ directory: python generate_data.py
Requires: supabase-py, python-dotenv, requests
"""

import os
import uuid
import random
import math
import requests
from datetime import datetime, timedelta, date
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ---------------------------------------------------------------------------
# User config: id, archetype (derived from avg_score), start_date
# Archetypes: struggling(<35), developing(35-60), solid(60-75), optimized(>75)
# Names used to assign session_type preferences and time-of-day patterns
# ---------------------------------------------------------------------------
USERS = [
    # struggling (avg < 35)
    {"id": "e500d026-56a6-4bc7-a63a-b9df28c4399e", "label": "Social Butterfly 1", "archetype": "struggling",  "avg_score": 20.9, "start": "2025-12-17"},
    {"id": "00c77a3a-d6a3-4dbb-b991-e7460f031ef3", "label": "Easily Distracted 3","archetype": "struggling",  "avg_score": 24.3, "start": "2025-12-20"},
    {"id": "2d4fee90-d42b-46d8-93eb-5507df0d4748", "label": "Easily Distracted 2","archetype": "struggling",  "avg_score": 24.5, "start": "2025-12-15"},
    {"id": "61ab2ad4-6d76-4478-a289-5a92d705fbc3", "label": "Easily Distracted 1","archetype": "struggling",  "avg_score": 25.1, "start": "2025-12-06"},
    {"id": "47f669be-33b6-409e-914f-8d665feb4e37", "label": "Social Butterfly 2", "archetype": "struggling",  "avg_score": 26.5, "start": "2025-12-19"},
    # developing (35-60)
    {"id": "b4c6d51f-d134-4e90-a1fc-5f7ecb571899", "label": "Inconsistent 3",     "archetype": "developing",  "avg_score": 47.2, "start": "2025-12-16"},
    {"id": "410c0812-5d66-4b91-9552-c3860aadfdea", "label": "Inconsistent 1",     "archetype": "developing",  "avg_score": 49.6, "start": "2025-12-16"},
    {"id": "a5121183-b6d8-4c49-8d6a-d0da635779b3", "label": "Inconsistent 2",     "archetype": "developing",  "avg_score": 55.5, "start": "2025-12-08"},
    # solid (60-75)
    {"id": "7af2fd7a-23f2-427c-b401-ccd99dc1aafe", "label": "Night Owl 3",        "archetype": "solid",       "avg_score": 63.2, "start": "2025-12-19"},
    {"id": "97a0ad98-92b2-4633-b690-cd6ea5d619c1", "label": "User 97a0ad98",      "archetype": "solid",       "avg_score": 65.7, "start": "2026-01-01"},
    {"id": "2018e57c-a422-4f31-81e3-a2f79383ac94", "label": "Early Bird 2",       "archetype": "solid",       "avg_score": 66.4, "start": "2025-12-18"},
    {"id": "cd308c56-e6ad-447e-a9cc-94119fd2725c", "label": "Night Owl 1",        "archetype": "solid",       "avg_score": 67.8, "start": "2025-12-13"},
    {"id": "4e05a461-a273-4ae9-971c-e0687f371b59", "label": "Night Owl 2",        "archetype": "solid",       "avg_score": 68.8, "start": "2025-12-17"},
    {"id": "84cc47cc-9a43-4bea-99e6-6576e2120aa9", "label": "Early Bird 3",       "archetype": "solid",       "avg_score": 70.9, "start": "2025-12-04"},
    {"id": "31b988cf-5d0b-41f5-b8c2-5d8a939e3635", "label": "Highly Motivated 2", "archetype": "solid",      "avg_score": 74.5, "start": "2025-12-12"},
    # optimized (>75)
    {"id": "f999d24c-f4f9-46ca-bbfb-4bc37041cb17", "label": "Disciplined 2",      "archetype": "optimized",  "avg_score": 75.7, "start": "2025-12-27"},
    {"id": "9f407622-c01d-41e8-bccc-08c36d7fe7e1", "label": "Early Bird 1",       "archetype": "optimized",  "avg_score": 76.5, "start": "2025-12-21"},
    {"id": "dc5ee675-c294-48c4-8d3f-45a4f6fdc20c", "label": "Highly Motivated 3", "archetype": "optimized",  "avg_score": 76.7, "start": "2025-12-11"},
    {"id": "70561018-3604-40ec-9177-c5f5833134ca", "label": "Disciplined 1",      "archetype": "optimized",  "avg_score": 76.9, "start": "2025-12-04"},
    {"id": "253e99d8-b5c1-40fd-bb44-d1f387d81063", "label": "Highly Motivated 1", "archetype": "optimized",  "avg_score": 79.0, "start": "2025-12-11"},
    {"id": "af0f6f7f-c760-4cac-bc0a-40faffe62964", "label": "Disciplined 3",      "archetype": "optimized",  "avg_score": 81.7, "start": "2025-12-03"},
]

END_DATE = date(2026, 5, 19)

SESSION_TYPES = ["READING", "WRITING", "CODING", "TEST", "OTHER"]
ENVIRONMENTS  = ["QUIET", "MUSIC", "NOISY"]
MUSIC_TYPES   = ["AMBIENT", "LOFI", "CLASSICAL", "OTHER"]
DISTRACTION_LEVELS = ["NONE", "FEW", "MANY"]

# ---------------------------------------------------------------------------
# Archetype behaviour tables
# ---------------------------------------------------------------------------
ARCHETYPE_CONFIG = {
    "struggling": {
        "env_weights":         [0.15, 0.25, 0.60],   # QUIET / MUSIC / NOISY
        "distraction_weights": [0.10, 0.35, 0.55],   # NONE / FEW / MANY
        "mood_range":          (1, 3),
        "energy_range":        (1, 3),
        "motivation_range":    (1, 3),
        "planned_dur_range":   (25, 60),
        "completion_ratio":    (0.50, 0.85),          # actual / planned
        "pause_count_range":   (1, 5),
        "break_per_pause":     (3, 8),
        "session_type_weights": [0.30, 0.20, 0.15, 0.20, 0.15],
        "peak_hours":          list(range(10, 22)),   # spread, no strong preference
        "hour_weights":        None,                  # uniform across peak_hours
        "base_score_noise":    12,
    },
    "developing": {
        "env_weights":         [0.35, 0.40, 0.25],
        "distraction_weights": [0.25, 0.45, 0.30],
        "mood_range":          (2, 4),
        "energy_range":        (2, 4),
        "motivation_range":    (2, 4),
        "planned_dur_range":   (30, 75),
        "completion_ratio":    (0.70, 1.05),
        "pause_count_range":   (0, 3),
        "break_per_pause":     (2, 6),
        "session_type_weights": [0.25, 0.25, 0.20, 0.15, 0.15],
        "peak_hours":          list(range(9, 23)),
        "hour_weights":        None,
        "base_score_noise":    14,
    },
    "solid": {
        "env_weights":         [0.50, 0.35, 0.15],
        "distraction_weights": [0.40, 0.45, 0.15],
        "mood_range":          (2, 5),
        "energy_range":        (2, 5),
        "motivation_range":    (3, 5),
        "planned_dur_range":   (45, 90),
        "completion_ratio":    (0.80, 1.10),
        "pause_count_range":   (0, 2),
        "break_per_pause":     (2, 5),
        "session_type_weights": [0.20, 0.30, 0.25, 0.15, 0.10],
        "peak_hours":          list(range(8, 23)),
        "hour_weights":        None,
        "base_score_noise":    10,
    },
    "optimized": {
        "env_weights":         [0.70, 0.25, 0.05],
        "distraction_weights": [0.60, 0.35, 0.05],
        "mood_range":          (3, 5),
        "energy_range":        (3, 5),
        "motivation_range":    (3, 5),
        "planned_dur_range":   (60, 120),
        "completion_ratio":    (0.90, 1.10),
        "pause_count_range":   (0, 2),
        "break_per_pause":     (1, 4),
        "session_type_weights": [0.20, 0.30, 0.30, 0.10, 0.10],
        "peak_hours":          list(range(7, 22)),
        "hour_weights":        None,
        "base_score_noise":    7,
    },
}

# Label-specific overrides for time-of-day
LABEL_HOUR_OVERRIDES = {
    # Night Owls peak 20-23
    "Night Owl 1":  {"peak_hours": list(range(20, 24)), "hour_weights": None},
    "Night Owl 2":  {"peak_hours": list(range(20, 24)), "hour_weights": None},
    "Night Owl 3":  {"peak_hours": list(range(19, 24)), "hour_weights": None},
    # Early Birds peak 7-11
    "Early Bird 1": {"peak_hours": list(range(7, 12)),  "hour_weights": None},
    "Early Bird 2": {"peak_hours": list(range(6, 12)),  "hour_weights": None},
    "Early Bird 3": {"peak_hours": list(range(7, 12)),  "hour_weights": None},
    # Disciplined: consistent 8-20
    "Disciplined 1": {"peak_hours": list(range(8, 21)), "hour_weights": None},
    "Disciplined 2": {"peak_hours": list(range(8, 21)), "hour_weights": None},
    "Disciplined 3": {"peak_hours": list(range(8, 21)), "hour_weights": None},
}

# ---------------------------------------------------------------------------
# Productivity score formula (must match server-side)
# ---------------------------------------------------------------------------
def compute_score(productivity, focus, satisfaction, distraction):
    dist_map = {"NONE": 0.0, "FEW": 0.5, "MANY": 1.0}
    D = dist_map[distraction]
    P = (productivity - 1) / 4
    F = (focus - 1) / 4
    S = (satisfaction - 1) / 4
    raw = 100 * (0.4 * P + 0.3 * F + 0.2 * S + 0.1 * (1 - D))
    return round(raw, 1)

# ---------------------------------------------------------------------------
# Session date schedule: ~4-6 sessions/week, weekends lighter, random gaps
# ---------------------------------------------------------------------------
def build_session_dates(start: date, end: date, target: int = 150):
    dates = []
    current = start
    while current <= end:
        dow = current.weekday()  # 0=Mon, 6=Sun
        # Probability of a session on this day
        if dow == 6:    prob = 0.20   # Sunday very light
        elif dow == 5:  prob = 0.35   # Saturday light
        else:           prob = 0.70   # Weekday
        if random.random() < prob:
            dates.append(current)
        current += timedelta(days=1)
        # Occasional week-long break (~5% chance per week start)
        if dow == 0 and random.random() < 0.05:
            current += timedelta(days=7)
    # If we have too many, downsample; if too few, that's fine
    if len(dates) > target:
        dates = sorted(random.sample(dates, target))
    return dates

# ---------------------------------------------------------------------------
# Phase multiplier for gradual improvement arc
# phase 0 (weeks 1-3): 0.0, phase 1 (weeks 4-8): +7.5, phase 2 (weeks 9-14): +12, phase 3 (final 4 weeks): +15
# ---------------------------------------------------------------------------
def phase_bonus(session_date: date, start: date) -> float:
    weeks_elapsed = (session_date - start).days / 7
    if weeks_elapsed < 3:
        return 0.0
    elif weeks_elapsed < 8:
        return random.uniform(2, 10)
    elif weeks_elapsed < 14:
        return random.uniform(8, 15)
    else:
        # peak with occasional dip
        if random.random() < 0.15:
            return random.uniform(0, 8)   # dip
        return random.uniform(12, 18)

# ---------------------------------------------------------------------------
# Generate one session record + pre/post surveys
# ---------------------------------------------------------------------------
def generate_session(user: dict, session_date: date, start_date: date):
    cfg = ARCHETYPE_CONFIG[user["archetype"]].copy()
    label = user["label"]

    # Apply label-specific hour overrides
    if label in LABEL_HOUR_OVERRIDES:
        cfg.update(LABEL_HOUR_OVERRIDES[label])

    # Time of day
    hour = random.choice(cfg["peak_hours"])
    minute = random.randint(0, 59)
    start_dt = datetime(session_date.year, session_date.month, session_date.day, hour, minute, 0)

    # Durations
    planned = random.randint(*cfg["planned_dur_range"])
    ratio = random.uniform(*cfg["completion_ratio"])
    actual = max(5, int(planned * ratio))

    # Pauses & breaks
    pause_count = random.randint(*cfg["pause_count_range"])
    total_break = pause_count * random.randint(*cfg["break_per_pause"]) if pause_count > 0 else 0

    end_dt = start_dt + timedelta(minutes=actual + total_break)

    # Session type
    session_type = random.choices(SESSION_TYPES, weights=cfg["session_type_weights"])[0]

    # Environment
    environment = random.choices(ENVIRONMENTS, weights=cfg["env_weights"])[0]
    if environment == "MUSIC":
        music_type = random.choice(MUSIC_TYPES)
    else:
        music_type = None

    # Pre-survey
    mood       = random.randint(*cfg["mood_range"])
    energy     = random.randint(*cfg["energy_range"])
    motivation = random.randint(*cfg["motivation_range"])
    goal_diff  = random.randint(1, 5)

    # Distraction — influenced by environment
    if environment == "NOISY":
        dist_weights = [0.05, 0.35, 0.60]
    elif environment == "QUIET":
        dist_weights = [0.55, 0.38, 0.07]
    else:  # MUSIC
        dist_weights = [0.30, 0.50, 0.20]
    distraction = random.choices(DISTRACTION_LEVELS, weights=dist_weights)[0]

    # Post-survey scores — derived from pre-survey + environment + phase
    bonus = phase_bonus(session_date, start_date)
    base  = user["avg_score"] + bonus

    # Realistic correlations
    mood_factor       = (mood - 1) / 4          # 0..1
    energy_factor     = (energy - 1) / 4
    motivation_factor = (motivation - 1) / 4
    dist_penalty      = {"NONE": 0, "FEW": -8, "MANY": -18}[distraction]
    long_sess_penalty = max(0, (actual - 90) * 0.15)   # penalty for very long sessions
    plan_dev_penalty  = max(0, (1 - ratio) * 15)       # penalty for underdelivering

    score_estimate = (
        base
        + (mood_factor - 0.5) * 12
        + (energy_factor - 0.5) * 10
        + (motivation_factor - 0.5) * 8
        + dist_penalty
        - long_sess_penalty
        - plan_dev_penalty
        + random.uniform(-cfg["base_score_noise"], cfg["base_score_noise"])
    )
    score_estimate = max(5, min(98, score_estimate))

    # Back-derive post survey integers from score_estimate
    # productivity driven primarily by score
    productivity  = _score_to_likert(score_estimate, bias=0)
    focus         = _score_to_likert(score_estimate, bias=-5 if distraction == "MANY" else 5 if environment == "QUIET" else 0)
    # high goal_diff → high focus but lower satisfaction
    focus         = min(5, max(1, focus + (1 if goal_diff >= 4 else 0)))
    satisfaction_bias = -10 if goal_diff >= 4 else 5 if goal_diff <= 2 else 0
    satisfaction  = _score_to_likert(score_estimate, bias=satisfaction_bias)
    # Recompute actual score from derived integers (formula enforced)
    productivity_score = compute_score(productivity, focus, satisfaction, distraction)

    session_id   = str(uuid.uuid4())
    pre_id       = str(uuid.uuid4())
    post_id      = str(uuid.uuid4())
    now_ts       = datetime.utcnow().isoformat()

    session = {
        "id":                 session_id,
        "user_id":            user["id"],
        "status":             "COMPLETED",
        "session_type":       session_type,
        "start_time":         start_dt.isoformat(),
        "end_time":           end_dt.isoformat(),
        "planned_duration":   planned,
        "actual_duration":    actual,
        "pause_count":        pause_count,
        "total_break_mins":   total_break,
        "productivity_score": productivity_score,
        "created_at":         now_ts,
        "updated_at":         now_ts,
    }
    pre_survey = {
        "id":              pre_id,
        "session_id":      session_id,
        "mood":            mood,
        "energy":          energy,
        "motivation":      motivation,
        "goal_difficulty": goal_diff,
        "environment":     environment,
        "music_type":      music_type,
        "created_at":      now_ts,
    }
    post_survey = {
        "id":           post_id,
        "session_id":   session_id,
        "productivity": productivity,
        "focus":        focus,
        "satisfaction": satisfaction,
        "distraction":  distraction,
        "notes":        None,
        "created_at":   now_ts,
    }
    return session, pre_survey, post_survey


def _score_to_likert(score: float, bias: float = 0) -> int:
    """Map a 0-100 score to a 1-5 Likert value with optional bias."""
    adjusted = score + bias
    if adjusted < 20:   return 1
    elif adjusted < 40: return 2
    elif adjusted < 60: return 3
    elif adjusted < 78: return 4
    else:               return 5

# ---------------------------------------------------------------------------
# Batch insert helpers
# ---------------------------------------------------------------------------
def insert_batch(sessions, pre_surveys, post_surveys):
    supabase.table("sessions").insert(sessions).execute()
    supabase.table("pre_surveys").insert(pre_surveys).execute()
    supabase.table("post_surveys").insert(post_surveys).execute()

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    all_sessions_data = []   # (session, pre, post)
    per_user_count = {}

    for user in USERS:
        start = datetime.strptime(user["start"], "%Y-%m-%d").date()
        dates = build_session_dates(start, END_DATE, target=150)
        per_user_count[user["label"]] = len(dates)

        for d in dates:
            row = generate_session(user, d, start)
            all_sessions_data.append(row)

    total = len(all_sessions_data)
    print(f"\n{'='*60}")
    print(f"Total sessions to insert: {total}")
    for label, count in per_user_count.items():
        print(f"  {label}: {count}")
    print(f"{'='*60}\n")

    # Shuffle to mix users in batches (avoids large single-user blocks)
    random.shuffle(all_sessions_data)

    BATCH_SIZE = 100
    inserted = 0
    batch_s, batch_pre, batch_post = [], [], []

    for i, (sess, pre, post) in enumerate(all_sessions_data):
        batch_s.append(sess)
        batch_pre.append(pre)
        batch_post.append(post)

        if len(batch_s) == BATCH_SIZE:
            insert_batch(batch_s, batch_pre, batch_post)
            inserted += len(batch_s)
            batch_s, batch_pre, batch_post = [], [], []
            if inserted % 200 == 0:
                print(f"  Inserted {inserted}/{total} sessions...")

    # Remaining
    if batch_s:
        insert_batch(batch_s, batch_pre, batch_post)
        inserted += len(batch_s)

    print(f"\nDone. Total inserted: {inserted}")

    # Score distribution summary
    scores = [compute_score(p["productivity"], p["focus"], p["satisfaction"], p["distraction"])
              for _, _, p in all_sessions_data]
    buckets = {"0-25": 0, "25-50": 0, "50-75": 0, "75-100": 0}
    for s in scores:
        if s < 25:   buckets["0-25"] += 1
        elif s < 50: buckets["25-50"] += 1
        elif s < 75: buckets["50-75"] += 1
        else:        buckets["75-100"] += 1
    print("\nScore distribution:")
    for bucket, count in buckets.items():
        pct = count / len(scores) * 100
        print(f"  {bucket}: {count} ({pct:.1f}%)")

    # Trigger retrain
    print("\nTriggering ML retrain...")
    try:
        resp = requests.post("http://localhost:8000/retrain", timeout=120)
        print(f"Retrain response [{resp.status_code}]: {resp.text[:500]}")
    except Exception as e:
        print(f"Retrain request failed: {e}")


if __name__ == "__main__":
    main()