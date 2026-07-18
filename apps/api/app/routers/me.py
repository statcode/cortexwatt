"""GET /v1/me/summary and GET /v1/me/sessions/{id} — PRD §10."""

import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import CortexIndex, GameSession, SkillRating, Trial, User, UserGameState
from ..ratings import cortex_index_value
from ..schemas import GameCatalogItem, MeSummaryResponse, RatingSnapshot, SessionDetailResponse
from ..security import current_user_id
from ..specgen import GAME_DOMAINS
from ..metrics import display_score

router = APIRouter(prefix="/v1/me", tags=["me"])

GAME_NAMES = {
    "flash_point": "Flash Point",
    "vector": "Vector",
    "stackwise": "Stackwise",
    "drift_watch": "Drift Watch",
    "wide_angle": "Wide Angle",
    "echo_grid": "Echo Grid",
}


@router.get("/summary", response_model=MeSummaryResponse)
async def summary(
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
) -> MeSummaryResponse:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    ratings = list(
        (await db.execute(select(SkillRating).where(SkillRating.user_id == user_id))).scalars()
    )
    states = {
        s.game_id: s
        for s in (
            await db.execute(select(UserGameState).where(UserGameState.user_id == user_id))
        ).scalars()
    }
    ci_rows = list(
        (
            await db.execute(
                select(CortexIndex)
                .where(CortexIndex.user_id == user_id)
                .order_by(desc(CortexIndex.computed_at))
                .limit(60)
            )
        ).scalars()
    )
    sessions = list(
        (
            await db.execute(
                select(GameSession)
                .where(GameSession.user_id == user_id, GameSession.submitted_at.isnot(None))
                .order_by(desc(GameSession.submitted_at))
                .limit(200)
            )
        ).scalars()
    )

    ratings_by_domain = {r.domain: r for r in ratings}
    cutoff = datetime.utcnow() - timedelta(days=30)

    # 30-day per-game averages for results-screen deltas.
    averages: dict[str, dict[str, float]] = {}
    for game_id in GAME_DOMAINS:
        recent = [
            s
            for s in sessions
            if s.game_id == game_id
            and s.status == "valid"
            and s.submitted_at
            and s.submitted_at >= cutoff
            and s.server_metrics
        ]
        if not recent:
            continue
        keys = ["accuracy", "median_rt_ms", "rt_iqr_ms", "performance_index"]
        agg: dict[str, float] = {}
        for k in keys:
            vals = [s.server_metrics[k] for s in recent if s.server_metrics.get(k) is not None]
            if vals:
                agg[k] = sum(vals) / len(vals)
        averages[game_id] = agg

    last_played: dict[str, datetime] = {}
    best_scores: dict[str, int] = {}
    for s in sessions:
        if s.status != "valid" or not s.submitted_at or not s.server_metrics:
            continue
        last_played.setdefault(s.game_id, s.submitted_at)
        sc = display_score(s.server_metrics["performance_index"], s.difficulty)
        if sc > best_scores.get(s.game_id, -1):
            best_scores[s.game_id] = sc

    games = [
        GameCatalogItem(
            id=game_id,
            domain=domain,
            name=GAME_NAMES[game_id],
            difficulty=states[game_id].difficulty if game_id in states else 30,
            rating=ratings_by_domain[domain].rating if domain in ratings_by_domain else None,
            rd=ratings_by_domain[domain].rd if domain in ratings_by_domain else None,
            last_played=last_played.get(game_id),
            best_display_score=best_scores.get(game_id),
        )
        for game_id, domain in GAME_DOMAINS.items()
    ]

    return MeSummaryResponse(
        user_id=user_id,
        handle=user.handle,
        ratings=[RatingSnapshot(domain=r.domain, rating=r.rating, rd=r.rd) for r in ratings],
        cortex_index=cortex_index_value(ratings),
        ci_history=[
            {"value": c.value, "at": c.computed_at.isoformat()} for c in reversed(ci_rows)
        ],
        recent_sessions=[
            {
                "session_id": str(s.id),
                "game_id": s.game_id,
                "status": s.status,
                "difficulty": s.difficulty,
                "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
                "server_metrics": s.server_metrics,
            }
            for s in sessions[:20]
        ],
        thirty_day_averages=averages,
        games=games,
    )


@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
async def session_detail(
    session_id: uuid.UUID,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
) -> SessionDetailResponse:
    session = await db.get(GameSession, session_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")
    trials = list(
        (
            await db.execute(
                select(Trial).where(Trial.session_id == session_id).order_by(Trial.trial_index)
            )
        ).scalars()
    )
    return SessionDetailResponse(
        session_id=session.id,
        game_id=session.game_id,
        difficulty=session.difficulty,
        status=session.status,
        server_metrics=session.server_metrics,
        device=session.device,
        submitted_at=session.submitted_at,
        trials=[
            {
                "trial_index": t.trial_index,
                "onset_ms": t.onset_ms,
                "response_ms": t.response_ms,
                "correct": t.correct,
                "false_start": t.false_start,
                "interrupted": t.interrupted,
                "payload": t.payload,
            }
            for t in trials
        ],
    )
