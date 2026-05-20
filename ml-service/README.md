# Focus AI — ML Service

FastAPI service that generates personalized study session recommendations using XGBoost + heuristic fallback.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check + model status |
| POST | `/generate-recommendation` | Generate recommendation for a user |
| POST | `/retrain` | Retrain model on latest DB data |

## How it works

1. **On startup**: loads persisted model from disk (if exists), then trains fresh on all DB sessions.
2. **On `/generate-recommendation`**: fetches user's session history. If < 5 sessions with full survey data → returns `not_enough_data`. Otherwise runs XGBoost (if ≥ 10 sessions) or heuristic analysis.
3. **Model**: Global XGBoost trained on all users. Personalized via 70/30 blend of model prediction + user's own historical averages per environment and session type.
4. **Heuristic fallback**: pure groupby statistics — finds best daypart, duration bracket, environment, music type by average productivity score.

## Local setup

```powershell
cd ml-service
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Fill in SUPABASE_SERVICE_KEY in .env
uvicorn app.main:app --reload --port 8000
```

## Deploy to Railway

```powershell
# From ml-service/ directory
railway up
```

Set environment variables in Railway dashboard:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` (use service role key, not anon key)

## Request format

```json
POST /generate-recommendation
{
  "user_id": "47f669be-33b6-409e-914f-8d665feb4e37"
}
```

## Response format

```json
{
  "user_id": "...",
  "status": "ok",
  "sessions_analyzed": 42,
  "method": "xgboost",
  "suggested_settings": {
    "session_type": "CODING",
    "duration_minutes": 60,
    "environment": "home",
    "music_type": "lofi",
    "time_window": "17:00–21:00",
    "daypart": "evening"
  },
  "insight": {
    "predicted_score": 78.4,
    "overall_avg_score": 64.2,
    "score_lift_pct": 22.1
  },
  "title": "Your peak: evening sessions",
  "description": "You score 22.1% higher during evening sessions. Try a 60-min session in a home environment."
}
```
