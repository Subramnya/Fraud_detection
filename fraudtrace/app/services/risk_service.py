"""Risk scoring engine."""
import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc
from fraudtrace.app.models.transaction import Transaction
from fraudtrace.app.models.risk_assessment import RiskAssessment
from fraudtrace.app.models.audit_log import AuditLog
from fraudtrace.app.core.config import settings
from fraudtrace.app.utils.identifiers import generate_assessment_id, generate_log_id
from fraudtrace.app.utils.helpers import paise_to_rupees


def assess_account_risk(db: Session, account_id: str) -> dict:
    """Calculate a comprehensive risk score for an account."""

    # Gather features
    velocity_score = _calculate_velocity_score(db, account_id)
    fanin_score = _calculate_fanin_score(db, account_id)
    fanout_score = _calculate_fanout_score(db, account_id)
    passthrough_score = _calculate_passthrough_score(db, account_id)
    amount_score = _calculate_amount_score(db, account_id)
    new_recipient_score = _calculate_new_recipient_score(db, account_id)
    timing_score = _calculate_timing_score(db, account_id)

    # Weighted sum
    overall = (
        settings.RISK_WEIGHT_VELOCITY * velocity_score +
        settings.RISK_WEIGHT_FANIN * fanin_score +
        settings.RISK_WEIGHT_FANOUT * fanout_score +
        settings.RISK_WEIGHT_PASSTHROUGH * passthrough_score +
        settings.RISK_WEIGHT_AMOUNT * amount_score +
        settings.RISK_WEIGHT_NEW_RECIPIENT * new_recipient_score +
        settings.RISK_WEIGHT_TIMING * timing_score
    )

    # Determine risk category
    if overall >= 0.75:
        category = "CRITICAL"
    elif overall >= 0.5:
        category = "HIGH"
    elif overall >= 0.25:
        category = "MEDIUM"
    else:
        category = "LOW"

    explanation_parts = []
    if velocity_score > 0.3:
        explanation_parts.append(f"High transaction velocity ({velocity_score:.2f})")
    if fanin_score > 0.3:
        explanation_parts.append(f"Elevated fan-in ({fanin_score:.2f})")
    if fanout_score > 0.3:
        explanation_parts.append(f"Elevated fan-out ({fanout_score:.2f})")
    if passthrough_score > 0.3:
        explanation_parts.append(f"Pass-through behavior ({passthrough_score:.2f})")
    if amount_score > 0.3:
        explanation_parts.append(f"Unusual amounts ({amount_score:.2f})")
    if new_recipient_score > 0.3:
        explanation_parts.append(f"Many new recipients ({new_recipient_score:.2f})")
    if timing_score > 0.3:
        explanation_parts.append(f"Unusual timing ({timing_score:.2f})")

    explanation = "; ".join(explanation_parts) if explanation_parts else "No significant risk factors detected"

    # Store assessment
    assessment = RiskAssessment(
        assessment_id=generate_assessment_id(),
        account_id=account_id,
        overall_score=round(overall, 4),
        risk_category=category,
        velocity_score=round(velocity_score, 4),
        fanin_score=round(fanin_score, 4),
        fanout_score=round(fanout_score, 4),
        passthrough_score=round(passthrough_score, 4),
        amount_score=round(amount_score, 4),
        new_recipient_score=round(new_recipient_score, 4),
        timing_score=round(timing_score, 4),
        explanation=explanation,
    )
    db.add(assessment)
    db.add(AuditLog(
        log_id=generate_log_id(),
        entity_type="RISK_ASSESSMENT",
        entity_id=assessment.assessment_id,
        action="CREATE",
        actor="RISK_ENGINE",
        details=json.dumps({"account_id": account_id, "score": overall, "category": category}),
    ))
    db.commit()

    return {
        "assessment_id": assessment.assessment_id,
        "account_id": account_id,
        "overall_score": round(overall, 4),
        "risk_category": category,
        "velocity_score": round(velocity_score, 4),
        "fanin_score": round(fanin_score, 4),
        "fanout_score": round(fanout_score, 4),
        "passthrough_score": round(passthrough_score, 4),
        "amount_score": round(amount_score, 4),
        "new_recipient_score": round(new_recipient_score, 4),
        "timing_score": round(timing_score, 4),
        "explanation": explanation,
    }


def _calculate_velocity_score(db: Session, account_id: str) -> float:
    window_start = datetime.now() - timedelta(seconds=settings.VELOCITY_WINDOW_SECONDS)
    count = (
        db.query(sqlfunc.count(Transaction.transaction_id))
        .filter(
            Transaction.sender_account_id == account_id,
            Transaction.created_at >= window_start,
        )
        .scalar() or 0
    )
    return min(count / (settings.VELOCITY_MAX_TRANSACTIONS * 2), 1.0)


def _calculate_fanin_score(db: Session, account_id: str) -> float:
    window_start = datetime.now() - timedelta(seconds=settings.FANIN_WINDOW_SECONDS)
    unique_senders = (
        db.query(sqlfunc.count(sqlfunc.distinct(Transaction.sender_account_id)))
        .filter(
            Transaction.receiver_account_id == account_id,
            Transaction.created_at >= window_start,
        )
        .scalar() or 0
    )
    return min(unique_senders / (settings.FANIN_THRESHOLD * 2), 1.0)


def _calculate_fanout_score(db: Session, account_id: str) -> float:
    window_start = datetime.now() - timedelta(seconds=settings.FANOUT_WINDOW_SECONDS)
    unique_receivers = (
        db.query(sqlfunc.count(sqlfunc.distinct(Transaction.receiver_account_id)))
        .filter(
            Transaction.sender_account_id == account_id,
            Transaction.created_at >= window_start,
        )
        .scalar() or 0
    )
    return min(unique_receivers / (settings.FANOUT_THRESHOLD * 2), 1.0)


def _calculate_passthrough_score(db: Session, account_id: str) -> float:
    window_start = datetime.now() - timedelta(seconds=settings.PASSTHROUGH_WINDOW_SECONDS)
    received = (
        db.query(sqlfunc.coalesce(sqlfunc.sum(Transaction.amount_paise), 0))
        .filter(
            Transaction.receiver_account_id == account_id,
            Transaction.created_at >= window_start,
        )
        .scalar()
    )
    sent = (
        db.query(sqlfunc.coalesce(sqlfunc.sum(Transaction.amount_paise), 0))
        .filter(
            Transaction.sender_account_id == account_id,
            Transaction.created_at >= window_start,
        )
        .scalar()
    )
    if received > 0:
        return min(sent / received, 1.0)
    return 0.0


def _calculate_amount_score(db: Session, account_id: str) -> float:
    max_amount = (
        db.query(sqlfunc.max(Transaction.amount_paise))
        .filter(Transaction.sender_account_id == account_id)
        .scalar() or 0
    )
    return min(max_amount / (settings.HIGH_AMOUNT_THRESHOLD * 2), 1.0)


def _calculate_new_recipient_score(db: Session, account_id: str) -> float:
    # Count unique recipients in last hour vs all time
    hour_ago = datetime.now() - timedelta(hours=1)
    recent_recipients = set(
        r[0] for r in
        db.query(Transaction.receiver_account_id)
        .filter(
            Transaction.sender_account_id == account_id,
            Transaction.created_at >= hour_ago,
        )
        .all()
    )
    all_recipients = set(
        r[0] for r in
        db.query(Transaction.receiver_account_id)
        .filter(Transaction.sender_account_id == account_id)
        .all()
    )
    if not all_recipients:
        return 0.0
    old_recipients = all_recipients - recent_recipients
    if not old_recipients:
        return 0.5 if recent_recipients else 0.0
    new_ratio = len(recent_recipients - old_recipients) / max(len(all_recipients), 1)
    return min(new_ratio, 1.0)


def _calculate_timing_score(db: Session, account_id: str) -> float:
    # Simple: check if transactions are happening at unusual hours
    recent_txns = (
        db.query(Transaction.created_at)
        .filter(Transaction.sender_account_id == account_id)
        .order_by(Transaction.created_at.desc())
        .limit(10)
        .all()
    )
    if not recent_txns:
        return 0.0

    unusual_count = 0
    for (ts,) in recent_txns:
        if ts:
            hour = ts.hour if hasattr(ts, 'hour') else 12
            if hour < 6 or hour > 23:  # unusual hours
                unusual_count += 1

    return unusual_count / max(len(recent_txns), 1)
