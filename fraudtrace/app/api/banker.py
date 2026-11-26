"""Banker operations API: real-time account view, add/deduct funds, freeze & auto-report."""
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from fraudtrace.app.core.database import get_db
from fraudtrace.app.models.account import Account
from fraudtrace.app.models.transaction import Transaction
from fraudtrace.app.models.allocation import FundAllocation
from fraudtrace.app.models.fraud_case import FraudCase
from fraudtrace.app.models.fraud_alert import FraudAlert
from fraudtrace.app.models.audit_log import AuditLog
from fraudtrace.app.services.lineage_service import activate_trace
from fraudtrace.app.services.report_service import generate_investigation_report
from fraudtrace.app.services.notification_service import create_notification
from fraudtrace.app.services.graph_service import get_graph_for_account
from fraudtrace.app.services.ai_model_service import compute_and_store_risk_assessment
from fraudtrace.app.models.risk_assessment import RiskAssessment
from fraudtrace.app.utils.identifiers import (
    generate_allocation_id,
    generate_case_id,
    generate_log_id,
)
from fraudtrace.app.utils.helpers import paise_to_rupees, rupees_to_paise

router = APIRouter(prefix="/api/banker", tags=["Banker Operations"])


@router.get("/accounts")
def banker_accounts_overview(db: Session = Depends(get_db)):
    """Real-time accounts view with latest credit/debit & timestamps."""
    accounts = db.query(Account).filter(Account.account_type != "FRAUDSTER_PARTNER").all()
    items = []
    for a in accounts:
        latest_txn = (
            db.query(Transaction)
            .filter(
                (Transaction.sender_account_id == a.account_id)
                | (Transaction.receiver_account_id == a.account_id)
            )
            .order_by(Transaction.created_at.desc())
            .first()
        )
        latest_info = None
        if latest_txn:
            is_debit = latest_txn.sender_account_id == a.account_id
            latest_info = {
                "transaction_id": latest_txn.transaction_id,
                "trace_id": latest_txn.trace_id,
                "type": "DEBIT" if is_debit else "CREDIT",
                "amount_rupees": paise_to_rupees(latest_txn.amount_paise),
                "timestamp": latest_txn.created_at,
                "peer_account_id": (
                    latest_txn.receiver_account_id if is_debit else latest_txn.sender_account_id
                ),
            }
        open_alerts = (
            db.query(FraudAlert)
            .filter(FraudAlert.account_id == a.account_id, FraudAlert.status == "NEW")
            .count()
        )
        items.append({
            "account_id": a.account_id,
            "account_name": a.account_name,
            "balance_rupees": paise_to_rupees(a.balance_paise),
            "is_active": a.is_active,
            "is_frozen": bool(getattr(a, "is_frozen", False)),
            "account_type": a.account_type,
            "open_alerts": open_alerts,
            "latest_transaction": latest_info,
        })
    return items


class BankerAdjustRequest(BaseModel):
    action: str = Field(..., pattern="^(ADD|DEDUCT)$")
    amount_rupees: float = Field(..., gt=0)
    reason: str = Field(default="Banker manual adjustment")


@router.post("/accounts/{account_id}/adjust")
def adjust_account_balance(
    account_id: str, request: BankerAdjustRequest, db: Session = Depends(get_db)
):
    """Banker Add or Deduct amount on an account."""
    acc = db.query(Account).filter(Account.account_id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")

    delta_paise = rupees_to_paise(request.amount_rupees)
    if request.action == "ADD":
        acc.balance_paise += delta_paise
        db.add(
            FundAllocation(
                allocation_id=generate_allocation_id(),
                account_id=account_id,
                origin_transaction_id="BANKER_CREDIT_ADJUSTMENT",
                amount_paise=delta_paise,
                is_active=True,
            )
        )
    else:
        if acc.balance_paise < delta_paise:
            raise HTTPException(status_code=400, detail="Insufficient balance to deduct")
        acc.balance_paise -= delta_paise
        # Reduce active allocations proportionally/sequentially
        remaining = delta_paise
        allocs = (
            db.query(FundAllocation)
            .filter(FundAllocation.account_id == account_id, FundAllocation.is_active == True)
            .all()
        )
        for al in allocs:
            if remaining <= 0:
                break
            take = min(al.amount_paise, remaining)
            al.amount_paise -= take
            if al.amount_paise == 0:
                al.is_active = False
            remaining -= take

    db.add(
        AuditLog(
            log_id=generate_log_id(),
            entity_type="ACCOUNT",
            entity_id=account_id,
            action=f"BANKER_{request.action}",
            actor="BANKER",
            details=json.dumps({"amount_rupees": request.amount_rupees, "reason": request.reason}),
        )
    )
    db.commit()
    return {
        "account_id": account_id,
        "action": request.action,
        "amount_rupees": request.amount_rupees,
        "balance_rupees": paise_to_rupees(acc.balance_paise),
    }


class BankerFreezeRequest(BaseModel):
    reason: str = Field(default="Frozen by Banker due to detected fraud activity")


@router.post("/accounts/{account_id}/freeze")
def freeze_account_and_report(
    account_id: str, request: BankerFreezeRequest, db: Session = Depends(get_db)
):
    """Freeze account immediately, stop all transactions, generate report, and notify user."""
    acc = db.query(Account).filter(Account.account_id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")

    acc.is_frozen = True
    acc.is_active = False

    # Mark alerts on this account as REPORTED so AI Model page removes them after reporting
    db.query(FraudAlert).filter(
        FraudAlert.account_id == account_id,
        FraudAlert.status.in_(["NEW", "REVIEWED", "ESCALATED"]),
    ).update({"status": "REPORTED"})

    # Find latest transaction for case creation if needed
    latest_txn = (
        db.query(Transaction)
        .filter(
            (Transaction.sender_account_id == account_id)
            | (Transaction.receiver_account_id == account_id)
        )
        .order_by(Transaction.created_at.desc())
        .first()
    )

    report = None
    case_id = None
    if latest_txn:
        existing_case = (
            db.query(FraudCase)
            .filter(FraudCase.reported_transaction_id == latest_txn.transaction_id)
            .first()
        )
        if existing_case:
            case_id = existing_case.case_id
        else:
            case_id = generate_case_id()
            case = FraudCase(
                case_id=case_id,
                reporting_account_id=account_id,
                reported_transaction_id=latest_txn.transaction_id,
                fraud_category="UNAUTHORIZED_DEBIT",
                reported_amount_paise=latest_txn.amount_paise,
                description=request.reason,
                status="RESOLVED",
            )
            db.add(case)
            db.commit()
            activate_trace(db, case_id, latest_txn.transaction_id, latest_txn.amount_paise)
            db.commit()

        report = generate_investigation_report(db, case_id)
    else:
        graph = get_graph_for_account(db, account_id)
        report = {
            "case_id": None,
            "account_id": account_id,
            "reason": request.reason,
            "graph": graph,
        }

    # Send report notification to the User so they can Report to Cyber Cell or Cancel
    create_notification(
        db,
        recipient_role="CUSTOMER",
        account_id=account_id,
        category="SECURITY",
        severity="HIGH",
        title="Account Frozen & Investigation Report Ready",
        message=(
            f"Your account {account_id} has been frozen by the Bank to stop unauthorized activity. "
            f"Full fraud & graph report is ready. You can forward it to Cyber Cell or dismiss."
        ),
        transaction_id=latest_txn.transaction_id if latest_txn else None,
        case_id=case_id,
    )

    db.add(
        AuditLog(
            log_id=generate_log_id(),
            entity_type="ACCOUNT",
            entity_id=account_id,
            action="BANKER_FREEZE",
            actor="BANKER",
            details=json.dumps({"case_id": case_id, "reason": request.reason}),
        )
    )
    db.commit()

    return {
        "account_id": account_id,
        "is_frozen": True,
        "case_id": case_id,
        "report": report,
    }


@router.get("/alerts/prioritized")
def get_prioritized_live_alerts(db: Session = Depends(get_db)):
    """Return 1 grouped alert per user sorted strictly by Risk Category (CRITICAL->LOW) & descending Risk Score (0-100)."""
    alerts = (
        db.query(FraudAlert)
        .filter(FraudAlert.status != "REPORTED")
        .order_by(FraudAlert.created_at.desc())
        .all()
    )
    if not alerts:
        return []

    by_acc: dict[str, list[FraudAlert]] = {}
    for al in alerts:
        by_acc.setdefault(al.account_id, []).append(al)

    severity_rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    acc_map = {
        a.account_id: a
        for a in db.query(Account).filter(Account.account_id.in_(by_acc.keys())).all()
    }

    results = []
    for acc_id, user_alerts in by_acc.items():
        acc = acc_map.get(acc_id)
        ra = (
            db.query(RiskAssessment)
            .filter(RiskAssessment.account_id == acc_id)
            .order_by(RiskAssessment.created_at.desc())
            .first()
        )
        if not ra:
            ra_dict = compute_and_store_risk_assessment(db, acc_id, alert_id=user_alerts[0].alert_id)
        else:
            bd = json.loads(ra.breakdown_json) if ra.breakdown_json else {}
            ra_dict = {
                "assessment_id": ra.assessment_id,
                "account_id": ra.account_id,
                "alert_id": ra.alert_id,
                "case_id": ra.case_id,
                "overall_score": ra.overall_score,
                "risk_category": ra.risk_category,
                "factors": bd.get("factors", []),
                "observations": bd.get("observations", []),
                "explanation": ra.explanation,
                "model_version": ra.model_version,
                "created_at": str(ra.created_at) if ra.created_at else None,
            }

        latest_al = user_alerts[0]
        latest_txn = None
        if latest_al.transaction_id:
            latest_txn = db.query(Transaction).filter(
                Transaction.transaction_id == latest_al.transaction_id
            ).first()

        results.append({
            "account_id": acc_id,
            "account_name": acc.account_name if acc else acc_id,
            "is_frozen": bool(getattr(acc, "is_frozen", False)) if acc else False,
            "alert_id": latest_al.alert_id,
            "transaction_id": latest_al.transaction_id,
            "amount_rupees": paise_to_rupees(latest_txn.amount_paise) if latest_txn else 0.0,
            "risk_score": round(ra_dict["overall_score"], 1),
            "risk_category": ra_dict["risk_category"],
            "primary_reason": latest_al.reason,
            "status": latest_al.status,
            "last_activity_at": str(latest_al.created_at) if latest_al.created_at else None,
            "risk_assessment": ra_dict,
            "supporting_alerts": [
                {
                    "alert_id": a.alert_id,
                    "transaction_id": a.transaction_id,
                    "rule_triggered": a.rule_triggered,
                    "severity": a.severity,
                    "reason": a.reason,
                    "created_at": str(a.created_at) if a.created_at else None,
                }
                for a in user_alerts
            ],
        })

    results.sort(
        key=lambda x: (
            severity_rank.get(x["risk_category"], 9),
            -float(x["risk_score"]),
        )
    )
    return results
