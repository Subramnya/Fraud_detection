"""Fraudster terminal API: F1..F50 random multi-hop mesh attacks & incoming payment notifications."""
import random
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from fraudtrace.app.core.database import get_db
from fraudtrace.app.models.account import Account
from fraudtrace.app.models.transaction import Transaction
from fraudtrace.app.models.allocation import FundAllocation
from fraudtrace.app.services.account_service import register_account
from fraudtrace.app.services.payment_service import process_payment
from fraudtrace.app.services.fraud_detection_service import monitor_transaction
from fraudtrace.app.services.notification_service import create_payment_notifications, create_notification
from fraudtrace.app.utils.helpers import paise_to_rupees
from fraudtrace.app.utils.identifiers import generate_allocation_id

router = APIRouter(prefix="/api/fraudster", tags=["Fraudster Console"])


def ensure_fraudster_partners(db: Session) -> list[Account]:
    """Ensure F1..F50 partner accounts exist in the database."""
    partners = (
        db.query(Account)
        .filter(Account.account_type == "FRAUDSTER_PARTNER")
        .all()
    )
    existing_names = {p.account_name for p in partners}
    for i in range(1, 51):
        name = f"F{i}"
        if name not in existing_names:
            res = register_account(
                db,
                name=name,
                email=f"f{i}@fraudnetwork.demo",
                initial_balance_rupees=0.0,
                account_type="FRAUDSTER_PARTNER",
            )
            acc = db.query(Account).filter(Account.account_id == res["account_id"]).first()
            if acc:
                partners.append(acc)
    return partners


@router.get("/partners")
def list_partners(db: Session = Depends(get_db)):
    partners = ensure_fraudster_partners(db)
    return [
        {
            "account_id": p.account_id,
            "name": p.account_name,
            "balance_rupees": paise_to_rupees(p.balance_paise),
            "is_frozen": bool(getattr(p, "is_frozen", False)),
        }
        for p in partners
    ]


@router.get("/incoming")
def get_fraudster_incoming_payments(db: Session = Depends(get_db)):
    """Return recent incoming payments to FRAUDSTER-tagged accounts (or all non-partner accounts)."""
    fraud_accs = db.query(Account).filter(Account.account_type == "FRAUDSTER").all()
    fraud_ids = {a.account_id for a in fraud_accs}
    acc_map = {a.account_id: a.account_name for a in db.query(Account).all()}

    query = db.query(Transaction).filter(Transaction.status == "COMPLETED")
    if fraud_ids:
        query = query.filter(Transaction.receiver_account_id.in_(fraud_ids))
    txns = query.order_by(Transaction.created_at.desc()).limit(15).all()

    return [
        {
            "transaction_id": t.transaction_id,
            "sender_account_id": t.sender_account_id,
            "sender_name": acc_map.get(t.sender_account_id, t.sender_account_id),
            "receiver_account_id": t.receiver_account_id,
            "receiver_name": acc_map.get(t.receiver_account_id, t.receiver_account_id),
            "amount_rupees": paise_to_rupees(t.amount_paise),
            "created_at": t.created_at,
        }
        for t in txns
    ]


class FraudAttackRequest(BaseModel):
    target_account_id: str
    fraud_type: str = Field(
        ...,
        pattern="^(FAN_IN|FAN_OUT|TRANSACTION_VELOCITY|NEW_ACCOUNT_HIGH_TXN|UNRELATED_SENDERS|HUGE_AMOUNT|TRANSACTION_SPLITTING|RAPID_PASSTHROUGH)$",
    )
    amount_rupees: float = Field(default=6000.0, gt=0)


@router.post("/attack")
def execute_fraud_attack(request: FraudAttackRequest, db: Session = Depends(get_db)):
    """Execute a fraudster action with random multi-hop mesh spreading across F1..F50 (no trace_id exposed)."""
    target = db.query(Account).filter(Account.account_id == request.target_account_id).first()
    if not target:
        raise HTTPException(status_code=404, detail=f"Account {request.target_account_id} not found")
    if getattr(target, "is_frozen", False) or not target.is_active:
        raise HTTPException(
            status_code=400,
            detail=f"Account {request.target_account_id} is FROZEN. All transactions are stopped.",
        )

    partners = ensure_fraudster_partners(db)
    txns = []
    alerts = []

    def _run_tx(sender_id: str, receiver_id: str, amt: float, desc: str):
        t = process_payment(db, sender_id, receiver_id, amt, desc)
        create_payment_notifications(db, t["transaction_id"], sender_id, receiver_id, amt)
        al = monitor_transaction(db, t["transaction_id"])
        txns.append({
            "transaction_id": t["transaction_id"],
            "sender_account_id": t["sender_account_id"],
            "receiver_account_id": t["receiver_account_id"],
            "amount_rupees": t["amount_rupees"],
            "status": t["status"],
            "description": t["description"],
            "created_at": t["created_at"],
        })
        for a in al:
            alerts.append({
                "alert_id": a.alert_id,
                "rule_triggered": a.rule_triggered,
                "severity": a.severity,
                "risk_score": a.risk_score,
                "reason": a.reason,
            })

    def _random_mesh_spread(origin_id: str, total_amt: float, label: str):
        """Spread funds randomly across F1..F50 in a multi-hop mesh (some forward, some stop)."""
        hop1_count = random.randint(4, 6)
        hop1_nodes = random.sample(partners, k=hop1_count)
        per_hop1 = max(50.0, round(total_amt / hop1_count, 2))
        hop1_received: list[tuple[Account, float]] = []

        for idx, p in enumerate(hop1_nodes):
            _run_tx(origin_id, p.account_id, per_hop1, f"{label} Hop1 -> {p.account_name} (#{idx + 1})")
            hop1_received.append((p, per_hop1))

        # Hop 2: randomly select ~60% of Hop 1 nodes to forward randomly to 1-2 other F partners
        hop2_forwarders = random.sample(hop1_received, k=max(2, len(hop1_received) // 2 + 1))
        hop2_received: list[tuple[Account, float]] = []
        used_ids = {p.account_id for p in hop1_nodes}

        for p1, amt1 in hop2_forwarders:
            avail_pool = [x for x in partners if x.account_id not in used_ids]
            if not avail_pool:
                break
            sub_count = random.randint(1, min(2, len(avail_pool)))
            next_nodes = random.sample(avail_pool, k=sub_count)
            sub_amt = max(25.0, round((amt1 * random.uniform(0.55, 0.85)) / sub_count, 2))
            for p2 in next_nodes:
                used_ids.add(p2.account_id)
                _run_tx(p1.account_id, p2.account_id, sub_amt, f"{label} Mesh2 {p1.account_name} -> {p2.account_name}")
                hop2_received.append((p2, sub_amt))

        # Hop 3: 1-2 random Hop 2 nodes forward once more
        if hop2_received:
            hop3_forwarders = random.sample(hop2_received, k=min(2, len(hop2_received)))
            for p2, amt2 in hop3_forwarders:
                avail_pool = [x for x in partners if x.account_id not in used_ids]
                if not avail_pool:
                    break
                p3 = random.choice(avail_pool)
                used_ids.add(p3.account_id)
                sub_amt = max(10.0, round(amt2 * random.uniform(0.5, 0.8), 2))
                _run_tx(p2.account_id, p3.account_id, sub_amt, f"{label} Mesh3 {p2.account_name} -> {p3.account_name}")

    try:
        ft = request.fraud_type
        if ft in ("FAN_IN", "UNRELATED_SENDERS"):
            chosen = random.sample(partners, k=5)
            for p in chosen:
                if p.balance_paise < 100000:
                    p.balance_paise += 200000
                    db.add(FundAllocation(
                        allocation_id=generate_allocation_id(),
                        account_id=p.account_id,
                        origin_transaction_id="UNRELATED_SENDER_SEED",
                        amount_paise=200000,
                        is_active=True,
                    ))
                    db.commit()
                _run_tx(p.account_id, target.account_id, round(request.amount_rupees / 5.0, 2), f"{ft}: {p.account_name} -> Target")

        elif ft in ("FAN_OUT", "TRANSACTION_VELOCITY", "TRANSACTION_SPLITTING", "RAPID_PASSTHROUGH"):
            _random_mesh_spread(target.account_id, request.amount_rupees, ft)
            create_notification(
                db,
                recipient_role="CUSTOMER",
                account_id=target.account_id,
                category="FRAUD_ALERT",
                severity="CRITICAL",
                title="RED ALERT: Malicious Activity Detected",
                message=(
                    f"Suspicious multi-hop transfers ({ft}) detected on {target.account_id}. "
                    f"Freeze your account immediately."
                ),
                transaction_id=txns[-1]["transaction_id"],
            )
            db.commit()

        elif ft in ("HUGE_AMOUNT", "NEW_ACCOUNT_HIGH_TXN"):
            amt = max(request.amount_rupees, 55000.0) if ft == "HUGE_AMOUNT" else max(request.amount_rupees, 8000.0)
            p = random.choice(partners)
            _run_tx(target.account_id, p.account_id, amt, f"{ft} -> {p.account_name}")

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "fraud_type": ft,
        "target_account_id": target.account_id,
        "transactions": txns,
        "alerts_triggered": alerts,
    }
