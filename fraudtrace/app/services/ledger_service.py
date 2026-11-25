"""Ledger service for recording financial entries."""
from sqlalchemy.orm import Session
from fraudtrace.app.models.transaction import LedgerEntry
from fraudtrace.app.utils.identifiers import generate_entry_id


def record_debit(db: Session, transaction_id: str, account_id: str,
                 amount_paise: int, balance_after_paise: int) -> LedgerEntry:
    """Record a debit ledger entry."""
    entry = LedgerEntry(
        entry_id=generate_entry_id(),
        transaction_id=transaction_id,
        account_id=account_id,
        entry_type="DEBIT",
        amount_paise=amount_paise,
        balance_after_paise=balance_after_paise,
    )
    db.add(entry)
    return entry


def record_credit(db: Session, transaction_id: str, account_id: str,
                  amount_paise: int, balance_after_paise: int) -> LedgerEntry:
    """Record a credit ledger entry."""
    entry = LedgerEntry(
        entry_id=generate_entry_id(),
        transaction_id=transaction_id,
        account_id=account_id,
        entry_type="CREDIT",
        amount_paise=amount_paise,
        balance_after_paise=balance_after_paise,
    )
    db.add(entry)
    return entry
