"""Seed the games table — `make seed`."""

import asyncio

from sqlalchemy import select

from .db import SessionLocal
from .models import Game
from .specgen import GAME_DOMAINS


async def seed() -> None:
    async with SessionLocal() as db:
        existing = {g.id for g in (await db.execute(select(Game))).scalars()}
        for game_id, domain in GAME_DOMAINS.items():
            if game_id not in existing:
                db.add(Game(id=game_id, domain=domain, config={}))
        await db.commit()
    print(f"Seeded games: {', '.join(GAME_DOMAINS)}")


if __name__ == "__main__":
    asyncio.run(seed())
