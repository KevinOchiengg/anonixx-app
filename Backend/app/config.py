from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE), env_file_encoding="utf-8", case_sensitive=False,
        # .env also holds keys for local tools (agent login, Cloudinary); ignore them here.
        extra="ignore",
    )

    APP_NAME: str = "anonixx"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    # CLOUDFLARE R2 — S3-compatible object storage, no content-policy scanning.
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = ""
    R2_ENDPOINT: str = ""
    R2_PUBLIC_URL: str = ""

    # CLOUDFLARE STREAM — video encoding, cutting, watermark, adaptive playback.
    # Off (videos go to R2 as before) until the token and account id are set.
    CF_ACCOUNT_ID: str = ""
    CF_STREAM_TOKEN: str = ""          # API token with Stream: Edit
    STREAM_WATERMARK_UID: str = ""     # from scripts/stream_setup.py

    # AUTH
    SECRET_KEY: str = (
        "your-super-secret-key-change-in-production-at-least-32-characters-long"
    )
    JWT_ALGORITHM: str = "HS256"
    # Long-lived (30 days): the app has no refresh-token flow.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30

    # Comma-separated emails of super admins (must also have is_admin=True).
    SUPER_ADMIN_EMAILS: str = ""

    # GOOGLE SIGN-IN: comma-separated OAuth client IDs allowed to sign users in
    # (web client ID, plus the Android/iOS ones when the app adds Google sign-in).
    GOOGLE_CLIENT_IDS: str = ""

    # DATABASE
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "anonixx"

    # WHATSAPP CLOUD API — anonymous "send a drop to someone" relay
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_ACCESS_TOKEN: str = ""
    WHATSAPP_VERIFY_TOKEN: str = ""
    WHATSAPP_APP_SECRET: str = ""
    WHATSAPP_TEMPLATE_NAME: str = "anonixx_message_request"
    WHATSAPP_TEMPLATE_LANG: str = "en"

    # STRIPE
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # APPLE / GOOGLE — In-App Purchase validation (required for App Store + Play Store)
    APPLE_SHARED_SECRET: str = ""
    GOOGLE_PLAY_PACKAGE_NAME: str = "com.anonixx.app"
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: str = ""    # raw JSON or absolute path

    # M-PESA (Safaricom Daraja)
    MPESA_CONSUMER_KEY: str = ""
    MPESA_CONSUMER_SECRET: str = ""
    MPESA_SHORTCODE: str = "174379"
    MPESA_PASSKEY: str = ""
    MPESA_ENVIRONMENT: str = "sandbox"  # sandbox | production
    MPESA_CALLBACK_URL: str = "http://localhost:8000/api/v1/payments/mpesa/callback"

    # AGORA: voice/video calls (app/api/v1/drop_calls.py)
    AGORA_APP_ID: str = ""
    AGORA_APP_CERTIFICATE: str = ""

    # WEB PUSH (VAPID) — browser notifications for the Anonixx website
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_SUBJECT: str = "mailto:support@anonixx.com"

    # ANTHROPIC (guided confession writer — app/services/confession_writer.py).
    # Server-side only; leave empty to switch the AI writer off.
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-opus-5-5"

    # ADMIN DIGEST + ALERTS (app/tasks/admin_monitor.py). Hour in UTC for the morning
    # summary email/push to super admins; 5 = 08:00 in East Africa.
    ADMIN_DIGEST_HOUR_UTC: int = 5

    # AGENT HUB: GitHub token with Contents read+write, to read reports and save decisions.
    GITHUB_TOKEN: str = ""
    GITHUB_REPO: str = "KevinOchiengg/anonixx-app"
    GITHUB_BRANCH: str = "main"

    # RESEND (email)
    RESEND_API_KEY: str = ""
    FROM_EMAIL: str = "Anonixx <noreply@anonixx.com>"

    # ── SOCIAL PUBLISHER ──────────────────────────────────────────
    # TikTok access token (scopes: video.publish, video.upload)
    TIKTOK_ACCESS_TOKEN: str = "your-tiktok-access-token-here"

    # Facebook Page access token (pages_manage_posts, pages_read_engagement)
    FACEBOOK_PAGE_ID:           str = "your-facebook-page-id-here"
    FACEBOOK_PAGE_ACCESS_TOKEN: str = "your-facebook-page-access-token-here"

    # Instagram business account linked to the Facebook Page (uses the same token)
    INSTAGRAM_ACCOUNT_ID: str = "your-instagram-account-id-here"

    # Telegram — Bot API token + the Anonixx channel it posts into
    # Create a bot via @BotFather, add it as admin to the channel
    TELEGRAM_BOT_TOKEN:  str = "your-telegram-bot-token-here"
    TELEGRAM_CHANNEL_ID: str = "your-telegram-channel-id-here"  # e.g. "@anonixx" or "-100123456789"

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
