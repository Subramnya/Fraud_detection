"""Cyber Cell API endpoints with human-readable text report + AI graph."""
import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from fraudtrace.app.core.database import get_db
from fraudtrace.app.models.cybercell_report import CyberCellReport
from fraudtrace.app.models.account import Account
from fraudtrace.app.models.fraud_alert import FraudAlert
from fraudtrace.app.models.transaction import Transaction
from fraudtrace.app.services.ai_model_service import (
    get_ai_graph_for_case,
    refresh_graph_freeze_flags,
    save_case_ai_graph,
)
from fraudtrace.app.utils.helpers import paise_to_rupees

router = APIRouter(prefix="/api/cybercell", tags=["Cyber Cell"])


class CyberCellSubmit(BaseModel):
    account_id: str
    case_id: str | None = None
    submitted_by: str
    fraud_type: str = Field(default="UNAUTHORIZED_ACCESS")
    summary: str


class CyberCellStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(PENDING|INVESTIGATING|RESOLVED)$")


def _build_text_report(
    report_id: str,
    acc: Account | None,
    account_id: str,
    case_id: str | None,
    submitted_by: str,
    fraud_type: str,
    summary: str,
    alerts: list[FraudAlert],
    txns: list[Transaction],
) -> str:
    lines = [
        "======================================================================",
        "           FRAUDTRACE CYBER CELL INVESTIGATION REPORT",
        "======================================================================",
        f"Report ID        : {report_id}",
        f"Case ID          : {case_id or 'N/A'}",
        f"Account ID       : {account_id}",
        f"Account Holder   : {acc.account_name if acc else account_id}",
        f"Account Status   : {'FROZEN' if (acc and acc.is_frozen) else 'ACTIVE'}",
        f"Submitted By     : {submitted_by}",
        f"Fraud Category   : {fraud_type}",
        "",
        "--- SUMMARY ---",
        summary,
        "",
        "--- WHY & HOW DETECTED (RULES + SCIKIT-LEARN AI MODEL) ---",
    ]
    if not alerts:
        lines.append("  No automated alerts recorded; manually escalated.")
    else:
        for a in alerts:
            lines.append(
                f"  * [{a.severity}] Rule: {a.rule_triggered} | Risk Score: {a.risk_score:.2f} | "
                f"Txn: {a.transaction_id or '-'} | Reason: {a.reason}"
            )
    lines.append("")
    lines.append("--- SUPPORTING TRANSACTIONS & TRACE LINEAGE ---")
    for t in txns[:30]:
        lines.append(
            f"  {t.transaction_id} | Trace: {t.trace_id or '-'} | "
            f"{t.sender_account_id} -> {t.receiver_account_id} | "
            f"INR {paise_to_rupees(t.amount_paise):,.2f} | {t.created_at}"
        )
    lines.append("======================================================================")
    return "\n".join(lines)


@router.post("/report")
def submit_to_cybercell(request: CyberCellSubmit, db: Session = Depends(get_db)):
    """Submit a verified user fraud report to Cyber Cell with text report + AI 2D graph."""
    acc = db.query(Account).filter(Account.account_id == request.account_id).first()
    alerts = (
        db.query(FraudAlert)
        .filter(FraudAlert.account_id == request.account_id)
        .order_by(FraudAlert.created_at.desc())
        .all()
    )
    txns = (
        db.query(Transaction)
        .filter(
            (Transaction.sender_account_id == request.account_id)
            | (Transaction.receiver_account_id == request.account_id)
        )
        .order_by(Transaction.created_at.asc())
        .all()
    )

    graph_json = get_ai_graph_for_case(
        db, case_id=request.case_id, account_id=request.account_id
    )
    if request.case_id and graph_json.get("nodes"):
        save_case_ai_graph(request.case_id, graph_json)

    report_id = f"CYB_{uuid.uuid4().hex[:8].upper()}"
    text_report = _build_text_report(
        report_id, acc, request.account_id, request.case_id,
        request.submitted_by, request.fraud_type, request.summary, alerts, txns,
    )

    payload = {
        "text_report": text_report,
        "graph": graph_json,
    }

    rec = CyberCellReport(
        report_id=report_id,
        case_id=request.case_id,
        account_id=request.account_id,
        submitted_by=request.submitted_by,
        fraud_type=request.fraud_type,
        summary=request.summary,
        report_payload=json.dumps(payload, default=str),
        status="PENDING",
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {
        "report_id": rec.report_id,
        "case_id": rec.case_id,
        "account_id": rec.account_id,
        "status": rec.status,
        "created_at": rec.created_at,
    }


@router.get("/reports")
def list_cybercell_reports(db: Session = Depends(get_db)):
    rows = db.query(CyberCellReport).order_by(CyberCellReport.created_at.desc()).all()
    return [
        {
            "report_id": r.report_id,
            "case_id": r.case_id,
            "account_id": r.account_id,
            "submitted_by": r.submitted_by,
            "fraud_type": r.fraud_type,
            "summary": r.summary,
            "report_payload": json.loads(r.report_payload) if r.report_payload else None,
            "status": r.status,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.post("/reports/{report_id}/status")
def update_cybercell_status(
    report_id: str, request: CyberCellStatusUpdate, db: Session = Depends(get_db)
):
    rec = db.query(CyberCellReport).filter(CyberCellReport.report_id == report_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")
    rec.status = request.status
    db.commit()
    return {"report_id": rec.report_id, "status": rec.status}


@router.get("/reports/{report_id}/graph")
def get_cybercell_report_graph(report_id: str, db: Session = Depends(get_db)):
    """Retrieve the exact live AI-generated fraud transaction graph associated with this report."""
    rec = db.query(CyberCellReport).filter(CyberCellReport.report_id == report_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")
    if rec.report_payload:
        try:
            payload = json.loads(rec.report_payload)
            stored_graph = payload.get("graph") if isinstance(payload, dict) else None
            if isinstance(stored_graph, dict) and stored_graph.get("nodes"):
                stored_graph = refresh_graph_freeze_flags(db, stored_graph)
                stored_graph["available"] = True
                return stored_graph
        except Exception:
            pass
    return get_ai_graph_for_case(db, case_id=rec.case_id, account_id=rec.account_id)
