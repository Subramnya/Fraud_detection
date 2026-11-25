"""Investigation API endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from fraudtrace.app.core.database import get_db
from fraudtrace.app.services.prioritization_service import calculate_investigation_priority
from fraudtrace.app.services.report_service import generate_investigation_report, _build_timeline
from fraudtrace.app.models.fraud_case import FraudCase
from fraudtrace.app.models.allocation import TraceOrigin

router = APIRouter(prefix="/api/investigation", tags=["Investigation"])


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
