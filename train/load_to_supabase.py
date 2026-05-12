"""
Supabase Data Loader

Load generated synthetic data from CSV files into Supabase.

Requirements:
  - Environment variables (from .env file or system):
    * SUPABASE_URL - Your Supabase project URL
    * SUPABASE_KEY - Service role key (NOT anon key)
  
  - .env file format (place in same directory as this script):
    SUPABASE_URL=https://your-project.supabase.co
    SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

  - Dependencies:
    pip install pandas supabase python-dotenv
"""

import os
import sys
import pandas as pd
from datetime import datetime
from pathlib import Path
import uuid

# Load environment variables from .env file
from dotenv import load_dotenv

# Find and load .env file from script directory
script_dir = Path(__file__).parent.resolve()
env_file = script_dir / ".env"

if env_file.exists():
    print(f"✓ Loading .env from: {env_file}")
    load_dotenv(env_file)
else:
    print(f"⚠️  .env file not found at: {env_file}")
    print("  Trying to load from environment variables...")
    load_dotenv()

# Import Supabase after dotenv is loaded
from supabase import create_client, Client

# ============================================
# GLOBAL VARIABLES
# ============================================

supabase: Client = None  # Will be initialized in main()

# ============================================
# CONFIGURATION & VALIDATION
# ============================================

def validate_and_get_credentials() -> tuple[str, str]:
    """
    Validate and retrieve Supabase credentials from environment.
    
    Returns:
        Tuple of (SUPABASE_URL, SUPABASE_KEY)
    
    Raises:
        SystemExit: If credentials are missing
    """
    SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
    SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()
    
    print("\n" + "="*70)
    print("ENVIRONMENT VALIDATION")
    print("="*70)
    
    # Validate URL
    if not SUPABASE_URL:
        print("❌ ERROR: SUPABASE_URL is missing or empty")
        print("\n   Add to .env file:")
        print("   SUPABASE_URL=https://your-project.supabase.co")
        sys.exit(1)
    
    if "supabase.co" not in SUPABASE_URL:
        print(f"❌ ERROR: SUPABASE_URL looks invalid")
        print(f"   Got: {SUPABASE_URL}")
        print("   Expected format: https://your-project.supabase.co")
        sys.exit(1)
    
    print(f"✓ SUPABASE_URL: {SUPABASE_URL}")
    
    # Validate KEY
    if not SUPABASE_KEY:
        print("❌ ERROR: SUPABASE_KEY is missing or empty")
        print("\n   Add to .env file:")
        print("   SUPABASE_KEY=your_service_role_key_here")
        print("\n   ⚠️  Use Service Role Key (NOT anon key)")
        print("   Get from: https://app.supabase.com → Settings → API")
        sys.exit(1)
    
    if len(SUPABASE_KEY) < 20:
        print(f"❌ ERROR: SUPABASE_KEY looks too short (likely invalid)")
        print(f"   Got {len(SUPABASE_KEY)} characters, expected ~200+")
        sys.exit(1)
    
    # Mask key for display
    masked_key = SUPABASE_KEY[:15] + "..." + SUPABASE_KEY[-10:]
    print(f"✓ SUPABASE_KEY: {masked_key}")
    
    print("="*70 + "\n")
    
    return SUPABASE_URL, SUPABASE_KEY

# ============================================
# DATA LOADING FUNCTIONS
# ============================================

def load_users(df: pd.DataFrame) -> dict:
    """Load unique users into users table"""
    global supabase
    
    print("\n[1/5] Loading users...")
    
    users_data = df[['user_id', 'user_name']].drop_duplicates()
    
    user_records = []
    now = datetime.now().isoformat()
    for _, row in users_data.iterrows():
        user_records.append({
            "id": row['user_id'],
            "name": row['user_name'],
            "created_at": now,
            "updated_at": now,
        })
    
    # Insert in batches of 100
    for i in range(0, len(user_records), 100):
        batch = user_records[i:i+100]
        response = supabase.table("users").upsert(batch).execute()
        print(f"  ✓ Loaded users {i+1}-{min(i+100, len(user_records))}")
    
    return {r["id"]: r for r in user_records}


def load_sessions(df: pd.DataFrame) -> dict:
    """Load sessions into sessions table"""
    global supabase
    
    print("\n[2/5] Loading sessions...")
    
    # Group by session to get unique sessions
    sessions_data = df[['user_id', 'start_time', 'end_time', 'status', 'pre_session_type',
                       'planned_duration', 'actual_duration', 'pause_count', 'total_break_mins', 
                       'productivity_score']].drop_duplicates()
    
    session_records = []
    now = datetime.now().isoformat()
    for idx, row in sessions_data.iterrows():
        session_id = str(uuid.uuid4())  # Generate UUID for session
        session_records.append({
            "id": session_id,
            "user_id": row['user_id'],
            "status": row['status'],
            "session_type": row['pre_session_type'],
            "start_time": str(row['start_time']),
            "end_time": str(row['end_time']),
            "planned_duration": int(row['planned_duration']),
            "actual_duration": int(row['actual_duration']),
            "pause_count": int(row['pause_count']),
            "total_break_mins": int(row['total_break_mins']),
            "productivity_score": float(row['productivity_score']),
            "created_at": now,
            "updated_at": now,
        })
    
    # Insert in batches and keep track of IDs
    session_id_map = {}
    for i in range(0, len(session_records), 100):
        batch = session_records[i:i+100]
        response = supabase.table("sessions").insert(batch).execute()
        
        if response.data:
            for j, session in enumerate(response.data):
                # Map by start_time and user_id
                key = (batch[j]["user_id"], batch[j]["start_time"])
                session_id_map[key] = session["id"]
        
        print(f"  ✓ Loaded sessions {i+1}-{min(i+100, len(session_records))}")
    
    return session_id_map, session_records


def load_pre_surveys(df: pd.DataFrame, session_id_map: dict, session_records: list) -> dict:
    """Load pre-session surveys"""
    global supabase
    
    print("\n[3/5] Loading pre-session surveys...")
    
    pre_survey_records = []
    now = datetime.now().isoformat()
    for idx, row in df.iterrows():
        key = (row['user_id'], str(row['start_time']))
        if key not in session_id_map:
            continue
        
        pre_survey_records.append({
            "id": str(uuid.uuid4()),
            "session_id": session_id_map[key],
            "mood": int(row['pre_mood']),
            "energy": int(row['pre_energy']),
            "motivation": int(row['pre_motivation']),
            "goal_difficulty": int(row['pre_goal_difficulty']),
            "environment": row['pre_environment'],
            "music_type": row['pre_music_type'] if pd.notna(row['pre_music_type']) else None,
            "created_at": now,
        })
    
    # Drop duplicates by session_id (keep first occurrence)
    seen_sessions = set()
    unique_records = []
    for record in pre_survey_records:
        if record["session_id"] not in seen_sessions:
            seen_sessions.add(record["session_id"])
            unique_records.append(record)
    
    print(f"  Dropped {len(pre_survey_records) - len(unique_records)} duplicate pre-surveys")
    
    # Insert in batches
    for i in range(0, len(unique_records), 100):
        batch = unique_records[i:i+100]
        response = supabase.table("pre_surveys").insert(batch).execute()
        print(f"  ✓ Loaded pre-surveys {i+1}-{min(i+100, len(unique_records))}")


def load_passive_signals(df: pd.DataFrame, session_id_map: dict):
    """Load passive signals data"""
    global supabase
    
    print("\n[4/5] Loading passive signals...")
    
    passive_records = []
    now = datetime.now().isoformat()
    for idx, row in df.iterrows():
        key = (row['user_id'], str(row['start_time']))
        if key not in session_id_map:
            continue
        
        passive_records.append({
            "id": str(uuid.uuid4()),
            "session_id": session_id_map[key],
            "notification_count": int(row['notification_count']),
            "distraction_taps": int(row['distraction_taps']),
            "unlock_count": int(row['unlock_count']),
            "recorded_at": now,
        })
    
    # Insert in batches
    for i in range(0, len(passive_records), 100):
        batch = passive_records[i:i+100]
        response = supabase.table("passive_signals").insert(batch).execute()
        print(f"  ✓ Loaded passive signals {i+1}-{min(i+100, len(passive_records))}")


def load_post_surveys(df: pd.DataFrame, session_id_map: dict):
    """Load post-session surveys"""
    global supabase
    
    print("\n[5/5] Loading post-session surveys...")
    
    post_survey_records = []
    now = datetime.now().isoformat()
    for idx, row in df.iterrows():
        key = (row['user_id'], str(row['start_time']))
        if key not in session_id_map:
            continue
        
        post_survey_records.append({
            "id": str(uuid.uuid4()),
            "session_id": session_id_map[key],
            "focus": int(row['post_focus']),
            "productivity": int(row['post_productivity']),
            "satisfaction": int(row['post_satisfaction']),
            "distraction": row['post_distraction'],
            "created_at": now,
        })
    
    # Drop duplicates by session_id (keep first occurrence)
    seen_sessions = set()
    unique_records = []
    for record in post_survey_records:
        if record["session_id"] not in seen_sessions:
            seen_sessions.add(record["session_id"])
            unique_records.append(record)
    
    print(f"  Dropped {len(post_survey_records) - len(unique_records)} duplicate post-surveys")
    
    # Insert in batches
    for i in range(0, len(unique_records), 100):
        batch = unique_records[i:i+100]
        response = supabase.table("post_surveys").insert(batch).execute()
        print(f"  ✓ Loaded post-surveys {i+1}-{min(i+100, len(unique_records))}")


# ============================================
# MAIN
# ============================================

def main():
    global supabase  # Declare we'll be using the global supabase variable
    
    print("\n" + "="*70)
    print("FOCUS AI - SUPABASE DATA LOADER")
    print("="*70 + "\n")
    
    # Validate credentials (with debug output)
    SUPABASE_URL, SUPABASE_KEY = validate_and_get_credentials()
    
    # Initialize Supabase client with validated credentials
    try:
        print("🔗 Connecting to Supabase...")
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✓ Successfully connected to Supabase\n")
    except Exception as e:
        print(f"❌ Failed to connect to Supabase: {e}")
        sys.exit(1)
    
    # Load CSV
    script_dir = Path(__file__).parent.resolve()
    csv_path = script_dir / "focus_ai_sessions.csv"
    
    if not csv_path.exists():
        print(f"❌ ERROR: CSV file not found")
        print(f"   Expected: {csv_path}")
        print(f"   Available files in {script_dir}:")
        for f in script_dir.glob("*.csv"):
            print(f"     - {f.name}")
        sys.exit(1)
    
    print(f"📁 Reading: {csv_path.name}")
    df = pd.read_csv(csv_path)
    print(f"✓ Loaded {len(df)} sessions\n")
    
    # Load data into Supabase
    try:
        load_users(df)
        session_id_map, session_records = load_sessions(df)
        load_pre_surveys(df, session_id_map, session_records)
        load_passive_signals(df, session_id_map)
        load_post_surveys(df, session_id_map)
    except Exception as e:
        print(f"\n❌ ERROR during data loading: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    print("\n" + "="*70)
    print(f"✅ SUCCESS! Loaded {len(df)} sessions into Supabase")
    print("="*70 + "\n")


if __name__ == "__main__":
    main()
