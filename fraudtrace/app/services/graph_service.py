"""Graph analysis engine using NetworkX."""
import networkx as nx
from sqlalchemy.orm import Session
from fraudtrace.app.models.transaction import Transaction
from fraudtrace.app.models.allocation import FundAllocation, TransactionAllocation, TraceOrigin
from fraudtrace.app.models.fraud_case import FraudCase
from fraudtrace.app.utils.helpers import paise_to_rupees


def build_transaction_graph(db: Session, transactions: list = None) -> nx.MultiDiGraph:
    """Build a directed transaction graph from database records with trace metadata."""
    G = nx.MultiDiGraph()

    if transactions is None:
        transactions = db.query(Transaction).filter(
            Transaction.status == "COMPLETED"
        ).all()

    for txn in transactions:
        if not G.has_node(txn.sender_account_id):
            G.add_node(txn.sender_account_id, type="account")
        if not G.has_node(txn.receiver_account_id):
            G.add_node(txn.receiver_account_id, type="account")

        # Attach source trace_ids & origin_transaction_ids from allocations
        txn_allocs = (
            db.query(TransactionAllocation)
            .filter(TransactionAllocation.transaction_id == txn.transaction_id)
            .all()
        )
        trace_ids = []
        origin_txn_ids = []
        for ta in txn_allocs:
            dest_alloc = db.query(FundAllocation).filter(
                FundAllocation.allocation_id == ta.destination_allocation_id
            ).first()
            if dest_alloc:
                if dest_alloc.trace_id and dest_alloc.trace_id not in trace_ids:
                    trace_ids.append(dest_alloc.trace_id)
                if dest_alloc.origin_transaction_id not in origin_txn_ids:
                    origin_txn_ids.append(dest_alloc.origin_transaction_id)

        G.add_edge(
            txn.sender_account_id,
            txn.receiver_account_id,
            key=txn.transaction_id,
            transaction_id=txn.transaction_id,
            amount_paise=txn.amount_paise,
            amount_rupees=paise_to_rupees(txn.amount_paise),
            timestamp=str(txn.created_at) if txn.created_at else None,
            trace_ids=trace_ids,
            trace_id=trace_ids[0] if trace_ids else None,
            origin_transaction_ids=origin_txn_ids,
            status=txn.status,
        )

    return G


def get_graph_for_case(db: Session, case_id: str) -> dict:
    """Get the transaction graph related to a fraud case."""
    case = db.query(FraudCase).filter(FraudCase.case_id == case_id).first()
    if not case:
        raise ValueError(f"Case {case_id} not found")

    # Find the trace_id
    trace_origin = db.query(TraceOrigin).filter(TraceOrigin.case_id == case_id).first()
    if not trace_origin:
        # Build a simple graph around the reported transaction
        txn = db.query(Transaction).filter(
            Transaction.transaction_id == case.reported_transaction_id
        ).first()
        if txn:
            return _graph_to_json(build_transaction_graph(db, [txn]))
        return {"nodes": [], "edges": []}

    return get_graph_for_trace(db, trace_origin.trace_id)


def get_graph_for_trace(db: Session, trace_id: str) -> dict:
    """Get the transaction subgraph for a specific trace ID."""
    # Find all allocations with this trace_id
    traced_allocs = (
        db.query(FundAllocation)
        .filter(FundAllocation.trace_id == trace_id)
        .all()
    )

    alloc_ids = {a.allocation_id for a in traced_allocs}

    # Find all transactions involved
    txn_allocs = (
        db.query(TransactionAllocation)
        .filter(
            TransactionAllocation.source_allocation_id.in_(alloc_ids) |
            TransactionAllocation.destination_allocation_id.in_(alloc_ids)
        )
        .all()
    )

    txn_ids = {ta.transaction_id for ta in txn_allocs}

    # Also include the origin transaction
    trace_origin = db.query(TraceOrigin).filter(TraceOrigin.trace_id == trace_id).first()
    if trace_origin:
        txn_ids.add(trace_origin.origin_transaction_id)

    transactions = (
        db.query(Transaction)
        .filter(Transaction.transaction_id.in_(txn_ids))
        .all()
    )

    G = build_transaction_graph(db, transactions)

    # Add trace metadata to nodes
    for alloc in traced_allocs:
        if G.has_node(alloc.account_id):
            existing_trace = G.nodes[alloc.account_id].get("traceable_paise", 0)
            if alloc.is_active:
                G.nodes[alloc.account_id]["traceable_paise"] = existing_trace + alloc.amount_paise
                G.nodes[alloc.account_id]["traceable_rupees"] = paise_to_rupees(
                    existing_trace + alloc.amount_paise
                )

    return _graph_to_json(G)


def get_graph_for_account(db: Session, account_id: str) -> dict:
    """Get transaction graph centered on an account."""
    transactions = (
        db.query(Transaction)
        .filter(
            (Transaction.sender_account_id == account_id) |
            (Transaction.receiver_account_id == account_id),
            Transaction.status == "COMPLETED",
        )
        .all()
    )

    # Also get one more hop out
    involved_accounts = set()
    for txn in transactions:
        involved_accounts.add(txn.sender_account_id)
        involved_accounts.add(txn.receiver_account_id)

    extended_txns = (
        db.query(Transaction)
        .filter(
            (Transaction.sender_account_id.in_(involved_accounts)) |
            (Transaction.receiver_account_id.in_(involved_accounts)),
            Transaction.status == "COMPLETED",
        )
        .all()
    )

    G = build_transaction_graph(db, extended_txns)
    return _graph_to_json(G)


def multi_hop_trace(db: Session, account_id: str, direction: str = "downstream",
                    max_hops: int = 10) -> dict:
    """Trace multi-hop money movement from an account."""
    all_txns = db.query(Transaction).filter(Transaction.status == "COMPLETED").all()
    G = build_transaction_graph(db, all_txns)

    if not G.has_node(account_id):
        return {"account_id": account_id, "direction": direction, "paths": [], "connected_accounts": []}

    if direction == "downstream":
        # All paths from this account
        connected = nx.descendants(G, account_id)
    else:
        # All paths to this account
        connected = nx.ancestors(G, account_id)

    # Get subgraph
    subgraph_nodes = connected | {account_id}
    subG = G.subgraph(subgraph_nodes)

    return {
        "account_id": account_id,
        "direction": direction,
        "connected_accounts": list(connected),
        "graph": _graph_to_json(subG),
    }


def fanin_analysis(db: Session, account_id: str) -> dict:
    """Analyze fan-in pattern for an account."""
    txns = (
        db.query(Transaction)
        .filter(
            Transaction.receiver_account_id == account_id,
            Transaction.status == "COMPLETED",
        )
        .all()
    )

    senders = {}
    for txn in txns:
        if txn.sender_account_id not in senders:
            senders[txn.sender_account_id] = {"count": 0, "total_paise": 0}
        senders[txn.sender_account_id]["count"] += 1
        senders[txn.sender_account_id]["total_paise"] += txn.amount_paise

    return {
        "account_id": account_id,
        "unique_senders": len(senders),
        "total_received_transactions": len(txns),
        "senders": {
            sid: {
                "count": info["count"],
                "total_rupees": paise_to_rupees(info["total_paise"]),
            }
            for sid, info in senders.items()
        },
    }


def fanout_analysis(db: Session, account_id: str) -> dict:
    """Analyze fan-out pattern for an account."""
    txns = (
        db.query(Transaction)
        .filter(
            Transaction.sender_account_id == account_id,
            Transaction.status == "COMPLETED",
        )
        .all()
    )

    receivers = {}
    for txn in txns:
        if txn.receiver_account_id not in receivers:
            receivers[txn.receiver_account_id] = {"count": 0, "total_paise": 0}
        receivers[txn.receiver_account_id]["count"] += 1
        receivers[txn.receiver_account_id]["total_paise"] += txn.amount_paise

    return {
        "account_id": account_id,
        "unique_receivers": len(receivers),
        "total_sent_transactions": len(txns),
        "receivers": {
            rid: {
                "count": info["count"],
                "total_rupees": paise_to_rupees(info["total_paise"]),
            }
            for rid, info in receivers.items()
        },
    }


def _graph_to_json(G: nx.MultiDiGraph) -> dict:
    """Convert NetworkX graph to JSON-serializable format."""
    nodes = []
    final_destinations = []
    for node_id, attrs in G.nodes(data=True):
        node_data = {"id": node_id, "out_degree": G.out_degree(node_id), "in_degree": G.in_degree(node_id)}
        node_data.update(attrs)
        nodes.append(node_data)
        if G.in_degree(node_id) > 0 and G.out_degree(node_id) == 0:
            final_destinations.append(node_id)

    edges = []
    for u, v, attrs in G.edges(data=True):
        edge_data = {"source": u, "target": v}
        edge_data.update(attrs)
        edges.append(edge_data)

    return {
        "nodes": nodes,
        "edges": edges,
        "final_destination_accounts": final_destinations,
    }
