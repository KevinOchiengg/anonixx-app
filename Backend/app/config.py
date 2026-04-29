from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE), env_file_encoding="utf-8", case_sensitive=False
    )

    APP_NAME: str = "anonixx"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    # CLOUDINARY
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    # AUTH
    SECRET_KEY: str = (
        "your-super-secret-key-change-in-production-at-least-32-characters-long"
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # DATABASE
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "anonixx"

    # STRIPE
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # M-PESA (Safaricom Daraja)
    MPESA_CONSUMER_KEY: str = ""
    MPESA_CONSUMER_SECRET: str = ""
    MPESA_SHORTCODE: str = "174379"
    MPESA_PASSKEY: str = ""
    MPESA_ENVIRONMENT: str = "sandbox"  # sandbox | production
    MPESA_CALLBACK_URL: str = "http://localhost:8000/api/v1/payments/mpesa/callback"

    # AGORA
    AGORA_APP_ID: str = ""
    AGORA_APP_CERTIFICATE: str = ""

    # ANTHROPIC (AI confession refinement)
    ANTHROPIC_API_KEY: Optional[str] = None

    # RESEND (email)
    RESEND_API_KEY: str = ""
    FROM_EMAIL: str = "Anonixx <noreply@anonixx.app>"

    # ── SOCIAL PUBLISHER ──────────────────────────────────────────
    # TikTok — long-lived OAuth 2.0 access token for the Anonixx brand account
    # Obtain via: https://developers.tiktok.com/doc/login-kit-web
    # Required scopes: video.publish  video.upload
    TIKTOK_ACCESS_TOKEN: str = "your-tiktok-access-token-here"

    # Facebook Page — long-lived Page Access Token
    # Obtain via: https://developers.facebook.com/tools/explorer
    # Required permissions: pages_manage_posts  pages_read_engagement
    FACEBOOK_PAGE_ID:           str = "your-facebook-page-id-here"
    FACEBOOK_PAGE_ACCESS_TOKEN: str = "your-facebook-page-access-token-here"

    # Instagram Business Account (linked to the Facebook Page above)
    # Find it: GET /{page_id}?fields=instagram_business_account&access_token=...
    # Uses the same FACEBOOK_PAGE_ACCESS_TOKEN — no separate token needed
    INSTAGRAM_ACCOUNT_ID: str = "your-instagram-account-id-here"

    # APP
    BASE_URL: str = "http://localhost:8000"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:8081",
        "http://localhost:8080",
        "http://localhost:19006",
        "http://localhost:19000",
        "http://127.0.0.1:8081",
        "http://192.168.100.22:8081",
        "http://192.168.100.22:8000",
        "*",
    ]


settings = Settings()
