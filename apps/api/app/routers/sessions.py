"""Session protocol — PRD §3: issue → play → submit → validate → rate."""

import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from .. import leaderboard
from ..config import settings
from ..db import get_db
from ..metrics import compute_metrics, display_score
from ..models import Game, GameSession, Trial
from ..ratings import RatingService
from ..schemas import ResultsSubmitRequest, ResultsSubmitResponse, SessionIssueRequest, SessionIssueResponse
from ..security import current_user_id, session_token, verify_session_token
from ..specgen import generate, spec_hash
from ..validation import rating_jump_guard, run_gates

router = APIRouter(prefix="/v1/sessions", tags=["sessions"])

REJECTED_COPY = "This session couldn't be validated and won't count."


@router.post("", response_model=SessionIssueResponse)
async def issue_session(
    body: SessionIssueRequest,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
) -> SessionIssueResponse:
    game = await db.get(Game, body.game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Unknown game")
    if not await leaderboard.check_rate_limit(user_id):
        raise HTTPException(status_code=429, detail="Session issue rate limit reached")

    svc = RatingService(db)
    state = await svc.get_state(user_id, body.game_id)
    difficulty = state.difficulty
    seed = secrets.randbits(48)
    spec = generate(body.game_id, seed, difficulty)
    h = spec_hash(spec)

    session = GameSession(
        user_id=user_id,
        game_id=body.game_id,
        seed=seed,
        difficulty=difficulty,
        spec_hash=h,
        status="issued",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return SessionIssueResponse(
        session_id=session.id,
        seed=seed,
        difficulty=difficulty,
        spec=spec,
        token=session_token(session.id, user_id, h),
        expires_at=session.issued_at + timedelta(minutes=settings.session_ttl_minutes),
    )


@router.post("/{session_id}/results", response_model=ResultsSubmitResponse)
async def submit_results(
    session_id: uuid.UUID,
    body: ResultsSubmitRequest,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
) -> ResultsSubmitResponse:
    session = await db.get(GameSession, session_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")

    # Gate 1 — token / expiry / one submission only.
    if not verify_session_token(body.token, session.id, user_id, session.spec_hash):
        raise HTTPException(status_code=401, detail="Invalid session token")
    if session.status != "issued":
        raise HTTPException(status_code=409, detail="Session already submitted")
    if datetime.utcnow() > session.issued_at + timedelta(minutes=settings.session_ttl_minutes):
        session.status = "rejected"
        await db.commit()
        return ResultsSubmitResponse(status="rejected", reason="expired")

    # Gate 2 — spec hash must regenerate identically.
    spec = generate(session.game_id, session.seed, session.difficulty)
    if spec_hash(spec) != session.spec_hash:
        session.status = "rejected"
        await db.commit()
        return ResultsSubmitResponse(status="rejected", reason="spec_hash_mismatch")

    # Gates 3–7 (pure functions over raw trials; client metrics advisory only).
    raw_trials = [t.model_dump() for t in body.trials]
    gate = run_gates(session.game_id, spec, session.difficulty, raw_trials)

    session.device = body.device.model_dump()
    session.submitted_at = datetime.utcnow()

    trials = gate.trials or raw_trials
    for t in trials:
        db.add(Trial(session_id=session.id, **t))

    if gate.status == "rejected":
        session.status = "rejected"
        await db.commit()
        return ResultsSubmitResponse(status="rejected", reason=gate.reason)

    metrics = compute_metrics(session.game_id, trials)
    session.server_metrics = metrics

    if gate.status == "quarantined":
        session.status = "quarantined"
        await db.commit()
        return ResultsSubmitResponse(
            status="quarantined", reason=gate.reason, server_metrics=metrics
        )

    # Gate 8 — rating jump guard, checked against the previewed update.
    svc = RatingService(db)
    from ..specgen import GAME_DOMAINS

    rating = await svc.get_rating(user_id, GAME_DOMAINS[session.game_id])
    new_rating = svc.preview_update(rating, session.difficulty, metrics["performance_index"])
    if rating_jump_guard(rating.rd, rating.rating, new_rating.rating):
        session.status = "quarantined"
        await db.commit()
        return ResultsSubmitResponse(
            status="quarantined", reason="rating_jump", server_metrics=metrics
        )

    # Valid — apply staircase, Glicko-2, Cortex Index, leaderboards.
    session.status = "valid"
    applied = await svc.apply_valid_session(
        user_id, session.game_id, session.difficulty, metrics["performance_index"], new_rating
    )
    score = display_score(metrics["performance_index"], session.difficulty)
    await db.commit()

    await leaderboard.submit_score(session.game_id, user_id, score)
    if applied["cortex_index"] is not None:
        await leaderboard.set_ci(user_id, applied["cortex_index"])
    rank = await leaderboard.rank_of(session.game_id, user_id)

    return ResultsSubmitResponse(
        status="valid",
        server_metrics=metrics,
        display_score=score,
        rating_change=applied["rating_change"],
        new_rating=applied["new_rating"],
        new_rd=applied["new_rd"],
        next_difficulty=applied["next_difficulty"],
        cortex_index=applied["cortex_index"],
        leaderboard_rank=rank,
    )
