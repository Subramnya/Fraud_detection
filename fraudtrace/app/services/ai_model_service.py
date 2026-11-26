"""Scikit-learn AI Fraud Detection Model + Unified 2D XY-Plane NetworkX Graph Service."""
import numpy as np
import networkx as nx
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sqlalchemy.orm import Session
from fraudtrace.app.models.transaction import Transaction
from fraudtrace.app.models.fraud_alert import FraudAlert
from fraudtrace.app.models.fraud_case import FraudCase
from fraudtrace.app.models.risk_assessment import RiskAssessment
from fraudtrace.app.models.allocation import TraceOrigin, FundAllocation, TransactionAllocation
from fraudtrace.app.models.account import Account
from fraudtrace.app.services.graph_service import build_transaction_graph, _graph_to_json
from fraudtrace.app.utils.helpers import paise_to_rupees
from fraudtrace.app.utils.identifiers import generate_assessment_id
import json
from datetime import datetime, timedelta, timezone


class FraudAIModel:
    """Trained Scikit-learn ensemble (IsolationForest + RandomForestClassifier)."""

    def __init__(self):
        rng = np.random.default_rng(42)
        normal_x = np.column_stack([
            rng.uniform(50, 3500, 300),
            rng.integers(1, 3, 300),
            rng.integers(1, 3, 300),
            rng.integers(0, 3, 300),
            rng.uniform(0.0, 0.4, 300),
        ])
        fraud_x = np.column_stack([
            rng.uniform(4500, 50000, 150),
            rng.integers(4, 15, 150),
            rng.integers(4, 20, 150),
            rng.integers(4, 15, 150),
            rng.uniform(0.75, 1.0, 150),
        ])
        X = np.vstack([normal_x, fraud_x])
        y = np.array([0] * len(normal_x) + [1] * len(fraud_x))

        self.iso = IsolationForest(contamination=0.15, random_state=42)
        self.iso.fit(normal_x)

        self.rf = RandomForestClassifier(n_estimators=40, random_state=42)
        self.rf.fit(X, y)

    def score(self, features: list[float]) -> dict:
        arr = np.array([features], dtype=float)
        fraud_prob = float(self.rf.predict_proba(arr)[0][1])
        iso_pred = int(self.iso.predict(arr)[0])
        return {
            "ai_fraud_probability": round(fraud_prob, 4),
            "is_anomaly": iso_pred == -1 or fraud_prob >= 0.55,
            "model": "RandomForestClassifier + IsolationForest (scikit-learn)",
        }


ai_model = FraudAIModel()
MODEL_VERSION = "FraudTrace-AI-v2.0 (RandomForest + IsolationForest)"


def compute_and_store_risk_assessment(
    db: Session,
    account_id: str,
    alert_id: str | None = None,
    case_id: str | None = None,
) -> dict:
    """Compute 5-factor AI Risk Assessment (0-100) from real DB data & store in RiskAssessment."""
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    w_10m = now_utc - timedelta(minutes=10)
    w_1h = now_utc - timedelta(hours=1)

    sent_10m = (
        db.query(Transaction)
        .filter(Transaction.sender_account_id == account_id, Transaction.created_at >= w_10m)
        .all()
    )
    sent_1h = (
        db.query(Transaction)
        .filter(Transaction.sender_account_id == account_id, Transaction.created_at >= w_1h)
        .all()
    )
    recv_1h = (
        db.query(Transaction)
        .filter(Transaction.receiver_account_id == account_id, Transaction.created_at >= w_1h)
        .all()
    )
    all_sent = (
        db.query(Transaction)
        .filter(Transaction.sender_account_id == account_id)
        .all()
    )
    prior_alerts = (
        db.query(FraudAlert)
        .filter(FraudAlert.account_id == account_id)
        .all()
    )

    # 1. Transaction Velocity (25%)
    vel_count = len(sent_10m)
    vel_raw = min(100.0, (vel_count / 5.0) * 100.0)
    vel_contrib = round((vel_raw / 100.0) * 25.0, 1)

    # 2. Transaction Amount Anomalies (20%)
    max_amt_rupees = max((paise_to_rupees(t.amount_paise) for t in (sent_1h + recv_1h)), default=0.0)
    amt_raw = min(100.0, (max_amt_rupees / 25000.0) * 100.0)
    amt_contrib = round((amt_raw / 100.0) * 20.0, 1)

    # 3. Network Risk (25%) - unique counterparties + flagged peers
    unique_recips = {t.receiver_account_id for t in sent_1h}
    unique_senders = {t.sender_account_id for t in recv_1h}
    peers = unique_recips | unique_senders
    flagged_peers = 0
    if peers:
        flagged_peers = (
            db.query(Account)
            .filter(
                Account.account_id.in_(peers),
                (Account.account_type.in_(["FRAUDSTER", "FRAUDSTER_PARTNER"])) | (Account.is_frozen == True),
            )
            .count()
        )
    net_raw = min(100.0, (max(len(unique_recips), len(unique_senders)) / 5.0) * 70.0 + min(flagged_peers * 15.0, 30.0))
    net_contrib = round((net_raw / 100.0) * 25.0, 1)

    # 4. Money Movement Patterns (20%) - pass-through & splitting
    tot_recv_1h = sum(t.amount_paise for t in recv_1h)
    tot_sent_1h = sum(t.amount_paise for t in sent_1h)
    pt_ratio = min(tot_sent_1h / tot_recv_1h, 1.0) if tot_recv_1h > 0 else (0.5 if len(unique_recips) >= 3 else 0.0)
    mov_raw = min(100.0, pt_ratio * 100.0)
    mov_contrib = round((mov_raw / 100.0) * 20.0, 1)

    # 5. Historical Behaviour (10%) - prior alerts + Scikit-learn AI probability
    ai_res = ai_model.score([
        max_amt_rupees,
        vel_count,
        len(unique_recips),
        len(unique_senders),
        pt_ratio,
    ])
    hist_raw = min(100.0, max(len(prior_alerts) * 25.0, ai_res["ai_fraud_probability"] * 100.0))
    hist_contrib = round((hist_raw / 100.0) * 10.0, 1)

    final_score = round(min(100.0, vel_contrib + amt_contrib + net_contrib + mov_contrib + hist_contrib), 1)
    if final_score >= 80:
        category = "CRITICAL"
    elif final_score >= 60:
        category = "HIGH"
    elif final_score >= 35:
        category = "MEDIUM"
    else:
        category = "LOW"

    observations = []
    if vel_count > 0:
        observations.append(f"{vel_count} outgoing transaction(s) within the last 10 minutes.")
    if max_amt_rupees > 0:
        observations.append(f"Peak recent transaction amount of ₹{max_amt_rupees:,.2f}.")
    if flagged_peers > 0 or len(unique_recips) >= 3 or len(unique_senders) >= 3:
        observations.append(
            f"Connected to {len(peers)} account(s) ({flagged_peers} flagged/partner accounts)."
        )
    if tot_recv_1h > 0 and pt_ratio >= 0.5:
        observations.append(f"Transferred {pt_ratio * 100:.1f}% of received funds within 1 hour.")
    if len(prior_alerts) > 0:
        observations.append(
            f"{len(prior_alerts)} prior fraud alert(s) recorded; AI anomaly probability {ai_res['ai_fraud_probability']:.2f}."
        )
    if not observations:
        observations.append(f"AI anomaly probability {ai_res['ai_fraud_probability']:.2f} across {len(all_sent)} historical transactions.")

    factors = [
        {"factor": "Transaction Velocity", "score": round(vel_raw, 1), "weight": 25, "contribution": vel_contrib, "max_contribution": 25},
        {"factor": "Transaction Amount Anomalies", "score": round(amt_raw, 1), "weight": 20, "contribution": amt_contrib, "max_contribution": 20},
        {"factor": "Network Risk", "score": round(net_raw, 1), "weight": 25, "contribution": net_contrib, "max_contribution": 25},
        {"factor": "Money Movement Patterns", "score": round(mov_raw, 1), "weight": 20, "contribution": mov_contrib, "max_contribution": 20},
        {"factor": "Historical Behaviour", "score": round(hist_raw, 1), "weight": 10, "contribution": hist_contrib, "max_contribution": 10},
    ]

    breakdown = {
        "factors": factors,
        "observations": observations,
        "ai_fraud_probability": ai_res["ai_fraud_probability"],
        "final_score": final_score,
    }
    explanation_text = " ".join(observations)

    assessment_id = generate_assessment_id()
    rec = RiskAssessment(
        assessment_id=assessment_id,
        account_id=account_id,
        alert_id=alert_id,
        case_id=case_id,
        overall_score=final_score,
        risk_category=category,
        velocity_score=vel_contrib,
        amount_score=amt_contrib,
        fanout_score=net_contrib,
        passthrough_score=mov_contrib,
        explanation=explanation_text,
        breakdown_json=json.dumps(breakdown),
        model_version=MODEL_VERSION,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    return {
        "assessment_id": rec.assessment_id,
        "account_id": rec.account_id,
        "alert_id": rec.alert_id,
        "case_id": rec.case_id,
        "overall_score": rec.overall_score,
        "risk_category": rec.risk_category,
        "factors": factors,
        "observations": observations,
        "explanation": explanation_text,
        "model_version": rec.model_version,
        "created_at": str(rec.created_at) if rec.created_at else None,
    }


def _compute_tree_xy_layout(G: nx.MultiDiGraph, root_candidates: set[str]) -> dict[str, dict]:
    """Compute organic 2D XY tree/mesh coordinates (0..900 x 0..480) for SVG rendering."""
    if G.number_of_nodes() == 0:
        return {}

    layers: dict[str, int] = {}
    roots = [n for n in G.nodes() if G.in_degree(n) == 0]
    if not roots:
        roots = [n for n in root_candidates if G.has_node(n)] or [list(G.nodes())[0]]

    queue = [(r, 0) for r in roots]
    for r in roots:
        layers[r] = 0

    while queue:
        curr, depth = queue.pop(0)
        for nxt in G.successors(curr):
            if nxt not in layers or layers[nxt] > depth + 1:
                layers[nxt] = depth + 1
                queue.append((nxt, depth + 1))

    for n in G.nodes():
        if n not in layers:
            layers[n] = 0

    by_layer: dict[int, list[str]] = {}
    for n, l in layers.items():
        by_layer.setdefault(l, []).append(n)

    max_layer = max(by_layer.keys(), default=0)
    max_per_layer = max((len(v) for v in by_layer.values()), default=1)
    coords: dict[str, dict] = {}
    pad_x = 120
    pad_y = 85
    width = max(1000, (max_layer + 1) * 290)
    height = max(520, max_per_layer * 115 + 120)

    for l, nodes in by_layer.items():
        base_x = pad_x if max_layer == 0 else pad_x + (l / max(max_layer, 1)) * (width - 2 * pad_x)
        count = len(nodes)
        for idx, node_id in enumerate(sorted(nodes)):
            base_y = height / 2 if count == 1 else pad_y + (idx / max(count - 1, 1)) * (height - 2 * pad_y)
            h = sum(ord(c) for c in node_id)
            jitter_x = ((h % 33) - 16) if l > 0 else 0
            jitter_y = (((h * 7) % 27) - 13) if count > 1 else 0
            coords[node_id] = {
                "x": round(max(65, min(width - 65, base_x + jitter_x)), 1),
                "y": round(max(55, min(height - 55, base_y + jitter_y)), 1),
                "layer": l,
            }
    return coords


def build_ai_fraud_graph(
    db: Session,
    txns: list[Transaction],
    alert_accounts: set[str],
    alerts: list[FraudAlert],
) -> dict:
    """Single shared AI fraud graph builder used by both AI Dashboard and Cyber Cell Reports."""
    if not txns:
        return {"nodes": [], "edges": [], "final_destination_accounts": []}

    G = build_transaction_graph(db, txns)
    coords = _compute_tree_xy_layout(G, alert_accounts)
    graph_json = _graph_to_json(G)

    all_node_ids = [n["id"] for n in graph_json["nodes"]]
    acc_map = {
        a.account_id: a
        for a in db.query(Account).filter(Account.account_id.in_(all_node_ids)).all()
    }

    alert_by_txn: dict[str, list[FraudAlert]] = {}
    for al in alerts:
        if al.transaction_id:
            alert_by_txn.setdefault(al.transaction_id, []).append(al)

    for node in graph_json["nodes"]:
        nid = node["id"]
        acc = acc_map.get(nid)
        pos = coords.get(nid, {"x": 100, "y": 200, "layer": 0})
        node["x"] = pos["x"]
        node["y"] = pos["y"]
        node["layer"] = pos["layer"]
        node["label"] = acc.account_name if acc else nid
        node["balance_rupees"] = paise_to_rupees(acc.balance_paise) if acc else 0.0
        node["account_type"] = acc.account_type if acc else "NORMAL"
        node["is_frozen"] = bool(getattr(acc, "is_frozen", False)) if acc else False
        node["is_alerted"] = nid in alert_accounts

    for edge in graph_json["edges"]:
        tid = edge.get("transaction_id")
        matched_alerts = alert_by_txn.get(tid, []) if tid else []
        edge["is_flagged"] = len(matched_alerts) > 0
        edge["rules_triggered"] = [a.rule_triggered for a in matched_alerts]
        edge["alert_reasons"] = [a.reason for a in matched_alerts]

    return graph_json


def get_ai_graph_for_case(
    db: Session, case_id: str | None = None, account_id: str | None = None
) -> dict:
    """Retrieve the exact AI-generated fraud graph for a Case ID or Account ID."""
    seed_accounts: set[str] = set()
    txn_ids: set[str] = set()

    if case_id:
        case = db.query(FraudCase).filter(FraudCase.case_id == case_id).first()
        if case:
            seed_accounts.add(case.reporting_account_id)
            if case.reported_transaction_id:
                txn_ids.add(case.reported_transaction_id)
            trace = db.query(TraceOrigin).filter(TraceOrigin.case_id == case_id).first()
            if trace:
                traced_allocs = (
                    db.query(FundAllocation)
                    .filter(FundAllocation.trace_id == trace.trace_id)
                    .all()
                )
                alloc_ids = {a.allocation_id for a in traced_allocs}
                for a in traced_allocs:
                    seed_accounts.add(a.account_id)
                if alloc_ids:
                    tas = (
                        db.query(TransactionAllocation)
                        .filter(
                            TransactionAllocation.source_allocation_id.in_(alloc_ids)
                            | TransactionAllocation.destination_allocation_id.in_(alloc_ids)
                        )
                        .all()
                    )
                    for ta in tas:
                        txn_ids.add(ta.transaction_id)

    if account_id:
        seed_accounts.add(account_id)

    if not seed_accounts and not txn_ids:
        return {"available": False, "nodes": [], "edges": [], "final_destination_accounts": []}

    # Expand 1-2 hops from seed accounts so all multi-hop mesh connections are included
    txns = (
        db.query(Transaction)
        .filter(
            (Transaction.sender_account_id.in_(seed_accounts))
            | (Transaction.receiver_account_id.in_(seed_accounts))
            | (Transaction.transaction_id.in_(txn_ids) if txn_ids else False)
        )
        .order_by(Transaction.created_at.asc())
        .all()
    )
    hop_accounts = set(seed_accounts)
    for t in txns:
        hop_accounts.add(t.sender_account_id)
        hop_accounts.add(t.receiver_account_id)

    all_txns = (
        db.query(Transaction)
        .filter(
            (Transaction.sender_account_id.in_(hop_accounts))
            | (Transaction.receiver_account_id.in_(hop_accounts))
        )
        .order_by(Transaction.created_at.asc())
        .limit(80)
        .all()
    )

    if not all_txns:
        return {"available": False, "nodes": [], "edges": [], "final_destination_accounts": []}

    alerts = (
        db.query(FraudAlert)
        .filter(FraudAlert.account_id.in_(hop_accounts))
        .all()
    )
    alert_accounts = {a.account_id for a in alerts} | seed_accounts

    graph_json = build_ai_fraud_graph(db, all_txns, alert_accounts, alerts)
    graph_json["available"] = len(graph_json["nodes"]) > 0
    return graph_json


def get_ai_live_feed(db: Session) -> dict:
    """Return active/unreported AI detections and 2D XY NetworkX tree graph."""
    alerts = (
        db.query(FraudAlert)
        .filter(FraudAlert.status != "REPORTED")
        .order_by(FraudAlert.created_at.desc())
        .limit(50)
        .all()
    )

    if not alerts:
        return {
            "fraud_detected": False,
            "alerts": [],
            "tracked_transactions": [],
            "graph": {"nodes": [], "edges": [], "final_destination_accounts": []},
            "model_info": "RandomForestClassifier + IsolationForest (scikit-learn)",
        }

    alert_accounts = {a.account_id for a in alerts}
    txns = (
        db.query(Transaction)
        .filter(
            (Transaction.sender_account_id.in_(alert_accounts))
            | (Transaction.receiver_account_id.in_(alert_accounts))
        )
        .order_by(Transaction.created_at.asc())
        .limit(60)
        .all()
    )

    graph_json = build_ai_fraud_graph(db, txns, alert_accounts, alerts)
    acc_map = {
        a.account_id: a
        for a in db.query(Account).filter(Account.account_id.in_(alert_accounts)).all()
    }

    alert_items = []
    for a in alerts:
        acc = acc_map.get(a.account_id)
        alert_items.append({
            "alert_id": a.alert_id,
            "account_id": a.account_id,
            "account_name": acc.account_name if acc else a.account_id,
            "is_frozen": bool(getattr(acc, "is_frozen", False)) if acc else False,
            "transaction_id": a.transaction_id,
            "rule_triggered": a.rule_triggered,
            "severity": a.severity,
            "risk_score": a.risk_score,
            "reason": a.reason,
            "status": a.status,
            "created_at": a.created_at,
        })

    tracked = [
        {
            "transaction_id": t.transaction_id,
            "trace_id": t.trace_id,
            "sender_account_id": t.sender_account_id,
            "receiver_account_id": t.receiver_account_id,
            "amount_rupees": paise_to_rupees(t.amount_paise),
            "created_at": t.created_at,
        }
        for t in txns
    ]

    return {
        "fraud_detected": True,
        "alerts": alert_items,
        "tracked_transactions": tracked,
        "graph": graph_json,
        "model_info": "RandomForestClassifier + IsolationForest (scikit-learn) + NetworkX",
    }
