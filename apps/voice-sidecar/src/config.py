from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    deepgram_api_key: str = ""
    cartesia_api_key: str = ""
    cartesia_voice_id: str = "a0e99841-438c-4a64-b679-ae501e7d6091"  # Default: Ellen
    daily_api_key: str = ""
    main_api_url: str = "http://localhost:3000"
    redis_url: str = "redis://localhost:6379"
    voice_max_duration_seconds: int = 900  # 15 min max
    voice_max_sessions_per_day: int = 3

    # Auth
    voice_api_key: str = ""
    voice_public_base_url: str = "http://localhost:8001"

    # CORS
    allowed_origins: str = "http://localhost:3000"

    # Session limits
    max_concurrent_sessions: int = 100
    session_ttl_seconds: int = 1800  # 30 min
    max_voice_duration_seconds: int = 300  # 5 min

    class Config:
        env_file = ".env"


settings = Settings()
