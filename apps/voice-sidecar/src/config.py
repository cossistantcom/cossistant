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

    class Config:
        env_file = ".env"


settings = Settings()
