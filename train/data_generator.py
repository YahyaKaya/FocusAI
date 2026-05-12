"""
Focus AI Synthetic Data Generator - Updated for Prisma Schema

Generates realistic synthetic data for the Focus AI study session tracking system.
- 20 users with realistic behavioral profiles
- 100 sessions per user (consistent patterns)
- Data matches Prisma schema from backend

Generated CSV files ready for Supabase insertion.
"""

import random
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import List, Dict, Tuple
import uuid

# ============================================
# USER BEHAVIOR PROFILES
# ============================================

@dataclass
class UserProfile:
    """Represents a user's stable behavioral characteristics"""
    user_id: str
    name: str
    base_motivation: float
    base_focus_ability: float
    is_night_owl: bool
    is_easily_distracted: bool
    consistency_factor: float
    
    # Derived characteristics
    preferred_time_slots: List[str]
    preferred_session_types: Dict[str, float]  # type -> preference weight
    env_preference: Dict[str, float]
    distraction_tendency: float


class UserGenerator:
    """Generate diverse, realistic user profiles"""
    
    USER_ARCHETYPES = [
        {
            "name": "Night Owl",
            "base_motivation": 3.5,
            "base_focus_ability": 3.8,
            "is_night_owl": True,
            "is_easily_distracted": False,
            "consistency_factor": 0.75,
            "count": 3
        },
        {
            "name": "Highly Motivated",
            "base_motivation": 4.7,
            "base_focus_ability": 4.6,
            "is_night_owl": False,
            "is_easily_distracted": False,
            "consistency_factor": 0.85,
            "count": 3
        },
        {
            "name": "Easily Distracted",
            "base_motivation": 3.0,
            "base_focus_ability": 2.5,
            "is_night_owl": False,
            "is_easily_distracted": True,
            "consistency_factor": 0.4,
            "count": 3
        },
        {
            "name": "Inconsistent",
            "base_motivation": 3.2,
            "base_focus_ability": 3.0,
            "is_night_owl": False,
            "is_easily_distracted": False,
            "consistency_factor": 0.3,
            "count": 3
        },
        {
            "name": "Disciplined",
            "base_motivation": 4.5,
            "base_focus_ability": 4.5,
            "is_night_owl": False,
            "is_easily_distracted": False,
            "consistency_factor": 0.9,
            "count": 3
        },
        {
            "name": "Early Bird",
            "base_motivation": 4.0,
            "base_focus_ability": 4.2,
            "is_night_owl": False,
            "is_easily_distracted": False,
            "consistency_factor": 0.8,
            "count": 3
        },
        {
            "name": "Social Butterfly",
            "base_motivation": 2.8,
            "base_focus_ability": 2.5,
            "is_night_owl": False,
            "is_easily_distracted": True,
            "consistency_factor": 0.5,
            "count": 2
        },
    ]
    
    @staticmethod
    def generate_users(total_users: int = 20) -> List[UserProfile]:
        """Generate a diverse set of users with realistic profiles"""
        users = []
        user_id = 0
        
        # Create users based on archetypes
        for archetype in UserGenerator.USER_ARCHETYPES:
            for i in range(archetype["count"]):
                if user_id >= total_users:
                    break
                
                # Create base profile from archetype
                profile = UserProfile(
                    user_id=str(uuid.uuid4()),
                    name=f"{archetype['name']} {i+1}",
                    base_motivation=np.clip(archetype["base_motivation"] + np.random.normal(0, 0.3), 1, 5),
                    base_focus_ability=np.clip(archetype["base_focus_ability"] + np.random.normal(0, 0.3), 1, 5),
                    is_night_owl=archetype["is_night_owl"],
                    is_easily_distracted=archetype["is_easily_distracted"],
                    consistency_factor=archetype["consistency_factor"],
                    preferred_time_slots=[],
                    preferred_session_types={},
                    env_preference={},
                    distraction_tendency=0.7 if archetype["is_easily_distracted"] else 0.3
                )
                
                # Set time preferences based on chronotype
                if profile.is_night_owl:
                    profile.preferred_time_slots = ["evening", "night"]
                    profile.preferred_session_types = {
                        "READING": 0.3,
                        "WRITING": 0.4,
                        "TEST": 0.2,
                        "OTHER": 0.1
                    }
                else:
                    profile.preferred_time_slots = ["morning", "afternoon"]
                    profile.preferred_session_types = {
                        "TEST": 0.35,
                        "READING": 0.3,
                        "WRITING": 0.25,
                        "OTHER": 0.1
                    }
                
                # Environment preferences
                if profile.is_easily_distracted:
                    profile.env_preference = {"QUIET": 0.7, "NOISY": 0.1, "MUSIC": 0.2}
                else:
                    profile.env_preference = {"QUIET": 0.4, "NOISY": 0.2, "MUSIC": 0.4}
                
                users.append(profile)
                user_id += 1
            
            if user_id >= total_users:
                break
        
        return users[:total_users]


# ============================================
# SESSION GENERATION
# ============================================

class SessionGenerator:
    """Generate realistic sessions for users"""
    
    SESSION_TYPES = ["TEST", "READING", "WRITING", "CODING", "OTHER"]
    ENVIRONMENTS = ["QUIET", "NOISY", "MUSIC"]
    MUSIC_TYPES = ["LOFI", "CLASSICAL", "AMBIENT", "OTHER", None]
    DISTRACTIONS = ["NONE", "FEW", "MANY"]
    
    @staticmethod
    def get_time_slot(hour: int) -> str:
        """Determine time slot from hour"""
        if 5 <= hour < 12:
            return "morning"
        elif 12 <= hour < 17:
            return "afternoon"
        elif 17 <= hour < 21:
            return "evening"
        else:
            return "night"
    
    @staticmethod
    def generate_sessions_for_user(
        user: UserProfile,
        num_sessions: int = 100,
        start_date: datetime = None
    ) -> List[Dict]:
        """Generate realistic sessions for a single user"""
        
        if start_date is None:
            start_date = datetime.now() - timedelta(days=180)
        
        sessions = []
        current_date = start_date
        
        for session_num in range(num_sessions):
            # Skip some days based on consistency (more consistent users session more often)
            skip_prob = 0.2 + (1 - user.consistency_factor) * 0.3
            if random.random() < skip_prob:
                current_date += timedelta(days=random.randint(0, 2))
                continue
            
            # 60% chance of sessions on preferred time slots, 40% random
            if random.random() < 0.6:
                hour = SessionGenerator._get_preferred_hour(user)
            else:
                hour = random.randint(5, 23)
            
            # Pre-session survey
            pre_session = SessionGenerator._generate_pre_session(user, hour)
            
            # Session timing
            start_time = current_date.replace(hour=hour, minute=random.randint(0, 59))
            
            # Actual duration
            planned = pre_session["planned_duration"]
            adherence = user.consistency_factor if not user.is_easily_distracted else 0.5
            actual_duration = int(np.clip(
                np.random.normal(planned, planned * (1 - adherence)),
                planned * 0.5,
                planned * 1.5
            ))
            
            end_time = start_time + timedelta(minutes=actual_duration)
            
            # Breaks and pauses (more for easily distracted)
            if user.is_easily_distracted:
                pause_count = max(0, int(np.random.normal(4, 2)))
                total_break_mins = max(0, int(np.random.normal(15, 5)))
            else:
                pause_count = max(0, int(np.random.normal(1.5, 1)))
                total_break_mins = max(0, int(np.random.normal(5, 3)))
            
            # Passive signals (distractions)
            if user.is_easily_distracted:
                notification_count = np.random.poisson(8)
                distraction_taps = np.random.poisson(12)
                unlock_count = np.random.poisson(5)
            else:
                notification_count = np.random.poisson(2)
                distraction_taps = np.random.poisson(2)
                unlock_count = np.random.poisson(1)
            
            # Post-session survey
            post_session = SessionGenerator._generate_post_session(
                user,
                pre_session,
                {
                    "pause_count": pause_count,
                    "total_break_mins": total_break_mins,
                    "notification_count": notification_count,
                    "distraction_taps": distraction_taps,
                    "unlock_count": unlock_count,
                    "actual_duration": actual_duration,
                    "planned_duration": planned
                }
            )
            
            session = {
                "user_id": user.user_id,
                "user_name": user.name,
                "session_number": session_num + 1,
                "hour": hour,
                "time_slot": SessionGenerator.get_time_slot(hour),
                "status": "COMPLETED",
                "start_time": start_time,
                "end_time": end_time,
                "planned_duration": planned,
                "actual_duration": actual_duration,
                "pause_count": pause_count,
                "total_break_mins": total_break_mins,
                "productivity_score": post_session["productivity_score"],
                # Pre-survey fields
                "pre_mood": pre_session["mood"],
                "pre_energy": pre_session["energy"],
                "pre_motivation": pre_session["motivation"],
                "pre_goal_difficulty": pre_session["goal_difficulty"],
                "pre_session_type": pre_session["session_type"],
                "pre_environment": pre_session["environment"],
                "pre_music_type": pre_session["music_type"],
                # Passive signals
                "notification_count": notification_count,
                "distraction_taps": distraction_taps,
                "unlock_count": unlock_count,
                # Post-survey fields
                "post_productivity": post_session["productivity"],
                "post_focus": post_session["focus"],
                "post_satisfaction": post_session["satisfaction"],
                "post_distraction": post_session["distractions"],
            }
            
            sessions.append(session)
            current_date += timedelta(days=random.randint(0, 1))
        
        return sessions
    
    @staticmethod
    def _get_preferred_hour(user: UserProfile) -> int:
        """Generate hour based on user's chronotype preference"""
        if user.is_night_owl:
            # Night owls prefer evening/night
            hour = random.choices(
                [random.randint(17, 23), random.randint(5, 12)],
                weights=[0.8, 0.2]
            )[0]
        else:
            # Early birds prefer morning/afternoon
            hour = random.choices(
                [random.randint(5, 12), random.randint(12, 17)],
                weights=[0.6, 0.4]
            )[0]
        return hour
    
    @staticmethod
    def _generate_pre_session(user: UserProfile, hour: int) -> Dict:
        """Generate pre-session survey responses"""
        time_slot = SessionGenerator.get_time_slot(hour)
        
        # Motivation varies with time of day and user base
        base_motivation = user.base_motivation
        if user.is_night_owl and time_slot in ["evening", "night"]:
            base_motivation += 0.8
        elif not user.is_night_owl and time_slot in ["morning"]:
            base_motivation += 0.6
        elif time_slot == "night":
            base_motivation -= 0.5
        
        motivation = int(np.clip(np.random.normal(base_motivation, 0.8), 1, 5))
        
        # Energy decays throughout the day
        if time_slot == "morning":
            energy = int(np.clip(np.random.normal(4.2, 0.7), 1, 5))
        elif time_slot == "afternoon":
            energy = int(np.clip(np.random.normal(3.5, 0.8), 1, 5))
        else:
            energy = int(np.clip(np.random.normal(2.8, 0.9), 1, 5))
        
        # Other factors
        mood = int(np.clip(np.random.normal(3.2, 1.0), 1, 5))
        goal_difficulty = int(np.clip(np.random.normal(3.0, 1.2), 1, 5))
        
        # Session type based on preference
        session_type = random.choices(
            list(user.preferred_session_types.keys()),
            weights=list(user.preferred_session_types.values())
        )[0]
        
        # Environment preference
        env = random.choices(
            list(user.env_preference.keys()),
            weights=list(user.env_preference.values())
        )[0]
        
        music_type = None
        if env == "MUSIC":
            music_type = random.choice([mt for mt in SessionGenerator.MUSIC_TYPES if mt is not None])
        
        planned_duration = random.choices(
            [25, 45, 60, 90, 120],
            weights=[0.2, 0.3, 0.25, 0.15, 0.1]
        )[0]
        
        return {
            "mood": mood,
            "energy": energy,
            "motivation": motivation,
            "goal_difficulty": goal_difficulty,
            "session_type": session_type,
            "environment": env,
            "music_type": music_type,
            "planned_duration": planned_duration
        }
    
    @staticmethod
    def _generate_post_session(
        user: UserProfile,
        pre_session: Dict,
        telemetry: Dict
    ) -> Dict:
        """Generate post-session survey and compute productivity score"""
        
        # Focus: influenced by distractions, motivation, energy
        distraction_score = (
            telemetry["notification_count"] +
            telemetry["distraction_taps"] +
            telemetry["unlock_count"]
        ) / 3.0
        
        base_focus = user.base_focus_ability + (pre_session["motivation"] - 3) * 0.3
        focus = int(np.clip(base_focus - (distraction_score / 20.0), 1, 5))
        focus = np.clip(focus, 1, 5)
        
        # Productivity
        planned = telemetry["planned_duration"]
        actual = telemetry["actual_duration"]
        duration_efficiency = 1.0 if abs(actual - planned) < planned * 0.2 else 0.7
        
        base_productivity = (pre_session["motivation"] + pre_session["energy"]) / 2.0
        productivity = int(np.clip(base_productivity + (focus - 3) * 0.2, 1, 5))
        productivity = np.clip(productivity, 1, 5)
        
        # Satisfaction
        satisfaction = int(np.clip(
            productivity - (pre_session["goal_difficulty"] - 3) * 0.2,
            1, 5
        ))
        satisfaction = np.clip(satisfaction, 1, 5)
        
        # Distractions assessment
        if distraction_score < 3:
            distractions = "NONE"
        elif distraction_score < 8:
            distractions = "FEW"
        else:
            distractions = "MANY"
        
        # ============================================
        # PRODUCTIVITY SCORE FORMULA (0-100)
        # ============================================
        focus_score = (focus / 5.0) * 100
        productivity_score = (productivity / 5.0) * 100
        satisfaction_score = (satisfaction / 5.0) * 100
        
        distraction_ratio = min(1.0, distraction_score / 15.0)
        distraction_penalty = distraction_ratio * 30
        
        duration_ratio = 1.0 - min(0.5, abs(actual - planned) / planned)
        duration_bonus = (duration_ratio - 0.5) * 20
        
        pause_penalty = min(10, telemetry["pause_count"] * 2.5)
        break_quality = max(-5, 10 - (telemetry["total_break_mins"] / 2.0))
        
        final_score = (
            focus_score * 0.25 +
            productivity_score * 0.3 +
            satisfaction_score * 0.25 +
            50 * 0.2 +
            duration_bonus -
            distraction_penalty -
            pause_penalty +
            break_quality
        )
        
        final_score = np.clip(final_score, 0, 100)
        
        return {
            "focus": int(focus),
            "productivity": int(productivity),
            "satisfaction": int(satisfaction),
            "distractions": distractions,
            "productivity_score": round(final_score, 2)
        }


# ============================================
# DATA GENERATION ORCHESTRATION
# ============================================

def generate_dataset(
    num_users: int = 20,
    sessions_per_user: int = 100,
) -> Tuple[pd.DataFrame, List[UserProfile]]:
    """
    Generate complete synthetic dataset
    
    Args:
        num_users: Number of users to generate
        sessions_per_user: Sessions per user
    
    Returns:
        DataFrame with all sessions and list of user profiles
    """
    
    print(f"\n📊 Generating {num_users} users with {sessions_per_user} sessions each...\n")
    users = UserGenerator.generate_users(num_users)
    
    all_sessions = []
    
    for i, user in enumerate(users, 1):
        print(f"  [{i:2d}/{len(users)}] {user.name:30s} → ", end="", flush=True)
        sessions = SessionGenerator.generate_sessions_for_user(user, sessions_per_user)
        all_sessions.extend(sessions)
        print(f"{len(sessions)} sessions")
    
    df = pd.DataFrame(all_sessions)
    
    print(f"\n{'='*70}")
    print("DATASET STATISTICS")
    print(f"{'='*70}")
    print(f"  Total Sessions:        {len(df):,}")
    print(f"  Total Users:           {df['user_id'].nunique()}")
    print(f"  Date Range:            {df['start_time'].min().date()} → {df['start_time'].max().date()}")
    print(f"  Productivity Score:    {df['productivity_score'].min():.1f} - {df['productivity_score'].max():.1f}")
    print(f"  Avg Productivity:      {df['productivity_score'].mean():.1f}")
    print(f"  Std Deviation:         {df['productivity_score'].std():.1f}")
    print(f"{'='*70}\n")
    
    return df, users


def save_to_csv(df: pd.DataFrame, output_dir: str = ".", prefix: str = "focus_ai"):
    """Save generated data to CSV files"""
    
    sessions_path = f"{output_dir}/{prefix}_sessions.csv"
    df.to_csv(sessions_path, index=False)
    print(f"✓ Saved: {prefix}_sessions.csv ({len(df)} rows)")
    
    # User summary
    user_stats = df.groupby('user_name').agg({
        'productivity_score': ['mean', 'std', 'min', 'max', 'count'],
        'actual_duration': ['mean'],
        'post_focus': ['mean'],
        'pre_motivation': ['mean'],
    }).round(2)
    
    user_stats_path = f"{output_dir}/{prefix}_user_stats.csv"
    user_stats.to_csv(user_stats_path)
    print(f"✓ Saved: {prefix}_user_stats.csv")


# ============================================
# MAIN
# ============================================

if __name__ == "__main__":
    print("\n" + "="*70)
    print("FOCUS AI - SYNTHETIC DATA GENERATOR")
    print("="*70)
    
    # Generate data: 20 users, 100 sessions each
    df, users = generate_dataset(num_users=20, sessions_per_user=100)
    
    # Save to CSV
    save_to_csv(df, ".", "focus_ai")
    
    # Print sample
    print("\n" + "="*70)
    print("SAMPLE SESSIONS (5 random)")
    print("="*70 + "\n")
    
    sample = df.sample(min(5, len(df)), random_state=42).sort_values('user_name')
    for idx, row in sample.iterrows():
        print(f"User: {row['user_name']:20s} | {row['start_time'].strftime('%Y-%m-%d %H:%M')}")
        print(f"  Pre:  Mood {row['pre_mood']}/5 | Energy {row['pre_energy']}/5 | Motivation {row['pre_motivation']}/5 | Type: {row['pre_session_type']}")
        print(f"  Session: {row['actual_duration']} min (planned {row['planned_duration']} min) | Pauses: {row['pause_count']}")
        print(f"  Post: Focus {row['post_focus']}/5 | Productivity {row['post_productivity']}/5 | Score: {row['productivity_score']:.1f}/100")
        print()
