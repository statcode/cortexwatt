import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import leaderboard
from ..db import get_db
from ..models import User
from ..schemas import LeaderboardResponse
from ..security import current_user_id
from ..specgen import GAME_DOMAINS

router = APIRouter(prefix="/v1/leaderboards", tags=["leaderboards"])

VALID_BOARDS = set(GAME_DOMAINS) | {"ci"}


@router.get("/{board}", response_model=LeaderboardResponse)
async def get_board(
    board: str,
    period: str = "weekly",
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
) -> LeaderboardResponse:
    if board not in VALID_BOARDS:
        raise HTTPException(status_code=404, detail="Unknown board")
    if period != "weekly":
        raise HTTPException(status_code=400, detail="Only weekly boards in MVP")

    data = await leaderboard.top_with_rank(board, user_id)

    # resolve handles for display
    ids = [uuid.UUID(e["user_id"]) for e in data["entries"]]
    handles: dict[str, str] = {}
    if ids:
        users = (await db.execute(select(User).where(User.id.in_(ids)))).scalars()
        handles = {str(u.id): u.handle for u in users}
    for e in data["entries"]:
        e["handle"] = handles.get(e["user_id"], "—")
        e["is_me"] = e["user_id"] == str(user_id)
        del e["user_id"]

    return LeaderboardResponse(board=board, period=data["period"], entries=data["entries"], me=data["me"])
