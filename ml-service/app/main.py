"""
main.py — FastAPI ML service for Focus AI
"""
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

from app.data import fetch_user_sessions
from app.model import (
    generate_recommendation,
    load_model_from_disk,
    train_global_model,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load persisted model if exists, else train fresh
    load_model_from_disk()
    try:
        train_global_model()
    except Exception as e:
        logger.warning("Startup training failed: %s — will use heuristics", e)
    yield


app = FastAPI(title="Focus AI ML Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Display label maps ───────────────────────────────────────────────────────

ENV_LABELS = {
    "QUIET": "quiet environment",
    "MUSIC": "music-friendly environment",
    "NOISY": "noisy environment",
}
MUSIC_LABELS = {
    "AMBIENT": "ambient music",
    "LOFI": "lo-fi music",
    "CLASSICAL": "classical music",
    "OTHER": "background music",
    "none": "no music",
}
SESSION_LABELS = {
    "READING": "reading",
    "WRITING": "writing",
    "CODING": "coding",
    "TEST": "test/exam prep",
    "OTHER": "general study",
}
DAYPART_LABELS = {
    "morning": "morning", "afternoon": "afternoon",
    "evening": "evening", "night": "night", "late_night": "late night",
}

# ── Request / Response models ────────────────────────────────────────────────

class RecommendRequest(BaseModel):
    user_id: str


class RecommendResponse(BaseModel):
    user_id: str
    status: str              # "ok" | "not_enough_data"
    sessions_analyzed: int
    method: str              # "xgboost" | "heuristic" | "none"
    suggested_settings: dict | None = None
    insight: dict | None = None
    title: str
    description: str


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    from app.model import get_global_model
    return {
        "status": "ok",
        "model_loaded": get_global_model() is not None,
    }


@app.post("/generate-recommendation", response_model=RecommendResponse)
def generate(req: RecommendRequest):
    user_df = fetch_user_sessions(req.user_id, min_sessions=5)

    if user_df is None:
        return RecommendResponse(
            user_id=req.user_id,
            status="not_enough_data",
            sessions_analyzed=0,
            method="none",
            suggested_settings=None,
            insight=None,
            title="Keep going!",
            description="Complete at least 5 sessions with surveys to unlock your personalized recommendations.",
        )

    result = generate_recommendation(user_df)

    settings = result.get("suggested_settings", {})
    insight  = result.get("insight", {})
    method   = result.get("method", "heuristic")
    n        = result.get("sessions_analyzed", len(user_df))

    # Build human-readable title & description
    daypart  = settings.get("daypart", "")
    env      = settings.get("environment", "")
    duration = settings.get("duration_minutes", 60)
    lift_pct = insight.get("score_lift_pct") or insight.get("score_lift", 0)

    readable_daypart = DAYPART_LABELS.get(daypart, daypart)
    readable_env     = ENV_LABELS.get(env, env.lower())
    readable_music   = MUSIC_LABELS.get(settings.get("music_type", ""), "")
    readable_type    = SESSION_LABELS.get(settings.get("session_type", ""), "study")

    title = f"Your peak: {readable_daypart} {readable_type} sessions"
    if lift_pct and float(lift_pct) > 0:
        description = (
            f"You score {lift_pct}% higher during {readable_daypart} sessions. "
            f"Try a {duration}-min {readable_type} session in a {readable_env}"
            + (f" with {readable_music}." if readable_music else ".")
        )
    else:
        description = (
            f"Based on {n} sessions, {duration}-min {readable_type} blocks "
            f"in a {readable_env} suit your focus patterns best."
        )

    return RecommendResponse(
        user_id=req.user_id,
        status="ok",
        sessions_analyzed=n,
        method=method,
        suggested_settings=settings,
        insight=insight,
        title=title,
        description=description,
    )


@app.post("/retrain")
def retrain():
    """Trigger a full model retrain. Call this after adding significant new data."""
    try:
        model = train_global_model()
        if model is None:
            raise HTTPException(status_code=400, detail="Not enough data to train.")
        return {"status": "ok", "message": "Model retrained successfully."}
    except Exception as e:
        logger.error("Retrain failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)