"""Test fixtures: in-memory SQLite DB + fakeredis, app dependency overrides."""

import asyncio

import fakeredis.aioredis
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app import leaderboard
from app.db import get_db
from app.main import app
from app.models import Base, Game
from app.specgen import GAME_DOMAINS


@pytest_asyncio.fixture
async def db_engine():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_engine, monkeypatch):
    SessionTest = async_sessionmaker(db_engine, expire_on_commit=False)

    async def override_get_db():
        async with SessionTest() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(leaderboard, "get_redis", lambda: fake)

    # seed games
    async with SessionTest() as s:
        for game_id, domain in GAME_DOMAINS.items():
            s.add(Game(id=game_id, domain=domain, config={}))
        await s.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()


async def login(client: AsyncClient, handle: str = "tester") -> str:
    res = await client.post("/v1/auth/dev-login", json={"handle": handle})
    assert res.status_code == 200
    return res.json()["token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def bot_flash_point(spec: dict, rt_median: float = 260.0, fs_rate: float = 0.0,
                    interrupted_rate: float = 0.0, seed: int = 7) -> list[dict]:
    """Deterministic simple bot for contract tests."""
    import random

    rng = random.Random(seed)
    trials = []
    clock = 1000.0
    for i, t in enumerate(spec["trials"]):
        clock += t["foreperiod_ms"] + 400
        onset = clock
        if rng.random() < fs_rate:
            trials.append(dict(trial_index=i, onset_ms=onset, response_ms=onset - 120,
                               correct=False, false_start=True, interrupted=False, payload={}))
            continue
        rt = rt_median * (0.85 + rng.random() * 0.4)
        hit = rt <= spec["response_window_ms"]
        trials.append(dict(trial_index=i, onset_ms=onset,
                           response_ms=onset + rt if hit else None, correct=hit,
                           false_start=False,
                           interrupted=rng.random() < interrupted_rate, payload={}))
        clock = onset + min(rt, spec["response_window_ms"])
    return trials
