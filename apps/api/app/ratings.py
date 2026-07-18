"""RatingService — staircase, Glicko-2 per domain, Cortex Index (PRD §7).

Kept behind one interface so it can move to a worker later.
# TODO: move to worker
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import glicko
from .models import CortexIndex, RatingHistory, SkillRating, UserGameState
from .specgen import GAME_DOMAINS

ALL_DOMAINS = list(dict.fromkeys(GAME_DOMAINS.values()))


def next_difficulty(current: int, performance_index: float) -> int:
    """Staircase — PRD §7."""
    if performance_index >= 0.85:
        current += 8
    elif performance_index >= 0.70:
        current += 3
    elif performance_index >= 0.50:
        pass
    else:
        current -= 6
    return max(0, min(100, current))


def norm_rating(rating: float) -> float:
    """Map 800–2200 → 0–1, clamped."""
    return min(1.0, max(0.0, (rating - 800) / 1400))


def cortex_index_value(ratings: list[SkillRating]) -> int | None:
    """CI = 1000 · Σ(w·norm(r)) / Σw, w = 1/(1 + RD/350)."""
    if not ratings:
        return None
    num = sum((1 / (1 + r.rd / 350)) * norm_rating(r.rating) for r in ratings)
    den = sum(1 / (1 + r.rd / 350) for r in ratings)
    return round(1000 * num / den) if den else None


class RatingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_state(self, user_id: uuid.UUID, game_id: str) -> UserGameState:
        state = await self.db.get(UserGameState, (user_id, game_id))
        if state is None:
            state = UserGameState(user_id=user_id, game_id=game_id, difficulty=30)
            self.db.add(state)
            await self.db.flush()
        return state

    async def get_rating(self, user_id: uuid.UUID, domain: str) -> SkillRating:
        rating = await self.db.get(SkillRating, (user_id, domain))
        if rating is None:
            rating = SkillRating(user_id=user_id, domain=domain)
            self.db.add(rating)
            await self.db.flush()
        return rating

    def preview_update(
        self, rating: SkillRating, difficulty: int, performance_index: float
    ) -> glicko.Rating:
        player = glicko.Rating(rating.rating, rating.rd, rating.volatility)
        opponent = glicko.opponent_for_difficulty(difficulty)
        return glicko.update(player, opponent, performance_index)

    async def apply_valid_session(
        self,
        user_id: uuid.UUID,
        game_id: str,
        difficulty: int,
        performance_index: float,
        new_rating: glicko.Rating,
    ) -> dict:
        domain = GAME_DOMAINS[game_id]
        state = await self.get_state(user_id, game_id)
        rating = await self.get_rating(user_id, domain)

        old = rating.rating
        state.difficulty = next_difficulty(difficulty, performance_index)
        rating.rating = new_rating.rating
        rating.rd = new_rating.rd
        rating.volatility = new_rating.volatility
        self.db.add(
            RatingHistory(
                user_id=user_id, domain=domain, rating=new_rating.rating, rd=new_rating.rd
            )
        )

        result = await self.db.execute(select(SkillRating).where(SkillRating.user_id == user_id))
        ci = cortex_index_value(list(result.scalars()))
        if ci is not None:
            self.db.add(CortexIndex(user_id=user_id, value=ci, computed_at=datetime.utcnow()))

        return {
            "domain": domain,
            "rating_change": new_rating.rating - old,
            "new_rating": new_rating.rating,
            "new_rd": new_rating.rd,
            "next_difficulty": state.difficulty,
            "cortex_index": ci,
        }
