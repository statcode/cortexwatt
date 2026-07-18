from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="ignore")

    database_url: str = "mysql+aiomysql://root:root@127.0.0.1:8889/cortexwatt"
    database_url_sync: str = "mysql+pymysql://root:root@127.0.0.1:8889/cortexwatt"
    redis_url: str = "redis://127.0.0.1:6379/0"
    jwt_secret: str = "dev-jwt-secret"
    session_token_secret: str = "dev-session-token-secret"
    web_origin: str = "http://localhost:3000"

    session_ttl_minutes: int = 15
    session_issues_per_hour: int = 30


settings = Settings()
