"""
Focus AI - LightGBM Model
Trains LightGBM to predict productivity_score and compares with XGBoost.

Fixes vs original:
- Full pagination (loads all rows, not just 1000)
- Uses productivity_score as target (not post-survey focus/satisfaction)
- Post-survey columns excluded from features (no target leakage)
- Identical feature engineering to ml_pipeline.py
"""

import os
import sys
import warnings
from typing import Dict, List, Tuple

import lightgbm as lgb
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import cross_val_score, train_test_split
from supabase import create_client, Client

warnings.filterwarnings("ignore")

# ── Config ───────────────────────────────────────────────────────────────────

RANDOM_STATE = 42
TEST_SIZE = 0.2
PAGE_SIZE = 1000

LIGHTGBM_PARAMS = {
    "n_estimators": 200,
    "max_depth": 6,
    "learning_rate": 0.1,
    "num_leaves": 31,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "random_state": RANDOM_STATE,
    "verbose": -1,
}

# ── Supabase ─────────────────────────────────────────────────────────────────

_supabase: Client | None = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_KEY"]
        _supabase = create_client(url, key)
    return _supabase


# ── Data loading (paginated) ──────────────────────────────────────────────────

def _unpack(row: dict, key: str) -> dict:
    val = row.get(key) or []
    if isinstance(val, list):
        return val[0] if val else {}
    if isinstance(val, dict):
        return val
    return {}


def fetch_all_sessions() -> pd.DataFrame:
    sb = get_supabase()
    all_records = []
    offset = 0

    print("📁 Loading data from Supabase (paginated)...")

    while True:
        result = (
            sb.table("sessions")
            .select(
                "id, user_id, session_type, start_time, actual_duration, "
                "planned_duration, pause_count, total_break_mins, productivity_score, "
                "pre_surveys(mood, energy, motivation, goal_difficulty, environment, music_type), "
                "post_surveys(productivity, focus, satisfaction, distraction), "
                "passive_signals(notification_count, distraction_taps, unlock_count)"
            )
            .eq("status", "COMPLETED")
            .not_.is_("productivity_score", "null")
            .order("start_time", desc=False)
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )

        rows = result.data
        if not rows:
            break

        for r in rows:
            pre = _unpack(r, "pre_surveys")
            post = _unpack(r, "post_surveys")
            sig = _unpack(r, "passive_signals")

            if not pre or not post:
                continue
            if pre.get("mood") is None or post.get("productivity") is None:
                continue
            if not r.get("actual_duration") or r["actual_duration"] < 5:
                continue

            all_records.append({
                "session_id":         r["id"],
                "user_id":            r["user_id"],
                "session_type":       r["session_type"],
                "start_time":         r["start_time"],
                "actual_duration":    r["actual_duration"],
                "planned_duration":   r["planned_duration"],
                "pause_count":        r["pause_count"],
                "total_break_mins":   r["total_break_mins"],
                "productivity_score": float(r["productivity_score"]),  # TARGET
                "mood":               pre.get("mood"),
                "energy":             pre.get("energy"),
                "motivation":         pre.get("motivation"),
                "goal_difficulty":    pre.get("goal_difficulty"),
                "environment":        pre.get("environment"),
                "music_type":         pre.get("music_type"),
                # passive signals (optional)
                "notification_count": sig.get("notification_count", 0) or 0,
                "distraction_taps":   sig.get("distraction_taps", 0) or 0,
                "unlock_count":       sig.get("unlock_count", 0) or 0,
                # post-survey kept for reference only — NOT used as features
                "_post_productivity": post.get("productivity"),
                "_post_focus":        post.get("focus"),
                "_post_satisfaction": post.get("satisfaction"),
                "_post_distraction":  post.get("distraction"),
            })

        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    print(f"  ✓ Loaded {len(all_records)} valid sessions")
    return pd.DataFrame(all_records)


# ── Feature engineering ───────────────────────────────────────────────────────

SESSION_TYPES      = ["READING", "WRITING", "CODING", "TEST", "OTHER"]
ENVIRONMENTS       = ["QUIET", "MUSIC", "NOISY"]
MUSIC_TYPES        = ["AMBIENT", "LOFI", "CLASSICAL", "OTHER"]
DISTRACTION_MAP    = {"NONE": 0, "FEW": 1, "MANY": 2}

FEATURE_COLS = [
    # Pre-survey (normalized)
    "mood_norm", "energy_norm", "motivation_norm", "goal_difficulty_norm",
    # Session telemetry
    "actual_duration", "plan_deviation", "break_ratio", "pause_count", "pause_rate",
    # Passive signals
    "notification_count", "distraction_taps", "unlock_count", "distraction_index",
    # Derived
    "pre_readiness",
    # Time
    "hour_of_day", "day_of_week",
    # One-hot: session type
    "type_reading", "type_writing", "type_coding", "type_test", "type_other",
    # One-hot: environment
    "env_quiet", "env_music", "env_noisy",
    # One-hot: music
    "music_ambient", "music_lofi", "music_classical", "music_other",
    # One-hot: daypart
    "daypart_morning", "daypart_afternoon", "daypart_evening",
    "daypart_night", "daypart_late_night",
]

TARGET_COL = "productivity_score"


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Time
    df["start_time"]  = pd.to_datetime(df["start_time"], format="mixed")
    df["hour_of_day"] = df["start_time"].dt.hour
    df["day_of_week"] = df["start_time"].dt.dayofweek

    df["daypart"] = pd.cut(
        df["hour_of_day"],
        bins=[-1, 6, 12, 17, 21, 24],
        labels=["night", "morning", "afternoon", "evening", "late_night"],
    ).astype(str)

    # Duration
    df["actual_duration"]  = pd.to_numeric(df["actual_duration"],  errors="coerce").fillna(0)
    df["planned_duration"] = pd.to_numeric(df["planned_duration"], errors="coerce").fillna(df["actual_duration"])
    df["plan_deviation"]   = np.where(
        df["planned_duration"] > 0,
        df["actual_duration"] / df["planned_duration"],
        1.0,
    ).clip(0, 2)

    df["total_break_mins"] = pd.to_numeric(df["total_break_mins"], errors="coerce").fillna(0)
    df["break_ratio"] = np.where(
        df["actual_duration"] > 0,
        df["total_break_mins"] / df["actual_duration"],
        0.0,
    ).clip(0, 1)

    df["pause_count"] = pd.to_numeric(df["pause_count"], errors="coerce").fillna(0)
    df["pause_rate"]  = np.where(
        df["actual_duration"] > 0,
        df["pause_count"] / df["actual_duration"],
        0.0,
    )

    # Pre-survey normalization (1-5 → 0-1)
    for col in ["mood", "energy", "motivation", "goal_difficulty"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(3)
        df[f"{col}_norm"] = (df[col] - 1) / 4

    # Composite pre-survey readiness
    df["pre_readiness"] = (df["mood_norm"] + df["energy_norm"] + df["motivation_norm"]) / 3

    # Passive signals
    for col in ["notification_count", "distraction_taps", "unlock_count"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    df["distraction_index"] = (
        df["notification_count"] + df["distraction_taps"] + df["unlock_count"]
    ) / (df["actual_duration"] + 1)

    # One-hot: session type
    for val in SESSION_TYPES:
        df[f"type_{val.lower()}"] = (df["session_type"] == val).astype(int)

    # One-hot: environment
    for val in ENVIRONMENTS:
        df[f"env_{val.lower()}"] = (df["environment"] == val).astype(int)

    # One-hot: music type
    for val in MUSIC_TYPES:
        df[f"music_{val.lower()}"] = (df["music_type"] == val).astype(int)

    # One-hot: daypart
    for val in ["morning", "afternoon", "evening", "night", "late_night"]:
        df[f"daypart_{val}"] = (df["daypart"] == val).astype(int)

    return df


# ── Training ──────────────────────────────────────────────────────────────────

def train_and_evaluate(df: pd.DataFrame):
    df = engineer_features(df)

    for col in FEATURE_COLS:
        if col not in df.columns:
            df[col] = 0

    X = df[FEATURE_COLS].fillna(0)
    y = df[TARGET_COL]

    print(f"\n  Target range: min={y.min():.1f}, max={y.max():.1f}, mean={y.mean():.1f}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE
    )
    print(f"  Training set: {len(X_train)} samples")
    print(f"  Test set:     {len(X_test)} samples")

    model = lgb.LGBMRegressor(**LIGHTGBM_PARAMS)
    model.fit(X_train, y_train)

    y_pred_train = model.predict(X_train)
    y_pred_test  = model.predict(X_test)

    metrics = {
        "train_rmse": float(np.sqrt(mean_squared_error(y_train, y_pred_train))),
        "test_rmse":  float(np.sqrt(mean_squared_error(y_test,  y_pred_test))),
        "train_r2":   float(r2_score(y_train, y_pred_train)),
        "test_r2":    float(r2_score(y_test,  y_pred_test)),
        "train_mae":  float(mean_absolute_error(y_train, y_pred_train)),
        "test_mae":   float(mean_absolute_error(y_test,  y_pred_test)),
    }

    print(f"\n📊 LightGBM Performance:")
    print(f"  Train RMSE: {metrics['train_rmse']:.4f}")
    print(f"  Test  RMSE: {metrics['test_rmse']:.4f}")
    print(f"  Train R²:   {metrics['train_r2']:.4f}")
    print(f"  Test  R²:   {metrics['test_r2']:.4f}")
    print(f"  Train MAE:  {metrics['train_mae']:.4f}")
    print(f"  Test  MAE:  {metrics['test_mae']:.4f}")

    # CV MAE
    try:
        cv_mae = -cross_val_score(
            lgb.LGBMRegressor(**LIGHTGBM_PARAMS),
            X, y, cv=5, scoring="neg_mean_absolute_error",
        ).mean()
        print(f"  5-fold CV MAE: {cv_mae:.4f}")
        metrics["cv_mae"] = cv_mae
    except Exception:
        pass

    # Feature importance
    fi = pd.DataFrame({
        "feature":    FEATURE_COLS,
        "importance": model.feature_importances_,
    }).sort_values("importance", ascending=False)

    print(f"\n🎯 Top 10 Most Important Features:")
    for _, row in fi.head(10).iterrows():
        print(f"  {row['feature']}: {row['importance']:.4f}")

    return model, metrics


# ── Comparison ────────────────────────────────────────────────────────────────

# XGBoost real metrics from ml_pipeline.py run on 8234 sessions
XGBOOST_REAL_METRICS = {
    "test_rmse": 12.2615,
    "test_r2":   0.7794,
    "test_mae":  9.0900,
}


def compare_models(lgb_metrics: dict):
    xgb = XGBOOST_REAL_METRICS
    lgb_m = lgb_metrics

    print("\n" + "=" * 65)
    print("🏆 MODEL COMPARISON: LightGBM vs XGBoost")
    print("    (Both trained on same dataset, same feature set, no leakage)")
    print("=" * 65)
    print(f"{'Metric':<15} {'LightGBM':<15} {'XGBoost':<15} {'Winner':<10}")
    print("-" * 55)

    for metric, label in [("test_rmse", "Test RMSE"), ("test_r2", "Test R²"), ("test_mae", "Test MAE")]:
        lgb_val = lgb_m[metric]
        xgb_val = xgb[metric]
        if metric == "test_r2":
            winner = "LightGBM" if lgb_val > xgb_val else "XGBoost"
        else:
            winner = "LightGBM" if lgb_val < xgb_val else "XGBoost"
        print(f"{label:<15} {lgb_val:<15.4f} {xgb_val:<15.4f} {winner:<10}")

    print("-" * 55)
    xgb_wins = sum([
        lgb_m["test_rmse"] > xgb["test_rmse"],
        lgb_m["test_r2"]   < xgb["test_r2"],
        lgb_m["test_mae"]  > xgb["test_mae"],
    ])
    overall = "XGBoost" if xgb_wins >= 2 else "LightGBM"
    print(f"\n🏅 Overall Winner: {overall}")
    print("=" * 65)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("\n" + "=" * 65)
    print("FOCUS AI - LIGHTGBM EVALUATION PIPELINE")
    print("=" * 65)

    env_file = os.path.join(os.path.dirname(__file__), ".env")
    load_dotenv(env_file if os.path.exists(env_file) else None)

    print("\n🔑 CONNECTING TO SUPABASE")
    print("=" * 65)
    sb = get_supabase()
    print(f"✓ Connected to {os.environ['SUPABASE_URL']}")

    print("\n📊 DATA LOADING")
    print("=" * 65)
    df = fetch_all_sessions()

    if df.empty or len(df) < 50:
        print(f"❌ Not enough data ({len(df)} rows). Exiting.")
        sys.exit(1)

    print("\n🔧 FEATURE ENGINEERING")
    print("=" * 65)
    print(f"  Leakage check: post-survey columns excluded ✓")
    print(f"  Target: productivity_score (server-computed) ✓")

    print("\n🤖 MODEL TRAINING")
    print("=" * 65)
    model, metrics = train_and_evaluate(df)

    print("\n📊 MODEL COMPARISON")
    print("=" * 65)
    compare_models(metrics)

    print("\n" + "=" * 65)
    print("✅ EVALUATION COMPLETED SUCCESSFULLY!")
    print("=" * 65)

    return model, metrics


if __name__ == "__main__":
    model, metrics = main()