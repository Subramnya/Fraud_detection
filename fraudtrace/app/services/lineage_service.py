"""Trace ID and money lineage engine."""
import json
from sqlalchemy.orm import Session
from fraudtrace.app.models.allocation import FundAllocation, TransactionAllocation, TraceOrigin
from fraudtrace.app.models.transaction import Transaction
from fraudtrace.app.models.fraud_case import FraudCase
from fraudtrace.app.models.audit_log import AuditLog
from fraudtrace.app.utils.identifiers import generate_trace_id, generate_log_id
from fraudtrace.app.utils.helpers import paise_to_rupees


def activate_trace(db: Session, case_id: str, transaction_id: str,
                   traced_amount_paise: int) -> str:
    """Activate tracing on a fraudulent transaction.

    This propagates trace_id to all downstream allocations derived from the
    original transaction's receiver-side allocations.
    """
    trace_id = generate_trace_id()

    # Create trace origin record
    trace_origin = TraceOrigin(
        trace_id=trace_id,
        case_id=case_id,
        origin_transaction_id=transaction_id,
        traced_amount_paise=traced_amount_paise,
    )
    db.add(trace_origin)

    # Find all allocations created by this transaction for the receiver
    receiver_allocations = (
        db.query(FundAllocation)
        .filter(FundAllocation.origin_transaction_id == transaction_id)
        .all()
    )

    # Also find allocations that were created as destination of TransactionAllocations
    # for this transaction
    txn_allocs = (
        db.query(TransactionAllocation)
        .filter(TransactionAllocation.transaction_id == transaction_id)
        .all()
    )

    dest_alloc_ids = {ta.destination_allocation_id for ta in txn_allocs}

    # Get all destination allocations
    if dest_alloc_ids:
        dest_allocs = (
            db.query(FundAllocation)
            .filter(FundAllocation.allocation_id.in_(dest_alloc_ids))
            .all()
        )
    else:
        dest_allocs = receiver_allocations

    # Tag these allocations and propagate downstream
    for alloc in dest_allocs:
        _propagate_trace_id(db, alloc, trace_id)

    # Also tag the original receiver allocations where origin_transaction_id matches
    for alloc in receiver_allocations:
        if alloc.allocation_id not in dest_alloc_ids:
            _propagate_trace_id(db, alloc, trace_id)

    # Audit
    db.add(AuditLog(
        log_id=generate_log_id(),
        entity_type="TRACE",
        entity_id=trace_id,
        action="ACTIVATE",
        actor="SYSTEM",
        details=json.dumps({
            "case_id": case_id,
            "transaction_id": transaction_id,
            "traced_amount_paise": traced_amount_paise,
        }),
    ))

    return trace_id


def _propagate_trace_id(db: Session, allocation: FundAllocation, trace_id: str):
    """Recursively propagate trace_id to an allocation and all its descendants."""
    allocation.trace_id = trace_id

    # Find children via parent_allocation_id
    children = (
        db.query(FundAllocation)
        .filter(FundAllocation.parent_allocation_id == allocation.allocation_id)
        .all()
    )
    for child in children:
        _propagate_trace_id(db, child, trace_id)

    # Also find children via TransactionAllocation links
    txn_allocs = (
        db.query(TransactionAllocation)
        .filter(TransactionAllocation.source_allocation_id == allocation.allocation_id)
        .all()
    )
    for ta in txn_allocs:
        dest_alloc = db.query(FundAllocation).filter(
            FundAllocation.allocation_id == ta.destination_allocation_id
        ).first()
        if dest_alloc and dest_alloc.trace_id != trace_id:
            _propagate_trace_id(db, dest_alloc, trace_id)


def get_trace_summary(db: Session, trace_id: str) -> dict:
    """Get a comprehensive summary of traced money."""
    trace_origin = db.query(TraceOrigin).filter(TraceOrigin.trace_id == trace_id).first()
    if not trace_origin:
        raise ValueError(f"Trace {trace_id} not found")

    # Find all allocations with this trace_id
    traced_allocations = (
        db.query(FundAllocation)
        .filter(FundAllocation.trace_id == trace_id)
        .all()
    )

    # Group by account - only active allocations for current holdings
    accounts_holding = {}
    for alloc in traced_allocations:
        if alloc.is_active and alloc.amount_paise > 0:
            if alloc.account_id not in accounts_holding:
                accounts_holding[alloc.account_id] = 0
            accounts_holding[alloc.account_id] += alloc.amount_paise

    total_remaining = sum(accounts_holding.values())

    accounts_list = [
        {
            "account_id": acc_id,
            "traceable_balance_rupees": paise_to_rupees(amount),
            "traceable_balance_paise": amount,
        }
        for acc_id, amount in accounts_holding.items()
    ]

    # Build transaction paths
    paths = _build_transaction_paths(db, trace_id, trace_origin.origin_transaction_id)

    # Calculate hop count
    max_hops = max((p.get("hops", 0) for p in paths), default=0)

    return {
        "trace_id": trace_id,
        "origin_transaction_id": trace_origin.origin_transaction_id,
        "original_amount_rupees": paise_to_rupees(trace_origin.traced_amount_paise),
        "total_traceable_remaining_rupees": paise_to_rupees(total_remaining),
        "accounts_holding_funds": accounts_list,
        "transaction_paths": paths,
        "hop_count": max_hops,
    }


def _build_transaction_paths(db: Session, trace_id: str, origin_txn_id: str) -> list:
    """Build transaction paths for traced money."""
    paths = []

    # Get all traced allocations and their transaction links
    traced_allocs = (
        db.query(FundAllocation)
        .filter(FundAllocation.trace_id == trace_id)
        .all()
    )

    alloc_ids = {a.allocation_id for a in traced_allocs}

    # Get all transaction allocations involving these
    txn_allocs = (
        db.query(TransactionAllocation)
        .filter(
            TransactionAllocation.source_allocation_id.in_(alloc_ids) |
            TransactionAllocation.destination_allocation_id.in_(alloc_ids)
        )
        .all()
    )

    # Group by transaction
    txn_groups = {}
    for ta in txn_allocs:
        if ta.transaction_id not in txn_groups:
            txn = db.query(Transaction).filter(
                Transaction.transaction_id == ta.transaction_id
            ).first()
            if txn:
                txn_groups[ta.transaction_id] = {
                    "transaction_id": txn.transaction_id,
                    "sender_account_id": txn.sender_account_id,
                    "receiver_account_id": txn.receiver_account_id,
                    "amount_rupees": paise_to_rupees(txn.amount_paise),
                    "created_at": str(txn.created_at) if txn.created_at else None,
                    "traced_amount_rupees": 0,
                    "hops": 0,
                }
            txn_groups[ta.transaction_id]["traced_amount_rupees"] += paise_to_rupees(ta.amount_paise)

    # Calculate hops from origin
    # Build an adjacency: txn -> next txns
    _calculate_hops(txn_groups, origin_txn_id)

    return list(txn_groups.values())


def _calculate_hops(txn_groups: dict, origin_txn_id: str):
    """Calculate hop count for each transaction from the origin."""
    # Build sender->receiver chain
    # A transaction at hop 0 is the original
    if origin_txn_id in txn_groups:
        txn_groups[origin_txn_id]["hops"] = 0

    # BFS by receiver -> sender chain
    visited = {origin_txn_id}
    current_hop = 0
    current_senders = set()

    if origin_txn_id in txn_groups:
        current_senders.add(txn_groups[origin_txn_id].get("receiver_account_id"))

    while current_senders:
        current_hop += 1
        next_senders = set()
        for txn_id, txn_info in txn_groups.items():
            if txn_id not in visited and txn_info.get("sender_account_id") in current_senders:
                txn_info["hops"] = current_hop
                visited.add(txn_id)
                next_senders.add(txn_info.get("receiver_account_id"))
        current_senders = next_senders


def get_account_traceable_balance(db: Session, account_id: str, trace_id: str = None) -> dict:
    """Get traceable balance for an account, optionally filtered by trace_id."""
    query = db.query(FundAllocation).filter(
        FundAllocation.account_id == account_id,
        FundAllocation.is_active == True,
        FundAllocation.trace_id.isnot(None),
    )
    if trace_id:
        query = query.filter(FundAllocation.trace_id == trace_id)

    traced_allocs = query.all()
    total_paise = sum(a.amount_paise for a in traced_allocs)

    by_trace = {}
    for a in traced_allocs:
        if a.trace_id not in by_trace:
            by_trace[a.trace_id] = 0
        by_trace[a.trace_id] += a.amount_paise

    return {
        "account_id": account_id,
        "total_traceable_paise": total_paise,
        "total_traceable_rupees": paise_to_rupees(total_paise),
        "by_trace_id": {
            tid: {"paise": amt, "rupees": paise_to_rupees(amt)}
            for tid, amt in by_trace.items()
        },
    }
