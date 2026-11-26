"""Fraud reporting API endpoints."""
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from fraudtrace.app.core.database import get_db
from fraudtrace.app.schemas.fraud import FraudReport, FraudCaseResponse, FraudAlertResponse, TraceResult
from fraudtrace.app.models.fraud_case import FraudCase
from fraudtrace.app.models.fraud_alert import FraudAlert
from fraudtrace.app.models.risk_assessment import RiskAssessment
from fraudtrace.app.models.transaction import Transaction
from fraudtrace.app.models.allocation import TraceOrigin
from fraudtrace.app.models.audit_log import AuditLog
from fraudtrace.app.services.lineage_service import activate_trace, get_trace_summary
from fraudtrace.app.services.fraud_detection_service import get_alerts
from fraudtrace.app.utils.identifiers import generate_case_id, generate_log_id
from fraudtrace.app.utils.helpers import rupees_to_paise, paise_to_rupees

router = APIRouter(prefix="/api/fraud", tags=["Fraud"])


@router.post("/report", response_model=FraudCaseResponse)
def report_fraud(request: FraudReport, db: Session = Depends(get_db)):
    try:
        # Validate transaction
        txn = db.query(Transaction).filter(
            Transaction.transaction_id == request.transaction_id
        ).first()
        if not txn:
            raise ValueError(f"Transaction {request.transaction_id} not found")

        # Determine reported amount
        if request.reported_amount_rupees:
            reported_paise = rupees_to_paise(request.reported_amount_rupees)
        else:
            reported_paise = txn.amount_paise

        # Create case
        case_id = generate_case_id()
        case = FraudCase(
            case_id=case_id,
            reporting_account_id=request.reporting_account_id,
            reported_transaction_id=request.transaction_id,
            fraud_category=request.fraud_category,
            reported_amount_paise=reported_paise,
            description=request.description,
            device_info=request.device_info,
            status="UNDER_INVESTIGATION",
        )
        db.add(case)

        # Audit
        db.add(AuditLog(
            log_id=generate_log_id(),
            entity_type="FRAUD_CASE",
            entity_id=case_id,
            action="CREATE",
            actor=request.reporting_account_id,
            details=json.dumps({"fraud_category": request.fraud_category}),
        ))

        db.commit()

        # Activate trace
        trace_id = activate_trace(db, case_id, request.transaction_id, reported_paise)
        db.commit()

        return {
            "case_id": case_id,
            "reporting_account_id": request.reporting_account_id,
            "reported_transaction_id": request.transaction_id,
            "fraud_category": request.fraud_category,
            "reported_amount_rupees": paise_to_rupees(reported_paise),
            "description": request.description,
            "status": case.status,
            "trace_id": trace_id,
            "created_at": case.created_at,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/cases", response_model=list)
def list_cases(status: str = Query(None), db: Session = Depends(get_db)):
    query = db.query(FraudCase)
    if status:
        query = query.filter(FraudCase.status == status)
    cases = query.order_by(FraudCase.created_at.desc()).all()
    result = []
    for c in cases:
        trace = db.query(TraceOrigin).filter(TraceOrigin.case_id == c.case_id).first()
        result.append({
            "case_id": c.case_id,
            "reporting_account_id": c.reporting_account_id,
            "reported_transaction_id": c.reported_transaction_id,
            "fraud_category": c.fraud_category,
            "reported_amount_rupees": paise_to_rupees(c.reported_amount_paise),
            "description": c.description,
            "status": c.status,
            "trace_id": trace.trace_id if trace else None,
            "created_at": c.created_at,
        })
    return result


@router.get("/cases/{case_id}", response_model=FraudCaseResponse)
def get_case(case_id: str, db: Session = Depends(get_db)):
    case = db.query(FraudCase).filter(FraudCase.case_id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    trace = db.query(TraceOrigin).filter(TraceOrigin.case_id == case_id).first()
    return {
        "case_id": case.case_id,
        "reporting_account_id": case.reporting_account_id,
        "reported_transaction_id": case.reported_transaction_id,
        "fraud_category": case.fraud_category,
        "reported_amount_rupees": paise_to_rupees(case.reported_amount_paise),
        "description": case.description,
        "status": case.status,
        "trace_id": trace.trace_id if trace else None,
        "created_at": case.created_at,
    }


@router.get("/alerts", response_model=list)
def list_alerts(account_id: str = Query(None), severity: str = Query(None),
                db: Session = Depends(get_db)):
    return get_alerts(db, account_id, severity)


@router.get("/alerts/{alert_id}")
def get_alert_detail(alert_id: str, db: Session = Depends(get_db)):
    alert = db.query(FraudAlert).filter(FraudAlert.alert_id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")

    txn = None
    if alert.transaction_id:
        txn_obj = db.query(Transaction).filter(
            Transaction.transaction_id == alert.transaction_id
        ).first()
        if txn_obj:
            txn = {
                "transaction_id": txn_obj.transaction_id,
                "sender_account_id": txn_obj.sender_account_id,
                "receiver_account_id": txn_obj.receiver_account_id,
                "amount_rupees": paise_to_rupees(txn_obj.amount_paise),
                "status": txn_obj.status,
                "description": txn_obj.description,
                "created_at": txn_obj.created_at,
            }

    latest_risk = (
        db.query(RiskAssessment)
        .filter(RiskAssessment.account_id == alert.account_id)
        .order_by(RiskAssessment.created_at.desc())
        .first()
    )

    related_case = None
    if alert.transaction_id:
        related_case = (
            db.query(FraudCase)
            .filter(FraudCase.reported_transaction_id == alert.transaction_id)
            .first()
        )

    return {
        "alert_id": alert.alert_id,
        "account_id": alert.account_id,
        "transaction_id": alert.transaction_id,
        "rule_triggered": alert.rule_triggered,
        "reason": alert.reason,
        "risk_score": alert.risk_score,
        "severity": alert.severity,
        "status": alert.status,
        "evidence": json.loads(alert.evidence) if alert.evidence else None,
        "created_at": alert.created_at,
        "transaction": txn,
        "account_risk_score": latest_risk.overall_score if latest_risk else None,
        "account_risk_category": latest_risk.risk_category if latest_risk else None,
        "related_case_id": related_case.case_id if related_case else None,
    }


class AlertReviewRequest(BaseModel):
    status: str = Field(..., pattern="^(REVIEWED|ESCALATED|DISMISSED)$")
    reviewer: str = Field(default="Banker_Admin")
    notes: str | None = None


@router.post("/alerts/{alert_id}/review")
def review_alert(alert_id: str, request: AlertReviewRequest, db: Session = Depends(get_db)):
    alert = db.query(FraudAlert).filter(FraudAlert.alert_id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
    alert.status = request.status
    db.add(AuditLog(
        log_id=generate_log_id(),
        entity_type="ALERT",
        entity_id=alert_id,
        action="REVIEW",
        actor=request.reviewer,
        details=json.dumps({"status": request.status, "notes": request.notes}),
    ))
    db.commit()
    return {
        "alert_id": alert.alert_id,
        "status": alert.status,
        "reviewer": request.reviewer,
    }


@router.get("/trace/{trace_id}", response_model=TraceResult)
def trace_money(trace_id: str, db: Session = Depends(get_db)):
    try:
        return get_trace_summary(db, trace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
