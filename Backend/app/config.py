from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )

    APP_NAME: str = "anonispill"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

       #CLOUDINARY FIELDS
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    SECRET_KEY: str = "your-super-secret-key-change-in-production-at-least-32-characters-long"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "anonispill"

    # HARDCODED CORS - ALLOW ALL ORIGINS FOR DEVELOPMENT
    CORS_ORIGINS: List[str] = [
        "http://localhost:8081",
        "http://localhost:8080", 
        "http://localhost:19006",
        "http://localhost:19000",
        "http://127.0.0.1:8081",
        "http://192.168.100.22:8081",
        "http://192.168.100.22:8000",
        "*"  # Allow all origins (development only!)
    ]


settings = Settings()