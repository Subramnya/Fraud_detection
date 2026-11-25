"""Investigation report generation engine."""
from datetime import datetime
from sqlalchemy.orm import Session
from fraudtrace.app.models.fraud_case import FraudCase
from fraudtrace.app.models.transaction import Transaction, LedgerEntry
from fraudtrace.app.models.allocation import TraceOrigin, FundAllocation
from fraudtrace.app.models.freeze_request import FreezeRequest
from fraudtrace.app.models.risk_assessment import RiskAssessment
from fraudtrace.app.models.audit_log import AuditLog
from fraudtrace.app.services.lineage_service import get_trace_summary
from fraudtrace.app.services.graph_service import get_graph_for_case
from fraudtrace.app.services.prioritization_service import (
    calculate_investigation_priority, calculate_freeze_priority,
)
from fraudtrace.app.utils.helpers import paise_to_rupees


def generate_investigation_report(db: Session, case_id: str) -> dict:
    """Generate a comprehensive investigation report."""
    case = db.query(FraudCase).filter(FraudCase.case_id == case_id).first()
    if not case:
        raise ValueError(f"Case {case_id} not found")

    # Original transaction
    txn = db.query(Transaction).filter(
        Transaction.transaction_id == case.reported_transaction_id
    ).first()
    txn_dict = {
        "transaction_id": txn.transaction_id,
        "sender_account_id": txn.sender_account_id,
        "receiver_account_id": txn.receiver_account_id,
        "amount_rupees": paise_to_rupees(txn.amount_paise),
        "status": txn.status,
        "created_at": str(txn.created_at) if txn.created_at else None,
    } if txn else {}

    # Trace info
    trace_origin = db.query(TraceOrigin).filter(TraceOrigin.case_id == case_id).first()
    trace_id = trace_origin.trace_id if trace_origin else None

    # Trace summary
    trace_summary = {}
    traceable_amounts = []
    if trace_id:
        try:
            trace_summary = get_trace_summary(db, trace_id)
            traceable_amounts = trace_summary.get("accounts_holding_funds", [])
        except Exception:
            pass

    # Transaction timeline
    timeline = _build_timeline(db, case_id, trace_id)

    # Graph data
    try:
        graph_data = get_graph_for_case(db, case_id)
        connected_accounts = [n for n in graph_data.get("nodes", [])]
    except Exception:
        connected_accounts = []
        graph_data = {}

    # Risk assessments
    risk_assessments = []
    if trace_id:
        traced_accounts = set()
        for alloc in db.query(FundAllocation).filter(FundAllocation.trace_id == trace_id).all():
            traced_accounts.add(alloc.account_id)
        for acc_id in traced_accounts:
            latest_risk = (
                db.query(RiskAssessment)
                .filter(RiskAssessment.account_id == acc_id)
                .order_by(RiskAssessment.created_at.desc())
                .first()
            )
            if latest_risk:
                risk_assessments.append({
                    "account_id": acc_id,
                    "overall_score": latest_risk.overall_score,
                    "risk_category": latest_risk.risk_category,
                    "explanation": latest_risk.explanation,
                })

    # Prioritization
    try:
        account_prioritization = calculate_investigation_priority(db, case_id)
    except Exception:
        account_prioritization = []

    # Freeze recommendations
    try:
        freeze_recommendations = calculate_freeze_priority(db, case_id)
    except Exception:
        freeze_recommendations = []

    # Existing freeze requests
    freeze_requests = (
        db.query(FreezeRequest).filter(FreezeRequest.case_id == case_id).all()
    )
    freeze_list = [
        {
            "request_id": f.request_id,
            "account_id": f.account_id,
            "suggested_amount_rupees": paise_to_rupees(f.suggested_amount_paise),
            "status": f.status,
            "reviewer": f.reviewer,
        }
        for f in freeze_requests
    ]

    # Audit trail
    audit_entries = (
        db.query(AuditLog)
        .filter(
            (AuditLog.entity_id == case_id) |
            (AuditLog.entity_id == (trace_id or ""))
        )
        .order_by(AuditLog.created_at.asc())
        .all()
    )
    audit_trail = [
        {
            "log_id": a.log_id,
            "entity_type": a.entity_type,
            "action": a.action,
            "actor": a.actor,
            "details": a.details,
            "created_at": str(a.created_at) if a.created_at else None,
        }
        for a in audit_entries
    ]

    return {
        "case_id": case_id,
        "status": case.status,
        "fraud_category": case.fraud_category,
        "original_transaction": txn_dict,
        "reported_amount_rupees": paise_to_rupees(case.reported_amount_paise),
        "trace_id": trace_id,
        "transaction_timeline": timeline,
        "connected_accounts": connected_accounts,
        "multi_hop_paths": trace_summary.get("transaction_paths", []),
        "risk_assessments": risk_assessments,
        "traceable_amounts": traceable_amounts,
        "account_prioritization": account_prioritization,
        "freeze_recommendations": freeze_recommendations,
        "freeze_requests": freeze_list,
        "audit_trail": audit_trail,
        "generated_at": datetime.utcnow().isoformat(),
    }


def _build_timeline(db: Session, case_id: str, trace_id: str = None) -> list:
    """Build transaction timeline for a case."""
    if not trace_id:
        return []

    traced_allocs = (
        db.query(FundAllocation)
        .filter(FundAllocation.trace_id == trace_id)
        .all()
    )
    alloc_ids = {a.allocation_id for a in traced_allocs}

    from fraudtrace.app.models.allocation import TransactionAllocation
    txn_allocs = (
        db.query(TransactionAllocation)
        .filter(
            TransactionAllocation.source_allocation_id.in_(alloc_ids) |
            TransactionAllocation.destination_allocation_id.in_(alloc_ids)
        )
        .all()
    )
    txn_ids = {ta.transaction_id for ta in txn_allocs}

    # Include origin
    trace_origin = db.query(TraceOrigin).filter(TraceOrigin.trace_id == trace_id).first()
    if trace_origin:
        txn_ids.add(trace_origin.origin_transaction_id)

    transactions = (
        db.query(Transaction)
        .filter(Transaction.transaction_id.in_(txn_ids))
        .order_by(Transaction.created_at.asc())
        .all()
    )

    return [
        {
            "transaction_id": t.transaction_id,
            "sender_account_id": t.sender_account_id,
            "receiver_account_id": t.receiver_account_id,
            "amount_rupees": paise_to_rupees(t.amount_paise),
            "created_at": str(t.created_at) if t.created_at else None,
        }
        for t in transactions
    ]
