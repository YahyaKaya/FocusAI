"""
Focus AI - LightGBM Model
Trains LightGBM model to predict productivity (for comparison with XGBoost)
Uses identical preprocessing and feature engineering as XGBoost pipeline
"""

import os
import sys
from typing import Dict, Tuple, List
import pandas as pd
import numpy as np
from dotenv import load_dotenv
import lightgbm as lgb
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

# LightGBM hyperparameters
LIGHTGBM_PARAMS = {
    'n_estimators': 200,
    'max_depth': 6,
    'learning_rate': 0.1,
    'num_leaves': 31,
    'subsample': 0.8,
    'colsample_bytree': 0.8,
    'random_state': RANDOM_STATE,
    'verbose': -1
}

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
    
    # Mask the key for display
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

def load_data() -> pd.DataFrame:
    """
    Load and join data from Supabase tables
    Returns: DataFrame with all features and target
    """
    global supabase
    
    print("📁 Loading data from Supabase...")
    
    # Load sessions
    sessions_response = supabase.table("sessions").select("*").execute()
    sessions_df = pd.DataFrame(sessions_response.data)
    print(f"  Loaded {len(sessions_df)} sessions")
    
    # Load pre_surveys
    pre_surveys_response = supabase.table("pre_surveys").select("*").execute()
    pre_surveys_df = pd.DataFrame(pre_surveys_response.data)
    print(f"  Loaded {len(pre_surveys_df)} pre-surveys")
    
    # Load post_surveys (target variable)
    post_surveys_response = supabase.table("post_surveys").select("*").execute()
    post_surveys_df = pd.DataFrame(post_surveys_response.data)
    print(f"  Loaded {len(post_surveys_df)} post-surveys")
    
    # Load passive_signals (telemetry)
    signals_response = supabase.table("passive_signals").select("*").execute()
    signals_df = pd.DataFrame(signals_response.data)
    print(f"  Loaded {len(signals_df)} passive signals")
    
    # Join tables
    print("\n📊 Joining tables...")
    
    # Rename id to session_id in source tables for consistent merging
    pre_surveys_df_copy = pre_surveys_df.copy()
    post_surveys_df_copy = post_surveys_df.copy()
    signals_df_copy = signals_df.copy()
    
    # Drop duplicate 'id' columns from surveys if they exist (keep session_id)
    if 'id' in pre_surveys_df_copy.columns:
        pre_surveys_df_copy.drop('id', axis=1, inplace=True)
    if 'id' in post_surveys_df_copy.columns:
        post_surveys_df_copy.drop('id', axis=1, inplace=True)
    if 'id' in signals_df_copy.columns:
        signals_df_copy.drop('id', axis=1, inplace=True)
    
    # Join sessions with pre_surveys using session_id (LEFT join to keep all sessions)
    df = sessions_df.merge(
        pre_surveys_df_copy,
        left_on='id',
        right_on='session_id',
        how='left'
    )
    print(f"  After pre_surveys join: {len(df)} records")
    
    # Join with post_surveys using session_id (LEFT join to keep all sessions)
    df = df.merge(
        post_surveys_df_copy,
        left_on='id',
        right_on='session_id',
        how='left',
        suffixes=('_pre', '_post')
    )
    print(f"  After post_surveys join: {len(df)} records")
    
    # Join with passive_signals using session_id (LEFT join)
    df = df.merge(
        signals_df_copy,
        left_on='id',
        right_on='session_id',
        how='left',
        suffixes=('', '_signals')
    )
    print(f"  After passive_signals join: {len(df)} records")
    
    return df


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean and prepare data for modeling
    """
    print("\n🧹 Cleaning data...")
    
    print(f"  Before cleaning: {len(df)} records")
    print(f"  Columns available: {list(df.columns)}")
    
    # If 'productivity' column doesn't have many values, create it from focus/satisfaction
    if 'productivity' not in df.columns or df['productivity'].isna().sum() > len(df) * 0.5:
        print("  Creating productivity from post-survey metrics...")
        if 'focus' in df.columns and 'satisfaction' in df.columns:
            df['focus'].fillna(5, inplace=True)
            df['satisfaction'].fillna(5, inplace=True)
            df['productivity'] = (df['focus'] + df['satisfaction']) / 2.0
        elif 'focus' in df.columns:
            df['focus'].fillna(5, inplace=True)
            df['productivity'] = df['focus']
        else:
            print("  ERROR: Cannot create productivity - missing focus/satisfaction columns")
            return df
    
    # Drop rows with missing target (productivity score is required)
    df = df.dropna(subset=['productivity'])
    print(f"  After dropping missing target: {len(df)} records")
    
    # Fill missing numeric values with 0 (notifications, distractions)
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    for col in numeric_cols:
        if df[col].isna().any():
            df[col].fillna(0, inplace=True)
    
    # Fill missing categorical values with defaults
    categorical_cols = ['environment', 'music_type', 'distraction', 'session_type', 'status']
    for col in categorical_cols:
        if col in df.columns:
            if df[col].isna().any():
                if col == 'environment':
                    df[col].fillna('QUIET', inplace=True)
                elif col == 'music_type':
                    df[col].fillna('LOFI', inplace=True)
                elif col == 'distraction':
                    df[col].fillna('NONE', inplace=True)
                elif col == 'session_type':
                    df[col].fillna('OTHER', inplace=True)
                elif col == 'status':
                    df[col].fillna('COMPLETED', inplace=True)
    
    # Fill missing pre-survey values with neutral/default values
    if 'mood' in df.columns:
        df['mood'].fillna(5, inplace=True)
    if 'energy' in df.columns:
        df['energy'].fillna(5, inplace=True)
    if 'motivation' in df.columns:
        df['motivation'].fillna(5, inplace=True)
    if 'goal_difficulty' in df.columns:
        df['goal_difficulty'].fillna(5, inplace=True)
    
    # Fill missing post-survey values
    if 'focus' in df.columns:
        df['focus'].fillna(5, inplace=True)
    if 'satisfaction' in df.columns:
        df['satisfaction'].fillna(5, inplace=True)
    
    print(f"  Cleaned dataset shape: {df.shape}")
    
    return df


# ============================================
# FEATURE ENGINEERING (IDENTICAL TO XGBOOST)
# ============================================

def engineer_features(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str], Dict]:
    """
    Create engineered features for the model
    Returns: DataFrame with features, list of feature names, label encoders
    """
    print("\n🔧 Engineering features...")
    
    df_features = df.copy()
    
    # Duration features
    df_features['break_ratio'] = df_features['total_break_mins'] / (df_features['actual_duration'] + 1)
    df_features['plan_deviation'] = df_features['actual_duration'] - df_features['planned_duration']
    df_features['pause_rate'] = df_features['pause_count'] / (df_features['actual_duration'] + 1)
    
    # Normalize durations
    df_features['duration_norm'] = np.log1p(df_features['actual_duration'])
    df_features['planned_norm'] = np.log1p(df_features['planned_duration'])
    
    # Aggregate pre-survey metrics
    df_features['pre_readiness'] = (
        df_features['mood'] + 
        df_features['energy'] + 
        df_features['motivation']
    ) / 3.0
    
    # Post-survey metrics
    df_features['post_performance'] = (
        df_features['focus'] + 
        df_features['productivity'] + 
        df_features['satisfaction']
    ) / 3.0
    
    # Session complexity
    df_features['goal_difficulty_norm'] = df_features['goal_difficulty'] / 10.0
    
    # Telemetry features (handle missing values)
    df_features['notification_count'] = df_features['notification_count'].fillna(0)
    df_features['distraction_taps'] = df_features['distraction_taps'].fillna(0)
    df_features['unlock_count'] = df_features['unlock_count'].fillna(0)
    
    # Engagement index
    df_features['distraction_index'] = (
        df_features['notification_count'] + 
        df_features['distraction_taps'] + 
        df_features['unlock_count']
    ) / (df_features['actual_duration'] + 1)
    
    # Encode categorical variables
    categorical_features = ['session_type', 'environment', 'music_type', 'distraction', 'status']
    label_encoders = {}
    
    for col in categorical_features:
        if col in df_features.columns:
            le = LabelEncoder()
            df_features[f'{col}_encoded'] = le.fit_transform(df_features[col].astype(str))
            label_encoders[col] = le
    
    print(f"  Created {len(df_features.columns) - len(df.columns)} new features")
    
    # Select features for model
    numeric_features = [
        'mood', 'energy', 'motivation', 'goal_difficulty',
        'actual_duration', 'planned_duration', 'pause_count', 'total_break_mins',
        'notification_count', 'distraction_taps', 'unlock_count',
        'focus', 'satisfaction',
        'break_ratio', 'plan_deviation', 'pause_rate',
        'duration_norm', 'planned_norm', 'pre_readiness',
        'post_performance', 'goal_difficulty_norm', 'distraction_index'
    ]
    
    categorical_encoded = [f'{col}_encoded' for col in categorical_features if f'{col}_encoded' in df_features.columns]
    
    feature_names = numeric_features + categorical_encoded
    
    # Remove features that don't exist
    feature_names = [f for f in feature_names if f in df_features.columns]
    
    print(f"  Total features for modeling: {len(feature_names)}")
    
    return df_features, feature_names, label_encoders


# ============================================
# MODEL TRAINING
# ============================================

def train_model(X: pd.DataFrame, y: pd.Series) -> Tuple[lgb.LGBMRegressor, Dict]:
    """
    Train LightGBM regression model
    Returns: trained model and performance metrics
    """
    print("\n🤖 Training LightGBM model...")
    
    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE
    )
    
    print(f"  Training set: {len(X_train)} samples")
    print(f"  Test set: {len(X_test)} samples")
    
    # Train model
    model = lgb.LGBMRegressor(**LIGHTGBM_PARAMS)
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred_train = model.predict(X_train)
    y_pred_test = model.predict(X_test)
    
    train_rmse = np.sqrt(mean_squared_error(y_train, y_pred_train))
    test_rmse = np.sqrt(mean_squared_error(y_test, y_pred_test))
    train_r2 = r2_score(y_train, y_pred_train)
    test_r2 = r2_score(y_test, y_pred_test)
    train_mae = mean_absolute_error(y_train, y_pred_train)
    test_mae = mean_absolute_error(y_test, y_pred_test)
    
    print(f"\n📊 LightGBM Performance:")
    print(f"  Train RMSE: {train_rmse:.4f}")
    print(f"  Test RMSE:  {test_rmse:.4f}")
    print(f"  Train R²:   {train_r2:.4f}")
    print(f"  Test R²:    {test_r2:.4f}")
    print(f"  Train MAE:  {train_mae:.4f}")
    print(f"  Test MAE:   {test_mae:.4f}")
    
    # Feature importance
    feature_importance = pd.DataFrame({
        'feature': X.columns,
        'importance': model.feature_importances_
    }).sort_values('importance', ascending=False)
    
    print(f"\n🎯 Top 10 Most Important Features:")
    for idx, row in feature_importance.head(10).iterrows():
        print(f"  {row['feature']}: {row['importance']:.4f}")
    
    # Store metrics for comparison
    metrics = {
        'train_rmse': train_rmse,
        'test_rmse': test_rmse,
        'train_r2': train_r2,
        'test_r2': test_r2,
        'train_mae': train_mae,
        'test_mae': test_mae,
        'feature_importance': feature_importance
    }
    
    return model, metrics


# ============================================
# XGBOOST MODEL LOADING (FOR COMPARISON)
# ============================================

def load_xgboost_metrics() -> Dict:
    """
    Load XGBoost metrics from previous run for comparison
    Returns: Metrics dictionary
    """
    # These values are from the train_xgboost.py execution
    # You can update these by running train_xgboost.py again
    metrics = {
        'train_rmse': 0.0003,
        'test_rmse': 0.0036,
        'train_r2': 1.0000,
        'test_r2': 0.9997,
        'train_mae': 0.0000,
        'test_mae': 0.0003
    }
    return metrics


# ============================================
# MODEL COMPARISON
# ============================================

def compare_models(lightgbm_metrics: Dict, xgboost_metrics: Dict = None):
    """
    Compare LightGBM with XGBoost metrics
    """
    print("\n" + "="*70)
    print("🏆 MODEL COMPARISON: LIGHTGBM vs XGBOOST")
    print("="*70)
    
    if xgboost_metrics is None:
        xgboost_metrics = load_xgboost_metrics()
    
    metrics_to_compare = ['test_rmse', 'test_r2', 'test_mae']
    
    print(f"\n{'Metric':<15} {'LightGBM':<15} {'XGBoost':<15} {'Winner':<15}")
    print("-" * 60)
    
    for metric in metrics_to_compare:
        lgb_val = lightgbm_metrics[metric]
        xgb_val = xgboost_metrics[metric]
        
        # Determine winner (lower is better for RMSE/MAE, higher is better for R²)
        if metric == 'test_r2':
            winner = "LightGBM" if lgb_val > xgb_val else "XGBoost"
        else:
            winner = "LightGBM" if lgb_val < xgb_val else "XGBoost"
        
        print(f"{metric:<15} {lgb_val:<15.4f} {xgb_val:<15.4f} {winner:<15}")
    
    print("-" * 60)
    
    # Overall winner
    lgb_score = (
        1 if lightgbm_metrics['test_r2'] > xgboost_metrics['test_r2'] else 0
    ) + (
        1 if lightgbm_metrics['test_rmse'] < xgboost_metrics['test_rmse'] else 0
    ) + (
        1 if lightgbm_metrics['test_mae'] < xgboost_metrics['test_mae'] else 0
    )
    
    overall_winner = "LightGBM" if lgb_score >= 2 else "XGBoost"
    print(f"\n🏅 Overall Winner: {overall_winner}")
    print("="*70 + "\n")


# ============================================
# MAIN PIPELINE
# ============================================

def main():
    """Main LightGBM evaluation pipeline"""
    
    print("\n" + "="*70)
    print("FOCUS AI - LIGHTGBM MODEL")
    print("="*70 + "\n")
    
    # Load environment
    env_file = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_file):
        load_dotenv(env_file)
    else:
        load_dotenv()
    
    try:
        # Connect to Supabase
        print("🔑 CONNECTING TO SUPABASE")
        print("="*70)
        connect_supabase()
        
        # Load data
        print("📊 DATA LOADING")
        print("="*70)
        df = load_data()
        df = clean_data(df)
        
        # Feature engineering
        print("\n🔧 FEATURE ENGINEERING")
        print("="*70)
        df_features, feature_names, label_encoders = engineer_features(df)
        
        # Prepare data for modeling
        X = df_features[feature_names]
        y = df_features['productivity']
        
        # Train model
        print("\n🤖 MODEL TRAINING")
        print("="*70)
        model, lightgbm_metrics = train_model(X, y)
        
        # Compare with XGBoost
        print("\n📊 MODEL COMPARISON")
        print("="*70)
        compare_models(lightgbm_metrics)
        
        print("="*70)
        print("✅ EVALUATION COMPLETED SUCCESSFULLY!")
        print("="*70 + "\n")
        
        return model, lightgbm_metrics
    
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    model, metrics = main()
    print(f"Model evaluation complete")
