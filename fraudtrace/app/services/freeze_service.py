"""Simulated freeze request management."""
import json
from datetime import datetime
from sqlalchemy.orm import Session
from fraudtrace.app.models.freeze_request import FreezeRequest
from fraudtrace.app.models.account import Account
from fraudtrace.app.models.allocation import FundAllocation, TraceOrigin
from fraudtrace.app.models.fraud_case import FraudCase
from fraudtrace.app.models.audit_log import AuditLog
from fraudtrace.app.utils.identifiers import generate_request_id, generate_log_id
from fraudtrace.app.utils.helpers import paise_to_rupees, rupees_to_paise


def create_freeze_request(db: Session, case_id: str, account_id: str,
                          trace_id: str = None, reason: str = None) -> dict:
    """Create a simulated freeze request."""
    case = db.query(FraudCase).filter(FraudCase.case_id == case_id).first()
    if not case:
        raise ValueError(f"Case {case_id} not found")

    account = db.query(Account).filter(Account.account_id == account_id).first()
    if not account:
        raise ValueError(f"Account {account_id} not found")

    # Calculate traceable balance
    query = db.query(FundAllocation).filter(
        FundAllocation.account_id == account_id,
        FundAllocation.is_active == True,
        FundAllocation.trace_id.isnot(None),
    )
    if trace_id:
        query = query.filter(FundAllocation.trace_id == trace_id)

    traced_allocs = query.all()
    traceable_paise = sum(a.amount_paise for a in traced_allocs)

    # Check for existing freeze requests to avoid double-freezing
    existing_freezes = (
        db.query(FreezeRequest)
        .filter(
            FreezeRequest.case_id == case_id,
            FreezeRequest.account_id == account_id,
            FreezeRequest.status.in_(["PENDING_REVIEW", "APPROVED_SIMULATED"]),
        )
        .all()
    )
    already_frozen = sum(fr.suggested_amount_paise for fr in existing_freezes)
    remaining_traceable = max(traceable_paise - already_frozen, 0)

    suggested = min(remaining_traceable, account.balance_paise)

    if suggested <= 0:
        status = "INSUFFICIENT_BALANCE"
    else:
        status = "PENDING_REVIEW"

    request_id = generate_request_id()
    freeze_req = FreezeRequest(
        request_id=request_id,
        case_id=case_id,
        account_id=account_id,
        trace_id=trace_id,
        suggested_amount_paise=suggested,
        available_balance_paise=account.balance_paise,
        traceable_balance_paise=traceable_paise,
        reason=reason,
        status=status,
    )
    db.add(freeze_req)
    db.add(AuditLog(
        log_id=generate_log_id(),
        entity_type="FREEZE_REQUEST",
        entity_id=request_id,
        action="CREATE",
        actor="SYSTEM",
        details=json.dumps({
            "case_id": case_id, "account_id": account_id,
            "suggested_paise": suggested, "status": status,
        }),
    ))
    db.commit()
    db.refresh(freeze_req)

    return _freeze_to_dict(freeze_req)


def review_freeze_request(db: Session, request_id: str, status: str,
                          reviewer: str, review_notes: str = None,
                          approved_amount_rupees: float = None) -> dict:
    """Review a freeze request."""
    freeze_req = db.query(FreezeRequest).filter(
        FreezeRequest.request_id == request_id
    ).first()
    if not freeze_req:
        raise ValueError(f"Freeze request {request_id} not found")
    if freeze_req.status not in ["PENDING_REVIEW"]:
        raise ValueError(f"Request {request_id} cannot be reviewed (status: {freeze_req.status})")

    freeze_req.status = status
    freeze_req.reviewer = reviewer
    freeze_req.review_notes = review_notes
    freeze_req.reviewed_at = datetime.utcnow()

    if approved_amount_rupees is not None and status == "PARTIALLY_APPROVED_SIMULATED":
        freeze_req.suggested_amount_paise = rupees_to_paise(approved_amount_rupees)

    db.add(AuditLog(
        log_id=generate_log_id(),
        entity_type="FREEZE_REQUEST",
        entity_id=request_id,
        action="REVIEW",
        actor=reviewer,
        details=json.dumps({
            "new_status": status,
            "review_notes": review_notes,
        }),
    ))
    db.commit()
    db.refresh(freeze_req)
    return _freeze_to_dict(freeze_req)


def get_freeze_requests(db: Session, case_id: str = None) -> list:
    """Get freeze requests, optionally filtered by case."""
    query = db.query(FreezeRequest)
    if case_id:
        query = query.filter(FreezeRequest.case_id == case_id)
    requests = query.order_by(FreezeRequest.created_at.desc()).all()
    return [_freeze_to_dict(r) for r in requests]


def get_freeze_request(db: Session, request_id: str) -> dict:
    """Get a specific freeze request."""
    req = db.query(FreezeRequest).filter(FreezeRequest.request_id == request_id).first()
    if not req:
        raise ValueError(f"Freeze request {request_id} not found")
    return _freeze_to_dict(req)


def _freeze_to_dict(req: FreezeRequest) -> dict:
    return {
        "request_id": req.request_id,
        "case_id": req.case_id,
        "account_id": req.account_id,
        "trace_id": req.trace_id,
        "suggested_amount_rupees": paise_to_rupees(req.suggested_amount_paise),
        "available_balance_rupees": paise_to_rupees(req.available_balance_paise),
        "traceable_balance_rupees": paise_to_rupees(req.traceable_balance_paise),
        "reason": req.reason,
        "status": req.status,
        "reviewer": req.reviewer,
        "review_notes": req.review_notes,
        "created_at": req.created_at,
        "reviewed_at": req.reviewed_at,
    }
