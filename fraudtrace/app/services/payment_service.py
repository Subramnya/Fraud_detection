"""Virtual payment processing engine."""
import json
from sqlalchemy.orm import Session
from fraudtrace.app.models.account import Account
from fraudtrace.app.models.transaction import Transaction
from fraudtrace.app.models.audit_log import AuditLog
from fraudtrace.app.services.ledger_service import record_debit, record_credit
from fraudtrace.app.services.allocation_service import allocate_outgoing
from fraudtrace.app.utils.identifiers import generate_transaction_id, generate_log_id
from fraudtrace.app.utils.helpers import paise_to_rupees, rupees_to_paise


def process_payment(db: Session, sender_account_id: str, receiver_account_id: str,
                    amount_rupees: float, description: str = None) -> dict:
    """Process a virtual payment between two accounts."""
    amount_paise = rupees_to_paise(amount_rupees)

    # Validations
    if amount_paise <= 0:
        raise ValueError("Amount must be positive")

    if sender_account_id == receiver_account_id:
        raise ValueError("Cannot transfer to the same account")

    sender = db.query(Account).filter(Account.account_id == sender_account_id).with_for_update().first()
    if not sender:
        raise ValueError(f"Sender account {sender_account_id} not found")
    if not sender.is_active:
        raise ValueError(f"Sender account {sender_account_id} is inactive")

    receiver = db.query(Account).filter(Account.account_id == receiver_account_id).with_for_update().first()
    if not receiver:
        raise ValueError(f"Receiver account {receiver_account_id} not found")
    if not receiver.is_active:
        raise ValueError(f"Receiver account {receiver_account_id} is inactive")

    if sender.balance_paise < amount_paise:
        raise ValueError(
            f"Insufficient balance. Available: ₹{paise_to_rupees(sender.balance_paise)}, "
            f"Required: ₹{amount_rupees}"
        )

    # Generate transaction ID
    txn_id = generate_transaction_id()

    # Create transaction record
    txn = Transaction(
        transaction_id=txn_id,
        sender_account_id=sender_account_id,
        receiver_account_id=receiver_account_id,
        amount_paise=amount_paise,
        status="COMPLETED",
        description=description,
    )
    db.add(txn)

    # Allocate funds (source-aware)
    txn_allocations = allocate_outgoing(db, txn_id, sender_account_id, receiver_account_id, amount_paise)

    # Update balances
    sender.balance_paise -= amount_paise
    receiver.balance_paise += amount_paise

    # Record ledger entries
    record_debit(db, txn_id, sender_account_id, amount_paise, sender.balance_paise)
    record_credit(db, txn_id, receiver_account_id, amount_paise, receiver.balance_paise)

    # Audit log
    db.add(AuditLog(
        log_id=generate_log_id(),
        entity_type="TRANSACTION",
        entity_id=txn_id,
        action="CREATE",
        actor="SYSTEM",
        details=json.dumps({
            "sender": sender_account_id,
            "receiver": receiver_account_id,
            "amount_rupees": amount_rupees,
        }),
    ))

    db.commit()
    db.refresh(txn)

    alloc_info = [
        {
            "source_allocation_id": ta.source_allocation_id,
            "destination_allocation_id": ta.destination_allocation_id,
            "amount_rupees": paise_to_rupees(ta.amount_paise),
            "amount_paise": ta.amount_paise,
        }
        for ta in txn_allocations
    ]

    return {
        "transaction_id": txn_id,
        "sender_account_id": sender_account_id,
        "receiver_account_id": receiver_account_id,
        "amount_rupees": amount_rupees,
        "status": "COMPLETED",
        "description": description,
        "created_at": txn.created_at,
        "allocations_used": alloc_info,
    }


def get_transaction(db: Session, transaction_id: str) -> dict:
    """Get transaction details."""
    txn = db.query(Transaction).filter(Transaction.transaction_id == transaction_id).first()
    if not txn:
        raise ValueError(f"Transaction {transaction_id} not found")
    return {
        "transaction_id": txn.transaction_id,
        "sender_account_id": txn.sender_account_id,
        "receiver_account_id": txn.receiver_account_id,
        "amount_rupees": paise_to_rupees(txn.amount_paise),
        "status": txn.status,
        "description": txn.description,
        "created_at": txn.created_at,
    }


def get_transaction_history(db: Session, account_id: str = None) -> dict:
    """Get transaction history, optionally filtered by account."""
    query = db.query(Transaction)
    if account_id:
        query = query.filter(
            (Transaction.sender_account_id == account_id) |
            (Transaction.receiver_account_id == account_id)
        )
    txns = query.order_by(Transaction.created_at.desc()).all()
    return {
        "account_id": account_id,
        "transactions": [
            {
                "transaction_id": t.transaction_id,
                "sender_account_id": t.sender_account_id,
                "receiver_account_id": t.receiver_account_id,
                "amount_rupees": paise_to_rupees(t.amount_paise),
                "status": t.status,
                "description": t.description,
                "created_at": t.created_at,
            }
            for t in txns
        ],
        "total_count": len(txns),
    }
