"""Pydantic request/response schemas — PRD §10."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DevLoginRequest(BaseModel):
    handle: str = Field(min_length=2, max_length=32, pattern=r"^[a-zA-Z0-9_\-]+$")
    birth_year: int | None = Field(default=None, ge=1900, le=2020)


class DevLoginResponse(BaseModel):
    user_id: uuid.UUID
    handle: str
    token: str


class RatingSnapshot(BaseModel):
    domain: str
    rating: float
    rd: float


class GameCatalogItem(BaseModel):
    id: str
    domain: str
    name: str
    difficulty: int
    rating: float | None
    rd: float | None
    last_played: datetime | None
    best_display_score: int | None


class SessionIssueRequest(BaseModel):
    game_id: str


class SessionIssueResponse(BaseModel):
    session_id: uuid.UUID
    seed: int
    difficulty: int
    spec: dict[str, Any]
    token: str
    expires_at: datetime


class TrialIn(BaseModel):
    trial_index: int
    onset_ms: float
    response_ms: float | None
    correct: bool
    false_start: bool = False
    interrupted: bool = False
    payload: dict[str, Any] = Field(default_factory=dict)


class DeviceInfo(BaseModel):
    user_agent: str | None = None
    viewport: list[int] | None = None
    input_type: str | None = None
    device_pixel_ratio: float | None = None
    refresh_interval_ms: float | None = None
    refresh_hz: int | None = None


class ResultsSubmitRequest(BaseModel):
    token: str
    client_metrics: dict[str, Any] = Field(default_factory=dict)
    trials: list[TrialIn]
    device: DeviceInfo = Field(default_factory=DeviceInfo)


class ResultsSubmitResponse(BaseModel):
    status: str
    reason: str | None = None
    server_metrics: dict[str, Any] | None = None
    display_score: int | None = None
    rating_change: float | None = None
    new_rating: float | None = None
    new_rd: float | None = None
    next_difficulty: int | None = None
    cortex_index: int | None = None
    leaderboard_rank: int | None = None


class MeSummaryResponse(BaseModel):
    user_id: uuid.UUID
    handle: str
    ratings: list[RatingSnapshot]
    cortex_index: int | None
    ci_history: list[dict[str, Any]]
    recent_sessions: list[dict[str, Any]]
    thirty_day_averages: dict[str, dict[str, float]]
    games: list[GameCatalogItem]


class SessionDetailResponse(BaseModel):
    session_id: uuid.UUID
    game_id: str
    difficulty: int
    status: str
    server_metrics: dict[str, Any] | None
    device: dict[str, Any] | None
    submitted_at: datetime | None
    trials: list[dict[str, Any]]


class LeaderboardResponse(BaseModel):
    board: str
    period: str
    entries: list[dict[str, Any]]
    me: dict[str, Any]
