"""Database engine and session management."""
from pathlib import Path

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import PROJECT_ROOT, settings

database_url = make_url(settings.DATABASE_URL)
is_sqlite = database_url.get_backend_name() == "sqlite"

if is_sqlite and database_url.database and database_url.database != ":memory:":
    database_path = Path(database_url.database)
    if not database_path.is_absolute():
        database_path = PROJECT_ROOT / database_path
    database_path.parent.mkdir(parents=True, exist_ok=True)
    database_url = database_url.set(database=database_path.as_posix())

engine = create_engine(
    database_url,
    connect_args={"check_same_thread": False, "timeout": 30} if is_sqlite else {},
    pool_pre_ping=True,
    echo=False,
)

if is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all database tables and apply lightweight additive migrations."""
    from fraudtrace.app.models import (  # noqa: F401
        user, account, transaction, allocation,
        fraud_case, fraud_alert, risk_assessment,
        freeze_request, audit_log, notification, cybercell_report, login_activity,
    )
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    migrations = (
        ("fraud_alerts", "evidence", "TEXT"),
        ("accounts", "is_frozen", "BOOLEAN DEFAULT FALSE"),
        ("accounts", "user_trace_id", "TEXT"),
        ("accounts", "bank_name", "TEXT"),
        ("accounts", "branch_name", "TEXT"),
        ("accounts", "ifsc_code", "TEXT"),
        ("risk_assessments", "alert_id", "TEXT"),
        ("risk_assessments", "case_id", "TEXT"),
        ("risk_assessments", "breakdown_json", "TEXT"),
        ("risk_assessments", "model_version", "TEXT"),
        ("transactions", "trace_id", "TEXT"),
        ("users", "date_of_birth", "TEXT"),
        ("users", "address", "TEXT"),
        ("users", "password_hash", "TEXT"),
        ("users", "two_factor_enabled", "BOOLEAN DEFAULT FALSE"),
        ("users", "kyc_status", "TEXT DEFAULT 'PENDING'"),
        ("users", "mobile_verified", "BOOLEAN DEFAULT FALSE"),
        ("users", "email_verified", "BOOLEAN DEFAULT FALSE"),
        ("users", "kyc_verified_at", "DATETIME"),
        ("users", "notification_prefs_json", "TEXT"),
        ("users", "privacy_consent", "BOOLEAN DEFAULT TRUE"),
        ("users", "data_sharing_opt_in", "BOOLEAN DEFAULT FALSE"),
    )
    with engine.begin() as conn:
        for table_name, column_name, column_type in migrations:
            if inspector.has_table(table_name):
                columns = {column["name"] for column in inspector.get_columns(table_name)}
                if column_name not in columns:
                    conn.execute(text(
                        f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"
                    ))
