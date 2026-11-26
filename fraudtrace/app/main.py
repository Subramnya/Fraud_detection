"""FraudTrace - Unified Core Backend.

⚠️ SYNTHETIC PROTOTYPE - Not connected to real payment systems.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from fraudtrace.app.core.config import settings
from fraudtrace.app.core.database import init_db, SessionLocal
from fraudtrace.app.api import (
    accounts, payments, fraud, investigation, graph, freeze, reports,
    notifications, simulation, banker, cybercell, fraudster, profile,
)
from fraudtrace.app.services.ai_model_service import get_ai_live_feed

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Graph-Based Real-Time Fraud Detection and Transaction Lineage Analysis Platform. "
        "⚠️ SYNTHETIC PROTOTYPE - Not connected to real payment systems."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(accounts.router)
app.include_router(payments.router)
app.include_router(fraud.router)
app.include_router(investigation.router)
app.include_router(graph.router)
app.include_router(freeze.router)
app.include_router(reports.router)
app.include_router(notifications.router)
app.include_router(simulation.router)
app.include_router(banker.router)
app.include_router(cybercell.router)
app.include_router(fraudster.router)
app.include_router(profile.router)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/health", tags=["System"])
def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
        "warning": "SYNTHETIC PROTOTYPE - Not connected to real payment systems",
    }


@app.get("/api/system/summary", tags=["System"])
def system_summary():
    db = SessionLocal()
    try:
        accounts_count = db.execute(text("SELECT COUNT(*) FROM accounts")).scalar() or 0
        txn_count = db.execute(text("SELECT COUNT(*) FROM transactions")).scalar() or 0
        cases_count = db.execute(text("SELECT COUNT(*) FROM fraud_cases")).scalar() or 0
        alerts_count = db.execute(text("SELECT COUNT(*) FROM fraud_alerts")).scalar() or 0
        open_alerts = db.execute(
            text("SELECT COUNT(*) FROM fraud_alerts WHERE status = 'NEW'")
        ).scalar() or 0
        suspicious_txns = db.execute(
            text("SELECT COUNT(DISTINCT transaction_id) FROM fraud_alerts WHERE transaction_id IS NOT NULL")
        ).scalar() or 0
        cases_under_inv = db.execute(
            text("SELECT COUNT(*) FROM fraud_cases WHERE status IN ('OPEN', 'UNDER_INVESTIGATION', 'REVIEW_PENDING')")
        ).scalar() or 0
        accounts_review = db.execute(
            text("SELECT COUNT(DISTINCT account_id) FROM fraud_alerts WHERE status = 'NEW'")
        ).scalar() or 0
        pending_freezes = db.execute(
            text("SELECT COUNT(*) FROM freeze_requests WHERE status = 'PENDING_REVIEW'")
        ).scalar() or 0
    except Exception:
        accounts_count = txn_count = cases_count = alerts_count = 0
        open_alerts = suspicious_txns = cases_under_inv = accounts_review = pending_freezes = 0
    finally:
        db.close()

    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "total_accounts": accounts_count,
        "total_transactions": txn_count,
        "fraud_cases": cases_count,
        "fraud_alerts": alerts_count,
        "open_alerts": open_alerts,
        "suspicious_transactions": suspicious_txns,
        "cases_under_investigation": cases_under_inv,
        "accounts_requiring_review": accounts_review,
        "pending_freeze_requests": pending_freezes,
        "allocation_policy": settings.ALLOCATION_POLICY,
    }


@app.get("/api/ai/live", tags=["AI Model"])
def ai_live_feed():
    db = SessionLocal()
    try:
        return get_ai_live_feed(db)
    finally:
        db.close()


@app.get("/api/db/live", tags=["Database Viewer"])
def db_live_snapshot():
    """Live database snapshot & audit CLI stream for the Database Viewer frontend."""
    from fraudtrace.app.models.account import Account
    from fraudtrace.app.models.transaction import Transaction
    from fraudtrace.app.models.fraud_alert import FraudAlert
    from fraudtrace.app.models.audit_log import AuditLog
    from fraudtrace.app.models.cybercell_report import CyberCellReport
    from fraudtrace.app.utils.helpers import paise_to_rupees

    db = SessionLocal()
    try:
        accs = db.query(Account).order_by(Account.created_at.desc()).limit(100).all()
        txns = db.query(Transaction).order_by(Transaction.created_at.desc()).limit(30).all()
        alerts = db.query(FraudAlert).order_by(FraudAlert.created_at.desc()).limit(25).all()
        logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(40).all()
        cyber = db.query(CyberCellReport).order_by(CyberCellReport.created_at.desc()).limit(20).all()

        return {
            "counts": {
                "accounts": db.query(Account).count(),
                "transactions": db.query(Transaction).count(),
                "fraud_alerts": db.query(FraudAlert).count(),
                "audit_logs": db.query(AuditLog).count(),
                "cybercell_reports": db.query(CyberCellReport).count(),
            },
            "accounts": [
                {
                    "account_id": a.account_id,
                    "account_name": a.account_name,
                    "balance_rupees": paise_to_rupees(a.balance_paise),
                    "is_frozen": bool(getattr(a, "is_frozen", False)),
                    "account_type": a.account_type,
                }
                for a in accs
            ],
            "transactions": [
                {
                    "transaction_id": t.transaction_id,
                    "trace_id": t.trace_id,
                    "sender_account_id": t.sender_account_id,
                    "receiver_account_id": t.receiver_account_id,
                    "amount_rupees": paise_to_rupees(t.amount_paise),
                    "created_at": str(t.created_at) if t.created_at else None,
                }
                for t in txns
            ],
            "alerts": [
                {
                    "alert_id": al.alert_id,
                    "account_id": al.account_id,
                    "rule_triggered": al.rule_triggered,
                    "severity": al.severity,
                    "risk_score": al.risk_score,
                    "status": al.status,
                }
                for al in alerts
            ],
            "cli_logs": [
                f"[{l.created_at}] {l.entity_type}:{l.entity_id} {l.action} by {l.actor} -> {l.details or ''}"
                for l in logs
            ],
            "cybercell_reports": [
                {"report_id": c.report_id, "account_id": c.account_id, "status": c.status}
                for c in cyber
            ],
        }
    finally:
        db.close()
