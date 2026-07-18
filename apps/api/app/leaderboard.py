"""Weekly Redis leaderboards — PRD §9/§10.

Boards: lb:{game_id}:weekly:{iso_week} (best valid display score of the week)
and lb:ci:weekly:{iso_week} for Cortex Index.
"""

import uuid
from datetime import date

import redis.asyncio as aioredis

from .config import settings

_pool: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _pool


def iso_week(today: date | None = None) -> str:
    d = today or date.today()
    year, week, _ = d.isocalendar()
    return f"{year}-W{week:02d}"


def board_key(board: str) -> str:
    return f"lb:{board}:weekly:{iso_week()}"


async def submit_score(board: str, user_id: uuid.UUID, score: int) -> None:
    r = get_redis()
    key = board_key(board)
    # keep the best score of the week
    await r.zadd(key, {str(user_id): score}, gt=True)
    await r.expire(key, 60 * 60 * 24 * 21)


async def set_ci(user_id: uuid.UUID, value: int) -> None:
    await submit_score("ci", user_id, value)


async def top_with_rank(board: str, user_id: uuid.UUID, limit: int = 50) -> dict:
    r = get_redis()
    key = board_key(board)
    entries = await r.zrevrange(key, 0, limit - 1, withscores=True)
    rank = await r.zrevrank(key, str(user_id))
    my_score = await r.zscore(key, str(user_id))
    return {
        "period": iso_week(),
        "entries": [
            {"user_id": member, "score": int(score), "rank": i + 1}
            for i, (member, score) in enumerate(entries)
        ],
        "me": {
            "rank": rank + 1 if rank is not None else None,
            "score": int(my_score) if my_score is not None else None,
        },
    }


async def rank_of(board: str, user_id: uuid.UUID) -> int | None:
    r = get_redis()
    rank = await r.zrevrank(board_key(board), str(user_id))
    return rank + 1 if rank is not None else None


async def check_rate_limit(user_id: uuid.UUID) -> bool:
    """30 session issues/hour/user (PRD §10). True = allowed."""
    r = get_redis()
    key = f"rl:issue:{user_id}"
    count = await r.incr(key)
    if count == 1:
        await r.expire(key, 3600)
    return count <= settings.session_issues_per_hour
