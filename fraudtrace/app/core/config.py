"""Application configuration."""
from pathlib import Path

from pydantic_settings import BaseSettings


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATABASE_PATH = PROJECT_ROOT / "data" / "fraudtrace.db"


class Settings(BaseSettings):
    APP_NAME: str = "FraudTrace"
    APP_VERSION: str = "0.1.0"
    APP_ENV: str = "development"
    DEBUG: bool = True
    # Keep the default database in the project even when uvicorn is started
    # from a different working directory.
    DATABASE_URL: str = f"sqlite:///{DEFAULT_DATABASE_PATH.as_posix()}"
    SECRET_KEY: str = "dev-secret-key-change-in-production"

    # Fraud detection thresholds
    HIGH_AMOUNT_THRESHOLD: int = 5000000  # in paise (₹50,000)
    VELOCITY_WINDOW_SECONDS: int = 300
    VELOCITY_MAX_TRANSACTIONS: int = 5
    FANOUT_WINDOW_SECONDS: int = 3600
    FANOUT_THRESHOLD: int = 5
    FANIN_WINDOW_SECONDS: int = 3600
    FANIN_THRESHOLD: int = 5
    PASSTHROUGH_WINDOW_SECONDS: int = 300
    PASSTHROUGH_THRESHOLD_RATIO: float = 0.8

    # Allocation policy: FRAUD_FIRST, FIFO, PROPORTIONAL
    ALLOCATION_POLICY: str = "FRAUD_FIRST"

    # Risk scoring weights
    RISK_WEIGHT_VELOCITY: float = 0.15
    RISK_WEIGHT_FANIN: float = 0.15
    RISK_WEIGHT_FANOUT: float = 0.15
    RISK_WEIGHT_PASSTHROUGH: float = 0.20
    RISK_WEIGHT_AMOUNT: float = 0.15
    RISK_WEIGHT_NEW_RECIPIENT: float = 0.10
    RISK_WEIGHT_TIMING: float = 0.10

    # Investigation priority weights
    PRIORITY_WEIGHT_AMOUNT: float = 0.25
    PRIORITY_WEIGHT_RISK: float = 0.30
    PRIORITY_WEIGHT_TRACEABLE: float = 0.20
    PRIORITY_WEIGHT_URGENCY: float = 0.25

    class Config:
        env_file = PROJECT_ROOT / ".env"
        extra = "ignore"


settings = Settings()
