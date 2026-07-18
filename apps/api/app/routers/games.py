import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import Game, SkillRating, UserGameState
from ..security import current_user_id

router = APIRouter(prefix="/v1/games", tags=["games"])


@router.get("")
async def catalog(
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    games = list((await db.execute(select(Game))).scalars())
    states = {
        s.game_id: s.difficulty
        for s in (
            await db.execute(select(UserGameState).where(UserGameState.user_id == user_id))
        ).scalars()
    }
    ratings = {
        r.domain: r
        for r in (
            await db.execute(select(SkillRating).where(SkillRating.user_id == user_id))
        ).scalars()
    }
    return [
        {
            "id": g.id,
            "domain": g.domain,
            "config": g.config,
            "difficulty": states.get(g.id, 30),
            "rating": ratings[g.domain].rating if g.domain in ratings else None,
            "rd": ratings[g.domain].rd if g.domain in ratings else None,
        }
        for g in games
    ]
