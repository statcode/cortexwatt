"""Data model — PRD §9 (MySQL 8, Alembic-managed)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Double,
    Enum,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    TypeDecorator,
)

# SQLite only autoincrements INTEGER PKs; MySQL keeps BIGINT.
BigIntPK = BigInteger().with_variant(Integer, "sqlite")
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import BINARY


class UUIDBin(TypeDecorator):
    """UUID stored as BINARY(16); portable to SQLite BLOB for tests."""

    impl = BINARY(16)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value.bytes
        return uuid.UUID(str(value)).bytes

    def process_result_value(self, value, dialect):
        return uuid.UUID(bytes=value) if value is not None else None


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUIDBin, primary_key=True, default=uuid.uuid4)
    handle: Mapped[str] = mapped_column(String(32), unique=True)
    birth_year: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


class Game(Base):
    __tablename__ = "games"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    domain: Mapped[str] = mapped_column(String(24))
    config: Mapped[dict] = mapped_column(JSON, default=dict)


class UserGameState(Base):
    __tablename__ = "user_game_state"

    user_id: Mapped[uuid.UUID] = mapped_column(UUIDBin, ForeignKey("users.id"), primary_key=True)
    game_id: Mapped[str] = mapped_column(String(24), ForeignKey("games.id"), primary_key=True)
    difficulty: Mapped[int] = mapped_column(SmallInteger, default=30)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)


SESSION_STATUS = Enum(
    "issued", "valid", "rejected", "quarantined", "void", name="session_status"
)


class GameSession(Base):
    __tablename__ = "game_sessions"
    __table_args__ = (Index("ix_sessions_user_game_submitted", "user_id", "game_id", "submitted_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUIDBin, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDBin, ForeignKey("users.id"))
    game_id: Mapped[str] = mapped_column(String(24), ForeignKey("games.id"))
    seed: Mapped[int] = mapped_column(BigInteger)
    difficulty: Mapped[int] = mapped_column(SmallInteger)
    spec_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(SESSION_STATUS, default="issued")
    server_metrics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    device: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    issued_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(nullable=True)


class Trial(Base):
    __tablename__ = "trials"

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUIDBin, ForeignKey("game_sessions.id"), primary_key=True
    )
    trial_index: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    onset_ms: Mapped[float] = mapped_column(Double)
    response_ms: Mapped[float | None] = mapped_column(Double, nullable=True)
    correct: Mapped[bool] = mapped_column(Boolean)
    false_start: Mapped[bool] = mapped_column(Boolean, default=False)
    interrupted: Mapped[bool] = mapped_column(Boolean, default=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)


class SkillRating(Base):
    __tablename__ = "skill_ratings"

    user_id: Mapped[uuid.UUID] = mapped_column(UUIDBin, ForeignKey("users.id"), primary_key=True)
    domain: Mapped[str] = mapped_column(String(24), primary_key=True)
    rating: Mapped[float] = mapped_column(Double, default=1500.0)
    rd: Mapped[float] = mapped_column(Double, default=350.0)
    volatility: Mapped[float] = mapped_column(Double, default=0.06)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)


class RatingHistory(Base):
    __tablename__ = "rating_history"
    __table_args__ = (Index("ix_rating_history_user_domain_at", "user_id", "domain", "at"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDBin, ForeignKey("users.id"))
    domain: Mapped[str] = mapped_column(String(24))
    rating: Mapped[float] = mapped_column(Double)
    rd: Mapped[float] = mapped_column(Double)
    at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


class CortexIndex(Base):
    __tablename__ = "cortex_index"
    __table_args__ = (Index("ix_cortex_index_user_at", "user_id", "computed_at"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDBin, ForeignKey("users.id"))
    value: Mapped[int] = mapped_column(SmallInteger)
    computed_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
