"""
Focus AI - Machine Learning Pipeline
Trains XGBoost model to predict productivity and generate personalized recommendations
"""

import os
import sys
from datetime import datetime
from typing import Dict, Tuple, List
import pandas as pd
import numpy as np
from dotenv import load_dotenv
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error
from supabase import create_client, Client
import warnings

warnings.filterwarnings('ignore')

# ============================================
# CONFIGURATION
# ============================================

RANDOM_STATE = 42
TEST_SIZE = 0.2
TRAIN_BATCH_SIZE = 100
PAGE_SIZE = 1000  # Supabase max rows per request

# Model hyperparameters
XGBOOST_PARAMS = {
    'n_estimators': 200,
    'max_depth': 6,
    'learning_rate': 0.1,
    'subsample': 0.8,
    'colsample_bytree': 0.8,
    'random_state': RANDOM_STATE,
    'eval_metric': 'rmse'
}

# Recommendation scenarios to test
DURATION_OPTIONS = [20, 30, 45, 60, 90, 120]  # minutes
BREAK_OPTIONS = [5, 10, 15, 20]  # minutes
ENVIRONMENT_OPTIONS = ['QUIET', 'MUSIC', 'NOISY']
MUSIC_OPTIONS = [None, 'LOFI', 'CLASSICAL', 'AMBIENT']
SESSION_TYPE_OPTIONS = ['READING', 'WRITING', 'CODING', 'TEST', 'OTHER']

# Post-survey columns that must never be used as input features (cause target leakage)
LEAKY_COLUMNS = {'productivity', 'focus', 'satisfaction', 'distraction', 'post_performance'}

# ============================================
# SUPABASE CLIENT
# ============================================

supabase: Client = None


def validate_and_get_credentials() -> Tuple[str, str]:
    """Validate Supabase credentials"""
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_KEY')

    if not supabase_url or not supabase_key:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY in .env")

    masked_key = supabase_key[:20] + "..." + supabase_key[-5:]
    print(f"✓ SUPABASE_URL: {supabase_url}")
    print(f"✓ SUPABASE_KEY: {masked_key}")

    return supabase_url, supabase_key


def connect_supabase() -> Client:
    """Connect to Supabase"""
    global supabase

    supabase_url, supabase_key = validate_and_get_credentials()
    supabase = create_client(supabase_url, supabase_key)
    print("✓ Successfully connected to Supabase\n")
    return supabase


# ============================================
# DATA LOADING
# ============================================

def load_all_rows(table: str) -> list:
    """
    Paginate through a Supabase table using range() until all rows are loaded.
    Supabase default cap is 1000 rows per request.
    """
    global supabase
    rows = []
    offset = 0
    while True:
        response = (
            supabase.table(table)
            .select("*")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        batch = response.data
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def load_data() -> pd.DataFrame:
    """
    Load and join data from Supabase tables with full pagination.
    Returns: DataFrame with all features and target
    """
    global supabase

    print("📁 Loading data from Supabase...")

    sessions_df = pd.DataFrame(load_all_rows("sessions"))
    print(f"  Loaded {len(sessions_df)} sessions")

    pre_surveys_df = pd.DataFrame(load_all_rows("pre_surveys"))
    print(f"  Loaded {len(pre_surveys_df)} pre-surveys")

    post_surveys_df = pd.DataFrame(load_all_rows("post_surveys"))
    print(f"  Loaded {len(post_surveys_df)} post-surveys")

    signals_df = pd.DataFrame(load_all_rows("passive_signals"))
    print(f"  Loaded {len(signals_df)} passive signals")

    print("\n📊 Joining tables...")

    pre_surveys_copy = pre_surveys_df.copy()
    post_surveys_copy = post_surveys_df.copy()
    signals_copy = signals_df.copy()

    for df_copy in [pre_surveys_copy, post_surveys_copy, signals_copy]:
        if 'id' in df_copy.columns:
            df_copy.drop('id', axis=1, inplace=True)

    df = sessions_df.merge(pre_surveys_copy, left_on='id', right_on='session_id', how='left')
    print(f"  After pre_surveys join: {len(df)} records")

    df = df.merge(post_surveys_copy, left_on='id', right_on='session_id', how='left', suffixes=('_pre', '_post'))
    print(f"  After post_surveys join: {len(df)} records")

    df = df.merge(signals_copy, left_on='id', right_on='session_id', how='left', suffixes=('', '_signals'))
    print(f"  After passive_signals join: {len(df)} records")

    return df


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean and prepare data for modeling.
    Target is productivity_score (0–100) from the sessions table.
    Post-survey Likert columns are NOT used as the target.
    """
    print("\n🧹 Cleaning data...")
    print(f"  Before cleaning: {len(df)} records")
    print(f"  Columns available: {list(df.columns)}")

    # Target: productivity_score (0–100), computed by the backend from post-survey responses
    if 'productivity_score' not in df.columns:
        print("  ERROR: productivity_score column not found in sessions table")
        return df

    # Drop rows with no productivity_score (sessions without a completed post-survey)
    df = df.dropna(subset=['productivity_score'])
    print(f"  After dropping missing target: {len(df)} records")

    # Fill missing numeric values with 0
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    for col in numeric_cols:
        if df[col].isna().any():
            df[col].fillna(0, inplace=True)

    # Fill missing categorical values with defaults
    categorical_defaults = {
        'environment': 'QUIET',
        'music_type': 'LOFI',
        'session_type': 'OTHER',
        'status': 'COMPLETED',
    }
    for col, default in categorical_defaults.items():
        if col in df.columns and df[col].isna().any():
            df[col].fillna(default, inplace=True)

    # Fill missing pre-survey values with neutral midpoint
    for col in ['mood', 'energy', 'motivation', 'goal_difficulty']:
        if col in df.columns:
            df[col].fillna(3, inplace=True)

    print(f"  Cleaned dataset shape: {df.shape}")
    return df


# ============================================
# FEATURE ENGINEERING
# ============================================

def engineer_features(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str], Dict]:
    """
    Create engineered features for the model.
    Only pre-survey fields, session metadata, and passive signals are used.
    Post-survey columns (productivity, focus, satisfaction, distraction) are excluded.
    """
    print("\n🔧 Engineering features...")

    df_features = df.copy()

    # Duration features (session metadata — available before and during session)
    df_features['break_ratio'] = df_features['total_break_mins'] / (df_features['actual_duration'] + 1)
    df_features['plan_deviation'] = df_features['actual_duration'] - df_features['planned_duration']
    df_features['pause_rate'] = df_features['pause_count'] / (df_features['actual_duration'] + 1)
    df_features['duration_norm'] = np.log1p(df_features['actual_duration'])
    df_features['planned_norm'] = np.log1p(df_features['planned_duration'])

    # Pre-survey readiness composite (mood + energy + motivation, all 1–5)
    df_features['pre_readiness'] = (
        df_features['mood'] +
        df_features['energy'] +
        df_features['motivation']
    ) / 3.0

    df_features['goal_difficulty_norm'] = df_features['goal_difficulty'] / 5.0

    # Passive signal features (telemetry — recorded during session, not post-survey)
    for col in ['notification_count', 'distraction_taps', 'unlock_count']:
        df_features[col] = df_features[col].fillna(0)

    df_features['distraction_index'] = (
        df_features['notification_count'] +
        df_features['distraction_taps'] +
        df_features['unlock_count']
    ) / (df_features['actual_duration'] + 1)

    # Encode categorical variables (pre-survey / session metadata only)
    categorical_features = ['session_type', 'environment', 'music_type', 'status']
    label_encoders = {}

    for col in categorical_features:
        if col in df_features.columns:
            le = LabelEncoder()
            df_features[f'{col}_encoded'] = le.fit_transform(df_features[col].astype(str))
            label_encoders[col] = le

    print(f"  Created {len(df_features.columns) - len(df.columns)} new features")

    # Feature set: ONLY pre-survey inputs, session metadata, and passive signals
    # Post-survey columns (productivity, focus, satisfaction, distraction) are intentionally excluded
    numeric_features = [
        # Pre-survey (1–5 Likert)
        'mood', 'energy', 'motivation', 'goal_difficulty',
        # Session metadata
        'actual_duration', 'planned_duration', 'pause_count', 'total_break_mins',
        # Passive signals
        'notification_count', 'distraction_taps', 'unlock_count',
        # Engineered
        'break_ratio', 'plan_deviation', 'pause_rate',
        'duration_norm', 'planned_norm', 'pre_readiness',
        'goal_difficulty_norm', 'distraction_index',
    ]

    categorical_encoded = [
        f'{col}_encoded' for col in categorical_features
        if f'{col}_encoded' in df_features.columns
    ]

    feature_names = [f for f in numeric_features + categorical_encoded if f in df_features.columns]

    # Sanity check — confirm no leaky columns slipped in
    leaked = [f for f in feature_names if f in LEAKY_COLUMNS]
    if leaked:
        raise ValueError(f"Target leakage detected in feature set: {leaked}")

    print(f"  Total features for modeling: {len(feature_names)}")
    print(f"  Leakage check passed ✓ (post-survey columns excluded)")

    return df_features, feature_names, label_encoders


# ============================================
# MODEL TRAINING
# ============================================

def train_model(X: pd.DataFrame, y: pd.Series) -> XGBRegressor:
    """
    Train XGBoost regression model.
    Target y is productivity_score (0–100).
    """
    print("\n🤖 Training XGBoost model...")
    print(f"  Target range: min={y.min():.1f}, max={y.max():.1f}, mean={y.mean():.1f}")

    if y.max() <= 5:
        raise ValueError(
            f"Target appears to be on a 1–5 Likert scale (max={y.max()}). "
            "Use productivity_score (0–100) instead."
        )

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE
    )

    print(f"  Training set: {len(X_train)} samples")
    print(f"  Test set: {len(X_test)} samples")

    model = XGBRegressor(**XGBOOST_PARAMS)
    model.fit(X_train, y_train, verbose=False)

    y_pred_train = model.predict(X_train)
    y_pred_test = model.predict(X_test)

    print(f"\n📊 Model Performance:")
    print(f"  Train RMSE: {np.sqrt(mean_squared_error(y_train, y_pred_train)):.4f}")
    print(f"  Test RMSE:  {np.sqrt(mean_squared_error(y_test, y_pred_test)):.4f}")
    print(f"  Train R²:   {r2_score(y_train, y_pred_train):.4f}")
    print(f"  Test R²:    {r2_score(y_test, y_pred_test):.4f}")
    print(f"  Train MAE:  {mean_absolute_error(y_train, y_pred_train):.4f}")
    print(f"  Test MAE:   {mean_absolute_error(y_test, y_pred_test):.4f}")

    feature_importance = pd.DataFrame({
        'feature': X.columns,
        'importance': model.feature_importances_
    }).sort_values('importance', ascending=False)

    print(f"\n🎯 Top 10 Most Important Features:")
    for _, row in feature_importance.head(10).iterrows():
        print(f"  {row['feature']}: {row['importance']:.4f}")

    return model


# ============================================
# RECOMMENDATION ENGINE
# ============================================

MIN_SESSIONS_FOR_RECOMMENDATION = 5


def get_user_stats(user_df: pd.DataFrame) -> Dict:
    """
    Compute per-user historical statistics from the user's own sessions only.
    Never touches any other user's rows.
    """
    scored = user_df.dropna(subset=['productivity_score'])
    if len(scored) == 0:
        return {}

    avg_duration = float(scored['actual_duration'].mean()) if 'actual_duration' in scored.columns else 45.0

    return {
        'best_score': float(scored['productivity_score'].max()),
        'avg_score': float(scored['productivity_score'].mean()),
        'avg_duration': avg_duration,
        # Issue 4 confirmed: all averages are computed from this user's own scored rows only
        'avg_mood': float(scored['mood'].mean()) if 'mood' in scored.columns else 3.0,
        'avg_energy': float(scored['energy'].mean()) if 'energy' in scored.columns else 3.0,
        'avg_motivation': float(scored['motivation'].mean()) if 'motivation' in scored.columns else 3.0,
        'avg_goal_difficulty': float(scored['goal_difficulty'].mean()) if 'goal_difficulty' in scored.columns else 3.0,
        'avg_pause_count': float(scored['pause_count'].mean()) if 'pause_count' in scored.columns else 0.0,
        'avg_total_break_mins': float(scored['total_break_mins'].mean()) if 'total_break_mins' in scored.columns else 0.0,
        'avg_notification_count': float(scored['notification_count'].mean()) if 'notification_count' in scored.columns else 0.0,
        'avg_distraction_taps': float(scored['distraction_taps'].mean()) if 'distraction_taps' in scored.columns else 0.0,
        'avg_unlock_count': float(scored['unlock_count'].mean()) if 'unlock_count' in scored.columns else 0.0,
        'session_count': len(scored),
    }


def get_duration_candidates(avg_duration: float) -> List[int]:
    """
    Issue 3: Build a duration candidate list tailored to the user's typical session length.
    Users who run long sessions get longer options; short-session users get shorter ones.
    The base set [45, 60, 90] is always included so there's overlap.
    """
    candidates = {45, 60, 90}
    if avg_duration > 75:
        candidates.update([90, 120])
    if avg_duration < 45:
        candidates.update([25, 30])
    # Always round out with standard options
    candidates.update([30, 45, 60])
    return sorted(candidates)


def build_scenario(stats: Dict, duration: int, environment: str,
                   session_type: str, music_val: str,
                   status_encoded_default: int) -> Dict:
    """
    Build a candidate feature vector using the user's personal averages as inputs.
    Issue 4: mood/energy/motivation come from stats (per-user averages), never global.
    """
    avg_break = stats['avg_total_break_mins']
    avg_pauses = stats['avg_pause_count']
    return {
        # Pre-survey: user's personal historical averages — not global
        'mood': stats['avg_mood'],
        'energy': stats['avg_energy'],
        'motivation': stats['avg_motivation'],
        'goal_difficulty': stats['avg_goal_difficulty'],
        # Session metadata: the candidate values being evaluated
        'actual_duration': duration,
        'planned_duration': duration,
        'pause_count': avg_pauses,
        'total_break_mins': avg_break,
        # Passive signals: user's personal averages
        'notification_count': stats['avg_notification_count'],
        'distraction_taps': stats['avg_distraction_taps'],
        'unlock_count': stats['avg_unlock_count'],
        # Engineered features
        'break_ratio': avg_break / (duration + 1),
        'plan_deviation': 0.0,
        'pause_rate': avg_pauses / (duration + 1),
        'duration_norm': np.log1p(duration),
        'planned_norm': np.log1p(duration),
        'pre_readiness': (stats['avg_mood'] + stats['avg_energy'] + stats['avg_motivation']) / 3.0,
        'goal_difficulty_norm': stats['avg_goal_difficulty'] / 5.0,
        'distraction_index': (
            stats['avg_notification_count'] +
            stats['avg_distraction_taps'] +
            stats['avg_unlock_count']
        ) / (duration + 1),
        'status_encoded': status_encoded_default,
    }


def score_scenario(scenario: Dict, feature_names: List[str], model: XGBRegressor) -> float:
    X = np.array([scenario.get(f, 0) for f in feature_names]).reshape(1, -1)
    return float(np.clip(model.predict(X)[0], 0, 100))


def generate_recommendations(
    df: pd.DataFrame,
    feature_names: List[str],
    model: XGBRegressor,
    label_encoders: Dict
) -> pd.DataFrame:
    """
    Generate personalized recommendations for each user.

    Fix 1: score_lift_pct is always >= 0. If no candidate beats user avg, the best
           candidate is still picked but flagged (beats_avg=False).
    Fix 2: Full environment grid (QUIET/MUSIC/NOISY). For MUSIC, vary music_type
           across AMBIENT/LOFI/CLASSICAL. Winner is genuinely the highest scorer.
    Fix 3: Duration candidates are personalised based on the user's avg session length.
    Fix 4: All scenario inputs use per-user averages confirmed in get_user_stats.
    """
    print("\nGenerating personalized recommendations...")

    recommendations = []
    skipped = 0
    unique_users = df['user_id'].unique()

    status_encoded_default = 0
    if 'status' in label_encoders:
        le = label_encoders['status']
        if 'COMPLETED' in le.classes_:
            status_encoded_default = int(le.transform(['COMPLETED'])[0])

    def encode_val(col: str, val: str) -> int:
        if col in label_encoders:
            le = label_encoders[col]
            return int(le.transform([val])[0]) if val in le.classes_ else 0
        return 0

    for user_id in unique_users:
        user_df = df[df['user_id'] == user_id]
        stats = get_user_stats(user_df)

        if stats.get('session_count', 0) < MIN_SESSIONS_FOR_RECOMMENDATION:
            skipped += 1
            continue

        user_avg_score = stats['avg_score']
        user_best_score = stats['best_score']

        # Fix 3: personalised duration candidates
        duration_candidates = get_duration_candidates(stats['avg_duration'])

        best_predicted = -1.0
        best_params = {'duration': 45, 'environment': 'QUIET', 'session_type': 'OTHER', 'music': 'LOFI'}

        for duration in duration_candidates:
            for environment in ENVIRONMENT_OPTIONS:  # always QUIET, MUSIC, NOISY
                # Fix 2: for MUSIC environment, iterate music_type variants; others use LOFI as neutral
                music_variants = ['AMBIENT', 'LOFI', 'CLASSICAL'] if environment == 'MUSIC' else ['LOFI']
                for music_val in music_variants:
                    for session_type in SESSION_TYPE_OPTIONS:
                        scenario = build_scenario(
                            stats, duration, environment, session_type,
                            music_val, status_encoded_default
                        )
                        # Encode the three varied categoricals
                        scenario['session_type_encoded'] = encode_val('session_type', session_type)
                        scenario['environment_encoded'] = encode_val('environment', environment)
                        scenario['music_type_encoded'] = encode_val('music_type', music_val)

                        try:
                            predicted = score_scenario(scenario, feature_names, model)
                            if predicted > best_predicted:
                                best_predicted = predicted
                                best_params = {
                                    'duration': duration,
                                    'environment': environment,
                                    'session_type': session_type,
                                    'music': music_val,
                                }
                        except Exception:
                            continue

        # Fix 1: score_lift_pct never negative; flag if recommendation doesn't beat avg
        if user_avg_score > 0:
            raw_lift = ((best_predicted - user_avg_score) / user_avg_score) * 100
        else:
            raw_lift = 0.0
        beats_avg = best_predicted >= user_avg_score
        score_lift_pct = round(max(raw_lift, 0.0), 1)

        recommendations.append({
            'user_id': str(user_id),
            'recommended_duration': best_params['duration'],
            'recommended_environment': best_params['environment'],
            'recommended_session_type': best_params['session_type'],
            'recommended_music': best_params['music'],
            'predicted_productivity_score': round(best_predicted, 1),
            'historical_best_score': round(user_best_score, 1),
            'user_avg_score': round(user_avg_score, 1),
            'score_lift_pct': score_lift_pct,
            'beats_avg': beats_avg,
            'sessions_analyzed': stats['session_count'],
            'created_at': datetime.now().isoformat()
        })

    print(f"  Generated {len(recommendations)} recommendations ({skipped} users skipped — fewer than {MIN_SESSIONS_FOR_RECOMMENDATION} sessions)")

    rec_df = pd.DataFrame(recommendations)
    if len(rec_df) > 0:
        print("\n  Recommendations:")
        print(rec_df[['user_id', 'recommended_duration', 'recommended_environment',
                       'recommended_session_type', 'predicted_productivity_score',
                       'user_avg_score', 'score_lift_pct']].to_string(index=False))

    return rec_df


# ============================================
# MAIN PIPELINE
# ============================================

def main():
    """Main ML pipeline"""

    print("\n" + "="*70)
    print("FOCUS AI - ML PIPELINE")
    print("="*70 + "\n")

    env_file = os.path.join(os.path.dirname(__file__), '.env')
    load_dotenv(env_file if os.path.exists(env_file) else None)

    try:
        print("🔑 CONNECTING TO SUPABASE")
        print("="*70)
        connect_supabase()

        print("📊 DATA LOADING")
        print("="*70)
        df = load_data()
        df = clean_data(df)

        print("\n🔧 FEATURE ENGINEERING")
        print("="*70)
        df_features, feature_names, label_encoders = engineer_features(df)

        # Target: productivity_score (0–100), not the 1–5 post-survey Likert columns
        X = df_features[feature_names]
        y = df_features['productivity_score']

        print("\n🤖 MODEL TRAINING")
        print("="*70)
        model = train_model(X, y)

        print("\n💡 RECOMMENDATION GENERATION")
        print("="*70)
        recommendations = generate_recommendations(df_features, feature_names, model, label_encoders)

        print("\n" + "="*70)
        print("✅ PIPELINE COMPLETED SUCCESSFULLY!")
        print("="*70 + "\n")

        return model, recommendations

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    model, recommendations = main()
    print(f"\nRecommendations:\n{recommendations.to_string()}")
