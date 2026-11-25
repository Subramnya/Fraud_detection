"""Real-time fraud detection engine - rule-based."""
import json
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc
from fraudtrace.app.models.transaction import Transaction
from fraudtrace.app.models.fraud_alert import FraudAlert
from fraudtrace.app.models.audit_log import AuditLog
from fraudtrace.app.core.config import settings
from fraudtrace.app.utils.identifiers import generate_alert_id, generate_log_id
from fraudtrace.app.utils.helpers import paise_to_rupees
from fraudtrace.app.services.notification_service import create_alert_notifications


def monitor_transaction(db: Session, transaction_id: str) -> list:
    """Run all fraud detection rules on a completed transaction."""
    txn = db.query(Transaction).filter(
        Transaction.transaction_id == transaction_id
    ).first()
    if not txn:
        return []

    alerts = []

    # Rule 1: High transaction amount
    alert = _check_high_amount(db, txn)
    if alert:
        alerts.append(alert)

    # Rule 2: High velocity
    alert = _check_velocity(db, txn)
    if alert:
        alerts.append(alert)

    # Rule 3: Fan-out
    alert = _check_fanout(db, txn)
    if alert:
        alerts.append(alert)

    # Rule 4: Fan-in
    alert = _check_fanin(db, txn)
    if alert:
        alerts.append(alert)

    # Rule 5: Rapid pass-through
    alert = _check_passthrough(db, txn)
    if alert:
        alerts.append(alert)

    for a in alerts:
        db.add(a)
        db.add(AuditLog(
            log_id=generate_log_id(),
            entity_type="ALERT",
            entity_id=a.alert_id,
            action="CREATE",
            actor="FRAUD_DETECTION",
            details=json.dumps({"rule": a.rule_triggered, "severity": a.severity}),
        ))
        create_alert_notifications(
            db,
            alert_id=a.alert_id,
            account_id=a.account_id,
            transaction_id=a.transaction_id,
            severity=a.severity,
            reason=a.reason,
            amount_rupees=paise_to_rupees(txn.amount_paise),
        )

    if alerts:
        db.commit()

    return alerts


def _check_high_amount(db: Session, txn: Transaction) -> FraudAlert:
    """Check if transaction amount exceeds threshold."""
    if txn.amount_paise >= settings.HIGH_AMOUNT_THRESHOLD:
        severity = "HIGH" if txn.amount_paise >= settings.HIGH_AMOUNT_THRESHOLD * 2 else "MEDIUM"
        return FraudAlert(
            alert_id=generate_alert_id(),
            account_id=txn.sender_account_id,
            transaction_id=txn.transaction_id,
            rule_triggered="HIGH_AMOUNT",
            reason=f"Transaction amount ₹{paise_to_rupees(txn.amount_paise)} exceeds threshold ₹{paise_to_rupees(settings.HIGH_AMOUNT_THRESHOLD)}",
            risk_score=min(txn.amount_paise / (settings.HIGH_AMOUNT_THRESHOLD * 2), 1.0),
            severity=severity,
        )
    return None


def _check_velocity(db: Session, txn: Transaction) -> FraudAlert:
    """Check if account has too many transactions in a short window."""
    window_start = datetime.now() - timedelta(seconds=settings.VELOCITY_WINDOW_SECONDS)
    count = (
        db.query(sqlfunc.count(Transaction.transaction_id))
        .filter(
            Transaction.sender_account_id == txn.sender_account_id,
            Transaction.created_at >= window_start,
            Transaction.status == "COMPLETED",
        )
        .scalar()
    )
    if count >= settings.VELOCITY_MAX_TRANSACTIONS:
        return FraudAlert(
            alert_id=generate_alert_id(),
            account_id=txn.sender_account_id,
            transaction_id=txn.transaction_id,
            rule_triggered="HIGH_VELOCITY",
            reason=f"Account sent {count} transactions in {settings.VELOCITY_WINDOW_SECONDS}s (threshold: {settings.VELOCITY_MAX_TRANSACTIONS})",
            risk_score=min(count / (settings.VELOCITY_MAX_TRANSACTIONS * 2), 1.0),
            severity="HIGH",
        )
    return None


def _check_fanout(db: Session, txn: Transaction) -> FraudAlert:
    """Check if account sends to many unique recipients."""
    window_start = datetime.now() - timedelta(seconds=settings.FANOUT_WINDOW_SECONDS)
    unique_recipients = (
        db.query(sqlfunc.count(sqlfunc.distinct(Transaction.receiver_account_id)))
        .filter(
            Transaction.sender_account_id == txn.sender_account_id,
            Transaction.created_at >= window_start,
            Transaction.status == "COMPLETED",
        )
        .scalar()
    )
    if unique_recipients >= settings.FANOUT_THRESHOLD:
        return FraudAlert(
            alert_id=generate_alert_id(),
            account_id=txn.sender_account_id,
            transaction_id=txn.transaction_id,
            rule_triggered="FAN_OUT",
            reason=f"Account sent to {unique_recipients} unique recipients in {settings.FANOUT_WINDOW_SECONDS}s",
            risk_score=min(unique_recipients / (settings.FANOUT_THRESHOLD * 2), 1.0),
            severity="MEDIUM",
        )
    return None


def _check_fanin(db: Session, txn: Transaction) -> FraudAlert:
    """Check if receiving account gets from many unique senders."""
    window_start = datetime.now() - timedelta(seconds=settings.FANIN_WINDOW_SECONDS)
    unique_senders = (
        db.query(sqlfunc.count(sqlfunc.distinct(Transaction.sender_account_id)))
        .filter(
            Transaction.receiver_account_id == txn.receiver_account_id,
            Transaction.created_at >= window_start,
            Transaction.status == "COMPLETED",
        )
        .scalar()
    )
    if unique_senders >= settings.FANIN_THRESHOLD:
        return FraudAlert(
            alert_id=generate_alert_id(),
            account_id=txn.receiver_account_id,
            transaction_id=txn.transaction_id,
            rule_triggered="FAN_IN",
            reason=f"Account received from {unique_senders} unique senders in {settings.FANIN_WINDOW_SECONDS}s",
            risk_score=min(unique_senders / (settings.FANIN_THRESHOLD * 2), 1.0),
            severity="MEDIUM",
        )
    return None


def _check_passthrough(db: Session, txn: Transaction) -> FraudAlert:
    """Check if money received is quickly forwarded."""
    window_start = datetime.now() - timedelta(seconds=settings.PASSTHROUGH_WINDOW_SECONDS)

    # Check if the sender recently received funds
    recent_received = (
        db.query(sqlfunc.coalesce(sqlfunc.sum(Transaction.amount_paise), 0))
        .filter(
            Transaction.receiver_account_id == txn.sender_account_id,
            Transaction.created_at >= window_start,
            Transaction.status == "COMPLETED",
        )
        .scalar()
    )

    recent_sent = (
        db.query(sqlfunc.coalesce(sqlfunc.sum(Transaction.amount_paise), 0))
        .filter(
            Transaction.sender_account_id == txn.sender_account_id,
            Transaction.created_at >= window_start,
            Transaction.status == "COMPLETED",
        )
        .scalar()
    )

    if recent_received > 0:
        ratio = recent_sent / recent_received
        if ratio >= settings.PASSTHROUGH_THRESHOLD_RATIO:
            return FraudAlert(
                alert_id=generate_alert_id(),
                account_id=txn.sender_account_id,
                transaction_id=txn.transaction_id,
                rule_triggered="RAPID_PASSTHROUGH",
                reason=f"Account forwarded {ratio*100:.1f}% of received funds within {settings.PASSTHROUGH_WINDOW_SECONDS}s",
                risk_score=min(ratio, 1.0),
                severity="HIGH",
            )
    return None


def get_alerts(db: Session, account_id: str = None, severity: str = None) -> list:
    """Get fraud alerts, optionally filtered."""
    query = db.query(FraudAlert)
    if account_id:
        query = query.filter(FraudAlert.account_id == account_id)
    if severity:
        query = query.filter(FraudAlert.severity == severity)
    alerts = query.order_by(FraudAlert.created_at.desc()).all()
    return [
        {
            "alert_id": a.alert_id,
            "account_id": a.account_id,
            "transaction_id": a.transaction_id,
            "rule_triggered": a.rule_triggered,
            "reason": a.reason,
            "risk_score": a.risk_score,
            "severity": a.severity,
            "status": a.status,
            "created_at": a.created_at,
        }
        for a in alerts
    ]
