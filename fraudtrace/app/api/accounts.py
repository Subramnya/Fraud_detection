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
