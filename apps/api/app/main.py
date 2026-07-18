from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import auth, games, leaderboards, me, sessions

app = FastAPI(title="CortexWatt API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(games.router)
app.include_router(sessions.router)
app.include_router(me.router)
app.include_router(leaderboards.router)


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True}
