"""FraudTrace - Graph-Based Fraud Detection Platform.

⚠️ WARNING: This is a SYNTHETIC PROTOTYPE for demonstration purposes only.
   Not connected to real payment systems or bank accounts.
   All transactions, accounts, and data are simulated.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
from fraudtrace.app.core.config import settings
from fraudtrace.app.core.database import init_db, SessionLocal
from fraudtrace.app.api import (
    accounts, payments, fraud, investigation, graph, freeze, reports, notifications,
)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Graph-Based Real-Time Fraud Detection and Transaction Lineage Analysis Platform. "
        "⚠️ SYNTHETIC PROTOTYPE - Not connected to real payment systems."
    ),
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(accounts.router)
app.include_router(payments.router)
app.include_router(fraud.router)
app.include_router(investigation.router)
app.include_router(graph.router)
app.include_router(freeze.router)
app.include_router(reports.router)
app.include_router(notifications.router)


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


class DemoSuspiciousRequest(BaseModel):
    account_id: str


@app.post("/api/demo/trigger-suspicious", tags=["Demo Simulation"])
def trigger_suspicious_demo(request: DemoSuspiciousRequest):
    """Development-only endpoint to trigger a predefined suspicious transfer scenario."""
    from fraudtrace.app.models.account import Account
    from fraudtrace.app.services.payment_service import process_payment
    from fraudtrace.app.services.fraud_detection_service import monitor_transaction
    from fraudtrace.app.services.notification_service import create_payment_notifications

    db = SessionLocal()
    try:
        target = db.query(Account).filter(Account.account_id == request.account_id).first()
        if not target:
            raise HTTPException(status_code=404, detail=f"Account {request.account_id} not found")

        receiver = (
            db.query(Account)
            .filter(Account.account_id != request.account_id, Account.is_active == True)
            .first()
        )
        if not receiver:
            raise HTTPException(status_code=400, detail="No other active account available for demo")

        # Ensure target has enough balance for the ₹12,500 high-amount demo transfer
        demo_amount = 12500.0
        if target.balance_paise < int(demo_amount * 100):
            target.balance_paise += int(demo_amount * 100)
            from fraudtrace.app.models.allocation import FundAllocation
            from fraudtrace.app.utils.identifiers import generate_allocation_id
            db.add(FundAllocation(
                allocation_id=generate_allocation_id(),
                account_id=target.account_id,
                origin_transaction_id="DEMO_SIMULATION_SEED",
                amount_paise=int(demo_amount * 100),
                is_active=True,
            ))
            db.commit()

        txn = process_payment(
            db,
            sender_account_id=target.account_id,
            receiver_account_id=receiver.account_id,
            amount_rupees=demo_amount,
            description="SIMULATED: High-value suspicious transfer demo",
        )
        create_payment_notifications(
            db,
            transaction_id=txn["transaction_id"],
            sender_account_id=target.account_id,
            receiver_account_id=receiver.account_id,
            amount_rupees=demo_amount,
        )
        alerts = monitor_transaction(db, txn["transaction_id"])
        return {
            "simulated": True,
            "transaction_id": txn["transaction_id"],
            "sender_account_id": target.account_id,
            "receiver_account_id": receiver.account_id,
            "amount_rupees": demo_amount,
            "alerts_triggered": [
                {
                    "alert_id": a.alert_id,
                    "rule_triggered": a.rule_triggered,
                    "severity": a.severity,
                    "reason": a.reason,
                }
                for a in alerts
            ],
        }
    finally:
        db.close()
