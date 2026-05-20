import os
import pandas as pd
import numpy as np
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_supabase: Client | None = None

def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_KEY"]
        _supabase = create_client(url, key)
    return _supabase


def _unpack(row: dict, key: str) -> dict:
    """Supabase nested selects return lists; grab first element safely."""
    val = row.get(key) or []
    if isinstance(val, list):
        return val[0] if val else {}
    if isinstance(val, dict):
        return val
    return {}


def fetch_user_sessions(user_id: str, min_sessions: int = 5) -> pd.DataFrame | None:
    sb = get_supabase()

    result = (
        sb.table("sessions")
        .select(
            "id, user_id, session_type, start_time, actual_duration, "
            "planned_duration, pause_count, total_break_mins, productivity_score, "
            "pre_surveys(mood, energy, motivation, goal_difficulty, environment, music_type), "
            "post_surveys(productivity, focus, satisfaction, distraction)"
        )
        .eq("user_id", user_id)
        .eq("status", "COMPLETED")
        .not_.is_("productivity_score", "null")
        .order("start_time", desc=False)
        .execute()
    )

    rows = result.data
    if not rows:
        return None

    records = []
    for r in rows:
        pre  = _unpack(r, "pre_surveys")
        post = _unpack(r, "post_surveys")

        if not pre or not post:
            continue
        if pre.get("mood") is None or post.get("productivity") is None:
            continue
        # Skip zero/null duration sessions — they corrupt training
        if not r.get("actual_duration") or r["actual_duration"] < 5:
            continue

        records.append({
            "session_id":       r["id"],
            "user_id":          r["user_id"],
            "session_type":     r["session_type"],
            "start_time":       r["start_time"],
            "actual_duration":  r["actual_duration"],
            "planned_duration": r["planned_duration"],
            "pause_count":      r["pause_count"],
            "total_break_mins": r["total_break_mins"],
            "productivity_score": float(r["productivity_score"]),
            "mood":             pre.get("mood"),
            "energy":           pre.get("energy"),
            "motivation":       pre.get("motivation"),
            "goal_difficulty":  pre.get("goal_difficulty"),
            "environment":      pre.get("environment"),
            "music_type":       pre.get("music_type"),
            "post_productivity": post.get("productivity"),
            "post_focus":        post.get("focus"),
            "post_satisfaction": post.get("satisfaction"),
            "post_distraction":  post.get("distraction"),
        })

    if len(records) < min_sessions:
        return None

    return pd.DataFrame(records)


def fetch_all_sessions() -> pd.DataFrame:
    sb = get_supabase()
    all_records = []
    page_size = 1000
    offset = 0

    while True:
        result = (
            sb.table("sessions")
            .select(
                "id, user_id, session_type, start_time, actual_duration, "
                "planned_duration, pause_count, total_break_mins, productivity_score, "
                "pre_surveys(mood, energy, motivation, goal_difficulty, environment, music_type), "
                "post_surveys(productivity, focus, satisfaction, distraction)"
            )
            .eq("status", "COMPLETED")
            .not_.is_("productivity_score", "null")
            .order("start_time", desc=False)
            .range(offset, offset + page_size - 1)
            .execute()
        )

        rows = result.data
        if not rows:
            break

        for r in rows:
            pre  = _unpack(r, "pre_surveys")
            post = _unpack(r, "post_surveys")

            if not pre or not post:
                continue
            if pre.get("mood") is None or post.get("productivity") is None:
                continue
            # Skip zero/null duration sessions
            if not r.get("actual_duration") or r["actual_duration"] < 5:
                continue

            all_records.append({
                "session_id":       r["id"],
                "user_id":          r["user_id"],
                "session_type":     r["session_type"],
                "start_time":       r["start_time"],
                "actual_duration":  r["actual_duration"],
                "planned_duration": r["planned_duration"],
                "pause_count":      r["pause_count"],
                "total_break_mins": r["total_break_mins"],
                "productivity_score": float(r["productivity_score"]),
                "mood":             pre.get("mood"),
                "energy":           pre.get("energy"),
                "motivation":       pre.get("motivation"),
                "goal_difficulty":  pre.get("goal_difficulty"),
                "environment":      pre.get("environment"),
                "music_type":       pre.get("music_type"),
                "post_productivity": post.get("productivity"),
                "post_focus":        post.get("focus"),
                "post_satisfaction": post.get("satisfaction"),
                "post_distraction":  post.get("distraction"),
            })

        if len(rows) < page_size:
            break
        offset += page_size

    return pd.DataFrame(all_records)


# ── Enums ────────────────────────────────────────────────────────────────────

SESSION_TYPES      = ["READING", "WRITING", "CODING", "TEST", "OTHER"]
ENVIRONMENTS       = ["QUIET", "MUSIC", "NOISY"]
MUSIC_TYPES        = ["AMBIENT", "LOFI", "CLASSICAL", "OTHER"]
DISTRACTION_LEVELS = ["NONE", "FEW", "MANY"]
DISTRACTION_MAP    = {"NONE": 0, "FEW": 1, "MANY": 2}


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Time
    df["start_time"]  = pd.to_datetime(df["start_time"], format='mixed')
    df["hour_of_day"] = df["start_time"].dt.hour
    df["day_of_week"] = df["start_time"].dt.dayofweek

    df["daypart"] = pd.cut(
        df["hour_of_day"],
        bins=[-1, 6, 12, 17, 21, 24],
        labels=["night", "morning", "afternoon", "evening", "late_night"]
    ).astype(str)

    # Duration
    df["actual_duration"]  = pd.to_numeric(df["actual_duration"],  errors="coerce").fillna(0)
    df["planned_duration"] = pd.to_numeric(df["planned_duration"], errors="coerce").fillna(df["actual_duration"])

    df["duration_bracket"] = pd.cut(
        df["actual_duration"],
        bins=[-1, 25, 50, 90, 120, 9999],
        labels=["very_short", "short", "medium", "long", "very_long"]
    ).astype(str)

    df["plan_deviation"] = np.where(
        df["planned_duration"] > 0,
        df["actual_duration"] / df["planned_duration"],
        1.0
    ).clip(0, 2)

    df["total_break_mins"] = pd.to_numeric(df["total_break_mins"], errors="coerce").fillna(0)
    df["break_ratio"] = np.where(
        df["actual_duration"] > 0,
        df["total_break_mins"] / df["actual_duration"],
        0.0
    ).clip(0, 1)

    df["pause_count"] = pd.to_numeric(df["pause_count"], errors="coerce").fillna(0)

    # Normalize ordinal 1-5 → 0-1
    for col in ["mood", "energy", "motivation", "goal_difficulty"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(3)
        df[f"{col}_norm"] = (df[col] - 1) / 4

    # One-hot categoricals
    for val in SESSION_TYPES:
        df[f"type_{val.lower()}"] = (df["session_type"] == val).astype(int)

    for val in ENVIRONMENTS:
        df[f"env_{val.lower()}"] = (df["environment"] == val).astype(int)

    for val in MUSIC_TYPES:
        df[f"music_{val.lower()}"] = (df["music_type"] == val).astype(int)

    for val in ["morning", "afternoon", "evening", "night", "late_night"]:
        df[f"daypart_{val}"] = (df["daypart"] == val).astype(int)

    df["distraction_score"] = df["post_distraction"].map(DISTRACTION_MAP).fillna(1)

    return df


FEATURE_COLS = [
    "mood_norm", "energy_norm", "motivation_norm", "goal_difficulty_norm",
    "actual_duration", "plan_deviation", "break_ratio", "pause_count",
    "hour_of_day", "day_of_week",
    "type_reading", "type_writing", "type_coding", "type_test", "type_other",
    "env_quiet", "env_music", "env_noisy",
    "music_ambient", "music_lofi", "music_classical", "music_other",
    "daypart_morning", "daypart_afternoon", "daypart_evening", "daypart_night", "daypart_late_night",
]

TARGET_COL = "productivity_score"