"""Source-aware money allocation engine - THE CORE of FraudTrace."""
from sqlalchemy.orm import Session
from fraudtrace.app.models.allocation import FundAllocation, TransactionAllocation
from fraudtrace.app.core.config import settings
from fraudtrace.app.utils.identifiers import generate_allocation_id, generate_txn_alloc_id


def get_active_allocations(db: Session, account_id: str) -> list:
    """Get all active fund allocations for an account, ordered by policy."""
    allocations = (
        db.query(FundAllocation)
        .filter(
            FundAllocation.account_id == account_id,
            FundAllocation.is_active == True,
            FundAllocation.amount_paise > 0,
        )
        .all()
    )
    return _sort_by_policy(allocations, settings.ALLOCATION_POLICY)


def _sort_by_policy(allocations: list, policy: str) -> list:
    """Sort allocations according to the allocation policy."""
    if policy == "FRAUD_FIRST":
        # Traceable (traced) allocations first, then others
        traced = [a for a in allocations if a.trace_id is not None]
        untraced = [a for a in allocations if a.trace_id is None]
        return traced + untraced
    elif policy == "FIFO":
        return sorted(allocations, key=lambda a: a.created_at or "")
    else:  # PROPORTIONAL or default
        return allocations


def allocate_outgoing(db: Session, transaction_id: str, sender_account_id: str,
                      receiver_account_id: str, amount_paise: int) -> list:
    """Allocate outgoing funds from sender's allocations and create receiver allocations.

    Returns list of TransactionAllocation records created.
    """
    allocations = get_active_allocations(db, sender_account_id)

    if settings.ALLOCATION_POLICY == "PROPORTIONAL":
        return _allocate_proportional(
            db, transaction_id, allocations, receiver_account_id, amount_paise
        )

    # FRAUD_FIRST or FIFO: sequential allocation
    remaining = amount_paise
    txn_allocations = []

    for alloc in allocations:
        if remaining <= 0:
            break

        use_amount = min(alloc.amount_paise, remaining)

        # Reduce or consume the source allocation
        alloc.amount_paise -= use_amount
        if alloc.amount_paise == 0:
            alloc.is_active = False

        # Create new allocation for the receiver
        new_alloc = FundAllocation(
            allocation_id=generate_allocation_id(),
            account_id=receiver_account_id,
            origin_transaction_id=alloc.origin_transaction_id,
            trace_id=alloc.trace_id,
            amount_paise=use_amount,
            is_active=True,
            parent_allocation_id=alloc.allocation_id,
        )
        db.add(new_alloc)

        # Record the transaction-allocation mapping
        txn_alloc = TransactionAllocation(
            id=generate_txn_alloc_id(),
            transaction_id=transaction_id,
            source_allocation_id=alloc.allocation_id,
            destination_allocation_id=new_alloc.allocation_id,
            amount_paise=use_amount,
        )
        db.add(txn_alloc)
        txn_allocations.append(txn_alloc)

        remaining -= use_amount

    if remaining > 0:
        raise ValueError("Insufficient allocations to cover the transaction amount")

    return txn_allocations


def _allocate_proportional(db: Session, transaction_id: str,
                           allocations: list, receiver_account_id: str,
                           amount_paise: int) -> list:
    """Proportional allocation policy."""
    total_available = sum(a.amount_paise for a in allocations)
    if total_available < amount_paise:
        raise ValueError("Insufficient allocations")

    txn_allocations = []
    allocated_so_far = 0

    for i, alloc in enumerate(allocations):
        if i == len(allocations) - 1:
            # Last allocation gets the remainder to avoid rounding errors
            use_amount = amount_paise - allocated_so_far
        else:
            proportion = alloc.amount_paise / total_available
            use_amount = int(proportion * amount_paise)

        if use_amount <= 0:
            continue

        use_amount = min(use_amount, alloc.amount_paise)
        alloc.amount_paise -= use_amount
        if alloc.amount_paise == 0:
            alloc.is_active = False

        new_alloc = FundAllocation(
            allocation_id=generate_allocation_id(),
            account_id=receiver_account_id,
            origin_transaction_id=alloc.origin_transaction_id,
            trace_id=alloc.trace_id,
            amount_paise=use_amount,
            is_active=True,
            parent_allocation_id=alloc.allocation_id,
        )
        db.add(new_alloc)

        txn_alloc = TransactionAllocation(
            id=generate_txn_alloc_id(),
            transaction_id=transaction_id,
            source_allocation_id=alloc.allocation_id,
            destination_allocation_id=new_alloc.allocation_id,
            amount_paise=use_amount,
        )
        db.add(txn_alloc)
        txn_allocations.append(txn_alloc)
        allocated_so_far += use_amount

    return txn_allocations
