"""Account management service."""
import json
from sqlalchemy.orm import Session
from fraudtrace.app.models.user import User
from fraudtrace.app.models.account import Account
from fraudtrace.app.models.audit_log import AuditLog
from fraudtrace.app.models.allocation import FundAllocation
from fraudtrace.app.utils.identifiers import (
    generate_user_id, generate_account_id, generate_allocation_id,
    generate_log_id, generate_trace_id,
)
from fraudtrace.app.utils.helpers import rupees_to_paise, paise_to_rupees


def register_account(db: Session, name: str, email: str, phone: str = None,
                     initial_balance_rupees: float = 0.0,
                     account_type: str = "NORMAL") -> dict:
    """Register a new user and account."""
    # Check email uniqueness
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise ValueError(f"Email {email} already registered")

    user_id = generate_user_id()
    account_id = generate_account_id()
    user_trace_id = generate_trace_id()
    initial_paise = rupees_to_paise(initial_balance_rupees)

    user = User(
        user_id=user_id,
        name=name,
        email=email,
        phone=phone,
    )
    account = Account(
        account_id=account_id,
        user_id=user_id,
        account_name=name,
        balance_paise=initial_paise,
        account_type=account_type,
        user_trace_id=user_trace_id,
    )
    db.add(user)
    db.add(account)

    # Create initial allocation if balance > 0
    if initial_paise > 0:
        # Create a synthetic "INITIAL_DEPOSIT" origin
        alloc = FundAllocation(
            allocation_id=generate_allocation_id(),
            account_id=account_id,
            origin_transaction_id="INITIAL_DEPOSIT",
            amount_paise=initial_paise,
            is_active=True,
        )
        db.add(alloc)

    # Audit log
    db.add(AuditLog(
        log_id=generate_log_id(),
        entity_type="ACCOUNT",
        entity_id=account_id,
        action="CREATE",
        actor="SYSTEM",
        details=json.dumps({"name": name, "initial_balance": initial_balance_rupees}),
    ))

    db.commit()
    db.refresh(account)

    return {
        "account_id": account_id,
        "user_id": user_id,
        "account_name": name,
        "balance_rupees": paise_to_rupees(account.balance_paise),
        "is_active": account.is_active,
        "is_frozen": bool(getattr(account, "is_frozen", False)),
        "account_type": account.account_type,
        "created_at": account.created_at,
    }


def get_account(db: Session, account_id: str) -> dict:
    """Get account details."""
    account = db.query(Account).filter(Account.account_id == account_id).first()
    if not account:
        raise ValueError(f"Account {account_id} not found")
    return {
        "account_id": account.account_id,
        "user_id": account.user_id,
        "account_name": account.account_name,
        "balance_rupees": paise_to_rupees(account.balance_paise),
        "is_active": account.is_active,
        "is_frozen": bool(getattr(account, "is_frozen", False)),
        "account_type": account.account_type,
        "created_at": account.created_at,
    }


def get_all_accounts(db: Session) -> list:
    """Get all accounts."""
    accounts = db.query(Account).all()
    return [
        {
            "account_id": a.account_id,
            "user_id": a.user_id,
            "account_name": a.account_name,
            "balance_rupees": paise_to_rupees(a.balance_paise),
            "is_active": a.is_active,
            "is_frozen": bool(getattr(a, "is_frozen", False)),
            "account_type": a.account_type,
            "created_at": a.created_at,
        }
        for a in accounts
    ]


def get_account_balance(db: Session, account_id: str) -> dict:
    """Get account balance."""
    account = db.query(Account).filter(Account.account_id == account_id).first()
    if not account:
        raise ValueError(f"Account {account_id} not found")
    return {
        "account_id": account.account_id,
        "balance_rupees": paise_to_rupees(account.balance_paise),
        "balance_paise": account.balance_paise,
    }


def get_account_allocations(db: Session, account_id: str) -> dict:
    """Get all active fund allocations for an account."""
    account = db.query(Account).filter(Account.account_id == account_id).first()
    if not account:
        raise ValueError(f"Account {account_id} not found")

    allocations = (
        db.query(FundAllocation)
        .filter(FundAllocation.account_id == account_id, FundAllocation.is_active == True)
        .all()
    )

    alloc_list = []
    traceable_total = 0
    legitimate_total = 0

    for a in allocations:
        info = {
            "allocation_id": a.allocation_id,
            "origin_transaction_id": a.origin_transaction_id,
            "trace_id": a.trace_id,
            "amount_rupees": paise_to_rupees(a.amount_paise),
            "amount_paise": a.amount_paise,
            "is_active": a.is_active,
            "parent_allocation_id": a.parent_allocation_id,
            "created_at": a.created_at,
        }
        alloc_list.append(info)
        if a.trace_id:
            traceable_total += a.amount_paise
        else:
            legitimate_total += a.amount_paise

    return {
        "account_id": account_id,
        "total_balance_rupees": paise_to_rupees(account.balance_paise),
        "allocations": alloc_list,
        "traceable_total_rupees": paise_to_rupees(traceable_total),
        "legitimate_total_rupees": paise_to_rupees(legitimate_total),
    }
