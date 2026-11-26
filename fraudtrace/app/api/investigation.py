"""Investigation API endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from fraudtrace.app.core.database import get_db
from fraudtrace.app.services.prioritization_service import calculate_investigation_priority
from fraudtrace.app.services.report_service import generate_investigation_report, _build_timeline
from fraudtrace.app.services.account_service import get_account, get_account_allocations
from fraudtrace.app.services.payment_service import get_transaction_history
from fraudtrace.app.services.risk_service import assess_account_risk
from fraudtrace.app.services.fraud_detection_service import get_alerts
from fraudtrace.app.services.graph_service import (
    fanin_analysis,
    fanout_analysis,
    get_graph_for_account,
    multi_hop_trace,
)
from fraudtrace.app.services.lineage_service import get_account_traceable_balance
from fraudtrace.app.models.fraud_case import FraudCase
from fraudtrace.app.models.allocation import TraceOrigin

router = APIRouter(prefix="/api/investigation", tags=["Investigation"])


@router.get("/account/{account_id}/profile")
def get_account_investigation_profile(account_id: str, db: Session = Depends(get_db)):
    """Reusable banker investigation profile for any account."""
    try:
        account = get_account(db, account_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {
        "account": account,
        "risk_profile": assess_account_risk(db, account_id),
        "transaction_history": get_transaction_history(db, account_id),
        "flow_analysis": {
            "fan_in": fanin_analysis(db, account_id),
            "fan_out": fanout_analysis(db, account_id),
        },
        "alerts": get_alerts(db, account_id=account_id),
        "fund_allocations": get_account_allocations(db, account_id),
        "traceable_balance": get_account_traceable_balance(db, account_id),
        "downstream_trace": multi_hop_trace(db, account_id, direction="downstream"),
        "graph": get_graph_for_account(db, account_id),
    }


@router.get("/{case_id}")
def get_investigation(case_id: str, db: Session = Depends(get_db)):
    try:
        return generate_investigation_report(db, case_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{case_id}/priority")
def get_priority(case_id: str, db: Session = Depends(get_db)):
    try:
        return calculate_investigation_priority(db, case_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{case_id}/timeline")
def get_timeline(case_id: str, db: Session = Depends(get_db)):
    case = db.query(FraudCase).filter(FraudCase.case_id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    trace = db.query(TraceOrigin).filter(TraceOrigin.case_id == case_id).first()
    trace_id = trace.trace_id if trace else None
    return _build_timeline(db, case_id, trace_id)
