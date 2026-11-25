"""Investigation and freeze prioritization engine."""
from sqlalchemy.orm import Session
from fraudtrace.app.models.account import Account
from fraudtrace.app.models.allocation import FundAllocation, TraceOrigin
from fraudtrace.app.models.fraud_case import FraudCase
from fraudtrace.app.services.risk_service import assess_account_risk
from fraudtrace.app.services.lineage_service import get_account_traceable_balance
from fraudtrace.app.core.config import settings
from fraudtrace.app.utils.helpers import paise_to_rupees


def calculate_investigation_priority(db: Session, case_id: str) -> list:
    """Calculate investigation priority for all accounts in a case."""
    case = db.query(FraudCase).filter(FraudCase.case_id == case_id).first()
    if not case:
        raise ValueError(f"Case {case_id} not found")

    trace_origin = db.query(TraceOrigin).filter(TraceOrigin.case_id == case_id).first()
    if not trace_origin:
        raise ValueError(f"No trace found for case {case_id}")

    # Find all accounts holding traced funds
    traced_allocs = (
        db.query(FundAllocation)
        .filter(
            FundAllocation.trace_id == trace_origin.trace_id,
            FundAllocation.is_active == True,
            FundAllocation.amount_paise > 0,
        )
        .all()
    )

    account_funds = {}
    for alloc in traced_allocs:
        if alloc.account_id not in account_funds:
            account_funds[alloc.account_id] = 0
        account_funds[alloc.account_id] += alloc.amount_paise

    priorities = []
    max_amount = max(account_funds.values()) if account_funds else 1
    max_traceable = max(account_funds.values()) if account_funds else 1

    for acc_id, traceable_paise in account_funds.items():
        account = db.query(Account).filter(Account.account_id == acc_id).first()
        if not account:
            continue

        # Get risk assessment
        risk_result = assess_account_risk(db, acc_id)

        # Normalize scores
        amount_normalized = min(traceable_paise / max(max_amount, 1), 1.0)
        risk_normalized = risk_result["overall_score"]
        traceable_normalized = min(traceable_paise / max(max_traceable, 1), 1.0)

        # Urgency based on how recently money was received
        urgency = 0.5  # Default medium urgency

        # Calculate priority
        priority_score = (
            settings.PRIORITY_WEIGHT_AMOUNT * amount_normalized +
            settings.PRIORITY_WEIGHT_RISK * risk_normalized +
            settings.PRIORITY_WEIGHT_TRACEABLE * traceable_normalized +
            settings.PRIORITY_WEIGHT_URGENCY * urgency
        )

        priorities.append({
            "account_id": acc_id,
            "priority_score": round(priority_score, 4),
            "amount_score": round(amount_normalized, 4),
            "risk_score": round(risk_normalized, 4),
            "traceable_money_score": round(traceable_normalized, 4),
            "urgency_score": urgency,
            "traceable_balance_rupees": paise_to_rupees(traceable_paise),
            "available_balance_rupees": paise_to_rupees(account.balance_paise),
        })

    # Sort by priority (highest first)
    priorities.sort(key=lambda x: x["priority_score"], reverse=True)
    return priorities


def calculate_freeze_priority(db: Session, case_id: str) -> list:
    """Calculate freeze amounts for accounts in a case."""
    case = db.query(FraudCase).filter(FraudCase.case_id == case_id).first()
    if not case:
        raise ValueError(f"Case {case_id} not found")

    trace_origin = db.query(TraceOrigin).filter(TraceOrigin.case_id == case_id).first()
    if not trace_origin:
        raise ValueError(f"No trace found for case {case_id}")

    traced_allocs = (
        db.query(FundAllocation)
        .filter(
            FundAllocation.trace_id == trace_origin.trace_id,
            FundAllocation.is_active == True,
            FundAllocation.amount_paise > 0,
        )
        .all()
    )

    account_traceable = {}
    for alloc in traced_allocs:
        if alloc.account_id not in account_traceable:
            account_traceable[alloc.account_id] = 0
        account_traceable[alloc.account_id] += alloc.amount_paise

    freeze_list = []
    for acc_id, traceable_paise in account_traceable.items():
        account = db.query(Account).filter(Account.account_id == acc_id).first()
        if not account:
            continue

        suggested = min(traceable_paise, account.balance_paise)

        freeze_list.append({
            "account_id": acc_id,
            "suggested_amount_rupees": paise_to_rupees(suggested),
            "suggested_amount_paise": suggested,
            "traceable_balance_rupees": paise_to_rupees(traceable_paise),
            "available_balance_rupees": paise_to_rupees(account.balance_paise),
            "trace_id": trace_origin.trace_id,
        })

    # Sort by suggested amount (highest first)
    freeze_list.sort(key=lambda x: x["suggested_amount_paise"], reverse=True)
    return freeze_list
