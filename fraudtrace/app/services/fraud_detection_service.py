"""Real-time fraud detection engine - rule-based with structured evidence."""
import json
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc
from fraudtrace.app.models.transaction import Transaction
from fraudtrace.app.models.allocation import FundAllocation, TransactionAllocation
from fraudtrace.app.models.fraud_alert import FraudAlert
from fraudtrace.app.models.audit_log import AuditLog
from fraudtrace.app.core.config import settings
from fraudtrace.app.utils.identifiers import generate_alert_id, generate_log_id
from fraudtrace.app.utils.helpers import paise_to_rupees
from fraudtrace.app.services.notification_service import create_alert_notifications
from fraudtrace.app.services.ai_model_service import ai_model, compute_and_store_risk_assessment


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _build_evidence(
    txns: list[Transaction],
    explanation: str,
    threshold_info: dict,
) -> str:
    return json.dumps({
        "supporting_transaction_ids": [t.transaction_id for t in txns],
        "timestamps": [str(t.created_at) if t.created_at else None for t in txns],
        "amounts_rupees": [paise_to_rupees(t.amount_paise) for t in txns],
        "total_amount_rupees": round(sum(paise_to_rupees(t.amount_paise) for t in txns), 2),
        "threshold": threshold_info,
        "explanation": explanation,
    })


def monitor_transaction(db: Session, transaction_id: str) -> list:
    """Run all fraud detection rules on a completed transaction."""
    txn = db.query(Transaction).filter(
        Transaction.transaction_id == transaction_id
    ).first()
    if not txn:
        return []

    alerts = []

    for rule_fn in (
        _check_high_amount,
        _check_velocity,
        _check_fanout,
        _check_fanin,
        _check_passthrough,
        _check_transaction_splitting,
        _check_multi_hop,
    ):
        alert = rule_fn(db, txn)
        if alert:
            alerts.append(alert)

    # Scikit-learn AI Model check
    ai_alert = _check_ai_model(db, txn)
    if ai_alert:
        alerts.append(ai_alert)

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
        # Generate/update authoritative 0-100 RiskAssessment per alerted account
        seen_accounts = set()
        for a in alerts:
            if a.account_id not in seen_accounts:
                seen_accounts.add(a.account_id)
                ra = compute_and_store_risk_assessment(db, a.account_id, alert_id=a.alert_id)
                a.risk_score = ra["overall_score"]
                a.severity = ra["risk_category"]
        db.commit()

    return alerts


def _check_high_amount(db: Session, txn: Transaction) -> FraudAlert:
    """Check if transaction amount exceeds threshold."""
    if txn.amount_paise >= settings.HIGH_AMOUNT_THRESHOLD:
        severity = "HIGH" if txn.amount_paise >= settings.HIGH_AMOUNT_THRESHOLD * 2 else "MEDIUM"
        reason = (
            f"Transaction amount ₹{paise_to_rupees(txn.amount_paise)} exceeds threshold "
            f"₹{paise_to_rupees(settings.HIGH_AMOUNT_THRESHOLD)}"
        )
        return FraudAlert(
            alert_id=generate_alert_id(),
            account_id=txn.sender_account_id,
            transaction_id=txn.transaction_id,
            rule_triggered="HIGH_AMOUNT",
            reason=reason,
            risk_score=min(txn.amount_paise / (settings.HIGH_AMOUNT_THRESHOLD * 2), 1.0),
            severity=severity,
            evidence=_build_evidence(
                [txn],
                reason,
                {"high_amount_threshold_rupees": paise_to_rupees(settings.HIGH_AMOUNT_THRESHOLD)},
            ),
        )
    return None


def _check_velocity(db: Session, txn: Transaction) -> FraudAlert:
    """Check if account has too many transactions in a short window."""
    window_start = _utc_now_naive() - timedelta(seconds=settings.VELOCITY_WINDOW_SECONDS)
    recent = (
        db.query(Transaction)
        .filter(
            Transaction.sender_account_id == txn.sender_account_id,
            Transaction.created_at >= window_start,
            Transaction.status == "COMPLETED",
        )
        .order_by(Transaction.created_at.asc())
        .all()
    )
    count = len(recent)
    if count >= settings.VELOCITY_MAX_TRANSACTIONS:
        reason = (
            f"Account sent {count} transactions in {settings.VELOCITY_WINDOW_SECONDS}s "
            f"(threshold: {settings.VELOCITY_MAX_TRANSACTIONS})"
        )
        return FraudAlert(
            alert_id=generate_alert_id(),
            account_id=txn.sender_account_id,
            transaction_id=txn.transaction_id,
            rule_triggered="HIGH_VELOCITY",
            reason=reason,
            risk_score=min(count / (settings.VELOCITY_MAX_TRANSACTIONS * 2), 1.0),
            severity="HIGH",
            evidence=_build_evidence(
                recent,
                reason,
                {
                    "velocity_max_transactions": settings.VELOCITY_MAX_TRANSACTIONS,
                    "window_seconds": settings.VELOCITY_WINDOW_SECONDS,
                },
            ),
        )
    return None


def _check_fanout(db: Session, txn: Transaction) -> FraudAlert:
    """Check if account sends to many unique recipients."""
    window_start = _utc_now_naive() - timedelta(seconds=settings.FANOUT_WINDOW_SECONDS)
    recent = (
        db.query(Transaction)
        .filter(
            Transaction.sender_account_id == txn.sender_account_id,
            Transaction.created_at >= window_start,
            Transaction.status == "COMPLETED",
        )
        .order_by(Transaction.created_at.asc())
        .all()
    )
    unique_recipients = len({t.receiver_account_id for t in recent})
    if unique_recipients >= settings.FANOUT_THRESHOLD:
        reason = (
            f"Account sent to {unique_recipients} unique recipients in "
            f"{settings.FANOUT_WINDOW_SECONDS}s"
        )
        return FraudAlert(
            alert_id=generate_alert_id(),
            account_id=txn.sender_account_id,
            transaction_id=txn.transaction_id,
            rule_triggered="FAN_OUT",
            reason=reason,
            risk_score=min(unique_recipients / (settings.FANOUT_THRESHOLD * 2), 1.0),
            severity="MEDIUM",
            evidence=_build_evidence(
                recent,
                reason,
                {
                    "fanout_threshold": settings.FANOUT_THRESHOLD,
                    "window_seconds": settings.FANOUT_WINDOW_SECONDS,
                    "unique_recipients": unique_recipients,
                },
            ),
        )
    return None


def _check_fanin(db: Session, txn: Transaction) -> FraudAlert:
    """Check if receiving account gets from many unique senders."""
    window_start = _utc_now_naive() - timedelta(seconds=settings.FANIN_WINDOW_SECONDS)
    recent = (
        db.query(Transaction)
        .filter(
            Transaction.receiver_account_id == txn.receiver_account_id,
            Transaction.created_at >= window_start,
            Transaction.status == "COMPLETED",
        )
        .order_by(Transaction.created_at.asc())
        .all()
    )
    unique_senders = len({t.sender_account_id for t in recent})
    if unique_senders >= settings.FANIN_THRESHOLD:
        reason = (
            f"Account received from {unique_senders} unique senders in "
            f"{settings.FANIN_WINDOW_SECONDS}s"
        )
        return FraudAlert(
            alert_id=generate_alert_id(),
            account_id=txn.receiver_account_id,
            transaction_id=txn.transaction_id,
            rule_triggered="FAN_IN",
            reason=reason,
            risk_score=min(unique_senders / (settings.FANIN_THRESHOLD * 2), 1.0),
            severity="MEDIUM",
            evidence=_build_evidence(
                recent,
                reason,
                {
                    "fanin_threshold": settings.FANIN_THRESHOLD,
                    "window_seconds": settings.FANIN_WINDOW_SECONDS,
                    "unique_senders": unique_senders,
                },
            ),
        )
    return None


def _check_passthrough(db: Session, txn: Transaction) -> FraudAlert:
    """Check if money received is quickly forwarded."""
    window_start = _utc_now_naive() - timedelta(seconds=settings.PASSTHROUGH_WINDOW_SECONDS)

    received_txns = (
        db.query(Transaction)
        .filter(
            Transaction.receiver_account_id == txn.sender_account_id,
            Transaction.created_at >= window_start,
            Transaction.status == "COMPLETED",
        )
        .all()
    )
    sent_txns = (
        db.query(Transaction)
        .filter(
            Transaction.sender_account_id == txn.sender_account_id,
            Transaction.created_at >= window_start,
            Transaction.status == "COMPLETED",
        )
        .all()
    )

    recent_received = sum(t.amount_paise for t in received_txns)
    recent_sent = sum(t.amount_paise for t in sent_txns)

    if recent_received > 0:
        ratio = recent_sent / recent_received
        if ratio >= settings.PASSTHROUGH_THRESHOLD_RATIO:
            reason = (
                f"Account forwarded {ratio*100:.1f}% of received funds within "
                f"{settings.PASSTHROUGH_WINDOW_SECONDS}s"
            )
            return FraudAlert(
                alert_id=generate_alert_id(),
                account_id=txn.sender_account_id,
                transaction_id=txn.transaction_id,
                rule_triggered="RAPID_PASSTHROUGH",
                reason=reason,
                risk_score=min(ratio, 1.0),
                severity="HIGH",
                evidence=_build_evidence(
                    received_txns + sent_txns,
                    reason,
                    {
                        "passthrough_threshold_ratio": settings.PASSTHROUGH_THRESHOLD_RATIO,
                        "observed_ratio": round(ratio, 4),
                        "window_seconds": settings.PASSTHROUGH_WINDOW_SECONDS,
                    },
                ),
            )
    return None


def _check_transaction_splitting(db: Session, txn: Transaction) -> FraudAlert:
    """Detect splitting a recently received amount into 3+ smaller outgoing transfers."""
    window_start = _utc_now_naive() - timedelta(seconds=settings.FANOUT_WINDOW_SECONDS)
    received_txns = (
        db.query(Transaction)
        .filter(
            Transaction.receiver_account_id == txn.sender_account_id,
            Transaction.created_at >= window_start,
            Transaction.status == "COMPLETED",
        )
        .all()
    )
    if not received_txns:
        return None

    max_received = max(t.amount_paise for t in received_txns)
    outgoing_smaller = (
        db.query(Transaction)
        .filter(
            Transaction.sender_account_id == txn.sender_account_id,
            Transaction.created_at >= window_start,
            Transaction.status == "COMPLETED",
            Transaction.amount_paise < max_received,
        )
        .all()
    )
    unique_dests = {t.receiver_account_id for t in outgoing_smaller}
    total_split = sum(t.amount_paise for t in outgoing_smaller)

    if len(outgoing_smaller) >= 3 and len(unique_dests) >= 3 and total_split >= int(max_received * 0.7):
        reason = (
            f"Account split received funds (₹{paise_to_rupees(max_received)}) into "
            f"{len(outgoing_smaller)} smaller outgoing transfers totaling ₹{paise_to_rupees(total_split)}"
        )
        return FraudAlert(
            alert_id=generate_alert_id(),
            account_id=txn.sender_account_id,
            transaction_id=txn.transaction_id,
            rule_triggered="TRANSACTION_SPLITTING",
            reason=reason,
            risk_score=min(total_split / max(max_received, 1), 1.0),
            severity="MEDIUM",
            evidence=_build_evidence(
                received_txns + outgoing_smaller,
                reason,
                {
                    "min_split_count": 3,
                    "observed_split_count": len(outgoing_smaller),
                    "split_ratio": round(total_split / max(max_received, 1), 4),
                },
            ),
        )
    return None


def _check_multi_hop(db: Session, txn: Transaction) -> FraudAlert:
    """Detect multi-hop money movement (>= 2 hops from an origin allocation)."""
    txn_allocs = (
        db.query(TransactionAllocation)
        .filter(TransactionAllocation.transaction_id == txn.transaction_id)
        .all()
    )
    max_depth = 0
    for ta in txn_allocs:
        src = db.query(FundAllocation).filter(
            FundAllocation.allocation_id == ta.source_allocation_id
        ).first()
        depth = 0
        curr = src
        while curr and curr.parent_allocation_id and depth < 10:
            depth += 1
            curr = db.query(FundAllocation).filter(
                FundAllocation.allocation_id == curr.parent_allocation_id
            ).first()
        if depth > max_depth:
            max_depth = depth

    if max_depth >= 2:
        reason = (
            f"Multi-hop money movement detected: funds in {txn.transaction_id} "
            f"have traversed {max_depth} hops"
        )
        return FraudAlert(
            alert_id=generate_alert_id(),
            account_id=txn.sender_account_id,
            transaction_id=txn.transaction_id,
            rule_triggered="MULTI_HOP",
            reason=reason,
            risk_score=min(max_depth / 5.0, 1.0),
            severity="MEDIUM",
            evidence=_build_evidence(
                [txn],
                reason,
                {"min_hops": 2, "observed_hops": max_depth},
            ),
        )
    return None


def _check_ai_model(db: Session, txn: Transaction) -> FraudAlert:
    """Score transaction with Scikit-learn RandomForest + IsolationForest model."""
    window_5m = _utc_now_naive() - timedelta(seconds=300)
    window_1h = _utc_now_naive() - timedelta(seconds=3600)
    txns_5m = (
        db.query(Transaction)
        .filter(Transaction.sender_account_id == txn.sender_account_id, Transaction.created_at >= window_5m)
        .count()
    )
    recips_1h = (
        db.query(sqlfunc.count(sqlfunc.distinct(Transaction.receiver_account_id)))
        .filter(Transaction.sender_account_id == txn.sender_account_id, Transaction.created_at >= window_1h)
        .scalar() or 0
    )
    senders_1h = (
        db.query(sqlfunc.count(sqlfunc.distinct(Transaction.receiver_account_id)))
        .filter(Transaction.receiver_account_id == txn.sender_account_id, Transaction.created_at >= window_1h)
        .scalar() or 0
    )
    rec_sum = (
        db.query(sqlfunc.coalesce(sqlfunc.sum(Transaction.amount_paise), 0))
        .filter(Transaction.receiver_account_id == txn.sender_account_id, Transaction.created_at >= window_5m)
        .scalar()
    )
    sent_sum = (
        db.query(sqlfunc.coalesce(sqlfunc.sum(Transaction.amount_paise), 0))
        .filter(Transaction.sender_account_id == txn.sender_account_id, Transaction.created_at >= window_5m)
        .scalar()
    )
    pt_ratio = min(sent_sum / rec_sum, 1.0) if rec_sum > 0 else 0.0
    amt_rupees = paise_to_rupees(txn.amount_paise)
    # Only run AI anomaly flagging when behavioral signals or huge amount (>= 50,000) exist
    has_behavioral_signal = (
        txns_5m >= 3 or recips_1h >= 3 or senders_1h >= 3 or pt_ratio >= 0.75 or amt_rupees >= 50000
    )
    if not has_behavioral_signal:
        return None
    res = ai_model.score([amt_rupees, txns_5m, recips_1h, senders_1h, pt_ratio])
    if res["is_anomaly"] and res["ai_fraud_probability"] >= 0.7:
        reason = (
            f"AI Model anomaly detected (prob={res['ai_fraud_probability']:.2f}) on "
            f"₹{amt_rupees:,.2f} transfer"
        )
        return FraudAlert(
            alert_id=generate_alert_id(),
            account_id=txn.sender_account_id,
            transaction_id=txn.transaction_id,
            rule_triggered="AI_ANOMALY",
            reason=reason,
            risk_score=res["ai_fraud_probability"],
            severity="HIGH" if res["ai_fraud_probability"] >= 0.85 else "MEDIUM",
            evidence=_build_evidence([txn], reason, res),
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
            "evidence": json.loads(a.evidence) if a.evidence else None,
            "created_at": a.created_at,
        }
        for a in alerts
    ]
