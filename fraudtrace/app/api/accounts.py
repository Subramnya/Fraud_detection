"""Account API endpoints."""
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from fraudtrace.app.core.database import get_db
from fraudtrace.app.models.account import Account
from fraudtrace.app.models.allocation import FundAllocation
from fraudtrace.app.models.audit_log import AuditLog
from fraudtrace.app.schemas.account import AccountRegister, AccountResponse, AccountBalance, AccountAllocations
from fraudtrace.app.services.account_service import (
    register_account, get_account, get_all_accounts,
    get_account_balance, get_account_allocations,
)
from fraudtrace.app.utils.identifiers import generate_allocation_id, generate_log_id
from fraudtrace.app.utils.helpers import rupees_to_paise, paise_to_rupees

router = APIRouter(prefix="/api/accounts", tags=["Accounts"])


class VirtualTopupRequest(BaseModel):
    amount_rupees: float = Field(..., gt=0, le=1000000)


@router.post("/{account_id}/topup")
def topup_virtual_money(account_id: str, request: VirtualTopupRequest, db: Session = Depends(get_db)):
    """Add simulated virtual money to an account (prototype only)."""
    account = db.query(Account).filter(Account.account_id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    if not account.is_active:
        raise HTTPException(status_code=400, detail=f"Account {account_id} is inactive")

    add_paise = rupees_to_paise(request.amount_rupees)
    account.balance_paise += add_paise
    db.add(FundAllocation(
        allocation_id=generate_allocation_id(),
        account_id=account_id,
        origin_transaction_id="VIRTUAL_TOPUP",
        amount_paise=add_paise,
        is_active=True,
    ))
    db.add(AuditLog(
        log_id=generate_log_id(),
        entity_type="ACCOUNT",
        entity_id=account_id,
        action="VIRTUAL_TOPUP",
        actor=account_id,
        details=json.dumps({"amount_rupees": request.amount_rupees}),
    ))
    db.commit()
    db.refresh(account)
    return {
        "account_id": account_id,
        "added_rupees": request.amount_rupees,
        "balance_rupees": paise_to_rupees(account.balance_paise),
        "simulated": True,
    }


@router.post("/register", response_model=AccountResponse)
def register(request: AccountRegister, db: Session = Depends(get_db)):
    try:
        result = register_account(
            db, request.name, request.email, request.phone,
            request.initial_balance_rupees, request.account_type,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=list)
def list_accounts(db: Session = Depends(get_db)):
    return get_all_accounts(db)


@router.get("/{account_id}", response_model=AccountResponse)
def get_account_detail(account_id: str, db: Session = Depends(get_db)):
    try:
        return get_account(db, account_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{account_id}/balance", response_model=AccountBalance)
def get_balance(account_id: str, db: Session = Depends(get_db)):
    try:
        return get_account_balance(db, account_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{account_id}/allocations", response_model=AccountAllocations)
def get_allocations(account_id: str, db: Session = Depends(get_db)):
    try:
        return get_account_allocations(db, account_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


class AccountTypeUpdate(BaseModel):
    account_type: str = Field(..., pattern="^(NORMAL|FRAUDSTER)$")


@router.patch("/{account_id}/role")
def update_account_role(account_id: str, request: AccountTypeUpdate, db: Session = Depends(get_db)):
    """Mark an account as NORMAL or FRAUDSTER for demo purposes."""
    acc = db.query(Account).filter(Account.account_id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    acc.account_type = request.account_type
    db.commit()
    return {"account_id": acc.account_id, "account_type": acc.account_type}


@router.delete("/{account_id}")
def delete_account(account_id: str, db: Session = Depends(get_db)):
    """Delete an account and its dependent records (demo/admin cleanup)."""
    from sqlalchemy import text
    acc = db.query(Account).filter(Account.account_id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")

    user_id = acc.user_id
    db.execute(text("PRAGMA foreign_keys=OFF"))
    for tbl, col in [
        ("notifications", "account_id"),
        ("freeze_requests", "account_id"),
        ("risk_assessments", "account_id"),
        ("fraud_alerts", "account_id"),
        ("fraud_cases", "reporting_account_id"),
        ("ledger_entries", "account_id"),
        ("fund_allocations", "account_id"),
        ("cybercell_reports", "account_id"),
    ]:
        db.execute(text(f"DELETE FROM {tbl} WHERE {col} = :aid"), {"aid": account_id})
    db.execute(
        text("DELETE FROM transactions WHERE sender_account_id = :aid OR receiver_account_id = :aid"),
        {"aid": account_id},
    )
    db.execute(text("DELETE FROM accounts WHERE account_id = :aid"), {"aid": account_id})
    db.execute(text("DELETE FROM users WHERE user_id = :uid"), {"uid": user_id})
    db.execute(text("PRAGMA foreign_keys=ON"))
    db.commit()
    return {"deleted": True, "account_id": account_id}


@router.get("/{account_id}/fraud-warning")
def check_fraud_warning(account_id: str, db: Session = Depends(get_db)):
    """Check if an account has actually been detected for fraud earlier."""
    from fraudtrace.app.models.fraud_alert import FraudAlert
    from fraudtrace.app.models.fraud_case import FraudCase
    acc = db.query(Account).filter(Account.account_id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")

    alert_count = db.query(FraudAlert).filter(FraudAlert.account_id == account_id).count()
    case_count = db.query(FraudCase).filter(FraudCase.reporting_account_id == account_id).count()
    detected_earlier = alert_count > 0 or case_count > 0 or bool(getattr(acc, "is_frozen", False))
    return {
        "account_id": account_id,
        "detected_earlier": detected_earlier,
        "alert_count": alert_count,
        "case_count": case_count,
    }
