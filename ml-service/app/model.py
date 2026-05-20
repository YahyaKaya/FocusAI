"""
model.py — XGBoost training + heuristic recommendation engine
"""
import logging
import pickle
from pathlib import Path
from itertools import product as iterproduct

import numpy as np
import pandas as pd
from xgboost import XGBRegressor
from sklearn.model_selection import cross_val_score
from sklearn.metrics import mean_absolute_error

from app.data import (
    engineer_features, fetch_all_sessions,
    FEATURE_COLS, TARGET_COL,
    SESSION_TYPES, ENVIRONMENTS, MUSIC_TYPES,
)

logger = logging.getLogger(__name__)

MODEL_PATH = Path("model.pkl")

# ── Global model (trained on all users) ─────────────────────────────────────

_global_model: XGBRegressor | None = None


def get_global_model() -> XGBRegressor | None:
    global _global_model
    return _global_model


def train_global_model() -> XGBRegressor:
    """Train XGBoost on all sessions in DB. Called at startup and on /retrain."""
    global _global_model
    logger.info("Fetching all sessions for global model training...")
    df = fetch_all_sessions()

    if df.empty or len(df) < 50:
        logger.warning("Not enough data for global model (%d rows). Skipping.", len(df))
        return None

    df = engineer_features(df)

    # Ensure all feature columns exist
    for col in FEATURE_COLS:
        if col not in df.columns:
            df[col] = 0

    X = df[FEATURE_COLS].fillna(0)
    y = df[TARGET_COL]

    model = XGBRegressor(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X, y)

    # Quick CV score for logging
    try:
        cv_mae = -cross_val_score(
            XGBRegressor(n_estimators=200, max_depth=4, learning_rate=0.05,
                         random_state=42, n_jobs=-1),
            X, y, cv=5, scoring="neg_mean_absolute_error"
        ).mean()
        logger.info("Global model CV MAE: %.2f | trained on %d rows", cv_mae, len(df))
    except Exception:
        pass

    _global_model = model

    # Persist to disk
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)

    return model


def load_model_from_disk():
    """Load persisted model on startup if available."""
    global _global_model
    if MODEL_PATH.exists():
        with open(MODEL_PATH, "rb") as f:
            _global_model = pickle.load(f)
        logger.info("Loaded model from disk.")


# ── Candidate condition generation ──────────────────────────────────────────

DURATION_OPTIONS     = [25, 45, 60, 90, 120]  # minutes
ENVIRONMENT_OPTIONS  = ["QUIET", "MUSIC", "NOISY"]
MUSIC_OPTIONS        = ["AMBIENT", "LOFI", "CLASSICAL", "OTHER"]
SESSION_TYPE_OPTIONS = ["READING", "WRITING", "CODING", "TEST", "OTHER"]


def _build_candidate_df(
    user_df: pd.DataFrame,
    hour_of_day: int,
    day_of_week: int,
) -> pd.DataFrame:
    """
    Generate all plausible candidate sessions as rows for model scoring.
    We fix the time context and vary: duration, environment, music, session_type.
    We use the user's median pre-survey values as the assumed input state.
    """
    median_mood       = user_df["mood"].median()
    median_energy     = user_df["energy"].median()
    median_motivation = user_df["motivation"].median()
    median_difficulty = user_df["goal_difficulty"].median()

    candidates = []
    for dur, env, music, stype in iterproduct(
        DURATION_OPTIONS, ENVIRONMENT_OPTIONS, MUSIC_OPTIONS, SESSION_TYPE_OPTIONS
    ):
        candidates.append({
            "session_type":      stype,
            "start_time":        pd.Timestamp.now().replace(hour=hour_of_day, minute=0, second=0),
            "actual_duration":   dur,
            "planned_duration":  dur,
            "pause_count":       1,
            "total_break_mins":  int(dur * 0.15),
            "productivity_score": 0,  # placeholder
            "mood":              median_mood,
            "energy":            median_energy,
            "motivation":        median_motivation,
            "goal_difficulty":   median_difficulty,
            "environment":       env,
            "music_type":        music,
            "post_productivity": 3,
            "post_focus":        3,
            "post_satisfaction": 3,
            "post_distraction":  "low",
        })

    return pd.DataFrame(candidates)


def _heuristic_recommendation(user_df: pd.DataFrame) -> dict:
    """
    Pure statistics-based fallback — no model needed.
    Finds: best daypart, best duration bracket, best environment, best session_type.
    """
    df = engineer_features(user_df)

    def best_group(col: str) -> str:
        grouped = df.groupby(col)["productivity_score"].mean()
        return grouped.idxmax() if not grouped.empty else "unknown"

    best_daypart  = best_group("daypart")
    best_duration = best_group("duration_bracket")
    best_env      = best_group("environment") if df["environment"].notna().any() else "home"
    best_music    = best_group("music_type") if df["music_type"].notna().any() else "none"
    best_type     = best_group("session_type")

    # Map duration bracket to concrete minute suggestion
    duration_map = {
        "very_short": 20, "short": 40, "medium": 60,
        "long": 90, "very_long": 120, "nan": 60,
    }
    suggested_duration = duration_map.get(str(best_duration), 60)

    # Compute score lift
    overall_mean = df["productivity_score"].mean()
    daypart_mean = df[df["daypart"] == best_daypart]["productivity_score"].mean()
    lift = round(daypart_mean - overall_mean, 1)
    lift_pct = round((lift / overall_mean) * 100, 1) if overall_mean > 0 else 0

    # Daypart → human-readable time window
    daypart_windows = {
        "morning":    "08:00–12:00",
        "afternoon":  "12:00–17:00",
        "evening":    "17:00–21:00",
        "night":      "21:00–00:00",
        "late_night": "00:00–06:00",
    }
    time_window = daypart_windows.get(best_daypart, "flexible")

    return {
        "method": "heuristic",
        "sessions_analyzed": len(df),
        "suggested_settings": {
            "session_type":    best_type,
            "duration_minutes": suggested_duration,
            "environment":     best_env,
            "music_type":      best_music,
            "time_window":     time_window,
            "daypart":         best_daypart,
        },
        "insight": {
            "best_daypart":     best_daypart,
            "avg_score_daypart": round(float(daypart_mean), 1),
            "overall_avg_score": round(float(overall_mean), 1),
            "score_lift":       lift,
            "score_lift_pct":   lift_pct,
        },
    }


def _model_recommendation(user_df: pd.DataFrame, model: XGBRegressor) -> dict:
    """
    Use global XGBoost model to score all candidate conditions and pick the best.
    Personalizes by using the user's own recent session patterns.
    """
    now = pd.Timestamp.now()
    hour_of_day  = now.hour
    day_of_week  = now.dayofweek

    candidate_df = _build_candidate_df(user_df, hour_of_day, day_of_week)
    candidate_df = engineer_features(candidate_df)

    for col in FEATURE_COLS:
        if col not in candidate_df.columns:
            candidate_df[col] = 0

    X_cand = candidate_df[FEATURE_COLS].fillna(0)
    candidate_df["predicted_score"] = model.predict(X_cand)

    # Personal adjustment: weight user's own history vs global model
    # More sessions = trust personal data more
    user_eng = engineer_features(user_df)
    user_env_means   = user_eng.groupby("environment")["productivity_score"].mean().to_dict()
    user_type_means  = user_eng.groupby("session_type")["productivity_score"].mean().to_dict()
    user_hour_means  = user_eng.groupby("hour_of_day")["productivity_score"].mean().to_dict()

    n_sessions = len(user_df)
    # Adaptive blend: ramps from 40% personal (10 sessions) to 70% personal (50+ sessions)
    personal_weight = min(0.70, 0.40 + (n_sessions - 10) * (0.30 / 40))
    model_weight = 1.0 - personal_weight

    def personal_adj(row):
        env_score  = user_env_means.get(row["environment"], None)
        type_score = user_type_means.get(row["session_type"], None)
        hour_score = user_hour_means.get(int(row["hour_of_day"]), None)
        personal_signals = [s for s in [env_score, type_score, hour_score] if s is not None]
        if not personal_signals:
            return row["predicted_score"]
        personal_mean = np.mean(personal_signals)
        return model_weight * row["predicted_score"] + personal_weight * personal_mean

    candidate_df["blended_score"] = candidate_df.apply(personal_adj, axis=1)

    best = candidate_df.loc[candidate_df["blended_score"].idxmax()]

    overall_mean = user_eng["productivity_score"].mean()
    predicted    = float(best["blended_score"])
    lift_pct     = round(((predicted - overall_mean) / overall_mean) * 100, 1) if overall_mean > 0 else 0

    daypart_windows = {
        "morning":    "08:00–12:00",
        "afternoon":  "12:00–17:00",
        "evening":    "17:00–21:00",
        "night":      "21:00–00:00",
        "late_night": "00:00–06:00",
    }
    time_window = daypart_windows.get(str(best.get("daypart", "")), "flexible")

    return {
        "method": "xgboost",
        "sessions_analyzed": len(user_df),
        "suggested_settings": {
            "session_type":     str(best["session_type"]),
            "duration_minutes": int(best["actual_duration"]),
            "environment":      str(best["environment"]),
            "music_type":       str(best["music_type"]),
            "time_window":      time_window,
            "daypart":          str(best.get("daypart", "")),
        },
        "insight": {
            "predicted_score":  round(predicted, 1),
            "overall_avg_score": round(float(overall_mean), 1),
            "score_lift_pct":   lift_pct,
        },
    }


# ── Public interface ─────────────────────────────────────────────────────────

def generate_recommendation(user_df: pd.DataFrame) -> dict:
    """
    Main entry point. Uses model if available, falls back to heuristics.
    """
    model = get_global_model()

    if model is not None and len(user_df) >= 10:
        try:
            return _model_recommendation(user_df, model)
        except Exception as e:
            logger.warning("Model recommendation failed, falling back to heuristic: %s", e)

    return _heuristic_recommendation(user_df)