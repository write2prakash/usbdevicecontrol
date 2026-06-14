import os
from pydantic import AnyHttpUrl
from typing import List


class Settings:
    def __init__(self):
        self.app_name: str = os.getenv("APP_NAME", "USB Control SaaS")
        cors = os.getenv("BACKEND_CORS_ORIGINS", "http://localhost:3000")
        try:
            self.backend_cors_origins: List[AnyHttpUrl] = [AnyHttpUrl(url) for url in cors.split(",")]
        except Exception:
            self.backend_cors_origins = ["http://localhost:3000"]
        self.database_url: str = os.getenv("DATABASE_URL", "sqlite:///./usb_control.db")
        self.jwt_secret: str = os.getenv("JWT_SECRET", "please-change-this-secret")
        self.jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
        self.access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
        self.refresh_token_expire_days: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
        self.install_token_expire_hours: int = int(os.getenv("INSTALL_TOKEN_EXPIRE_HOURS", "24"))
        self.smtp_host: str = os.getenv("SMTP_HOST", "smtp.example.com")
        self.smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user: str = os.getenv("SMTP_USER", "noreply@example.com")
        self.smtp_password: str = os.getenv("SMTP_PASSWORD", "")
        self.email_from: str = os.getenv("EMAIL_FROM", "noreply@example.com")
        self.superadmin_email: str = os.getenv("SUPERADMIN_EMAIL", "superadmin@example.com")


settings = Settings()
