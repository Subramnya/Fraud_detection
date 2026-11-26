"""Isolated Fraud Simulation module for Sam (ShadowPay).

Uses existing account registration, payment processing, ledger,
allocation, notification, and fraud detection services without bypassing any rules.
"""
from sqlalchemy.orm import Session
from fraudtrace.app.models.account import Account
from fraudtrace.app.models.allocation import FundAllocation
from fraudtrace.app.services.account_service import register_account
from fraudtrace.app.services.payment_service import process_payment
from fraudtrace.app.services.fraud_detection_service import monitor_transaction
from fraudtrace.app.services.notification_service import create_payment_notifications
from fraudtrace.app.utils.helpers import paise_to_rupees, rupees_to_paise
from fraudtrace.app.utils.identifiers import generate_allocation_id

SAM_EMAIL = "sam.shadowpay@fraudtrace.demo"
SAM_DISPLAY_NAME = "ShadowPay (Sam)"
SAM_ACCOUNT_TYPE = "NORMAL"
DEFAULT_SAM_BALANCE_RUPEES = 25000.0


def ensure_sam_account(
    db: Session, initial_balance_rupees: float = DEFAULT_SAM_BALANCE_RUPEES
) -> dict:
    """Idempotently retrieve or register Sam (ShadowPay) as a normal customer account."""
    existing = (
        db.query(Account)
        .filter(Account.account_name == SAM_DISPLAY_NAME)
        .first()
    )
    if existing:
        return {
            "account_id": existing.account_id,
            "user_id": existing.user_id,
            "username": "Sam",
            "display_name": "ShadowPay",
            "account_name": existing.account_name,
            "account_type": existing.account_type,
            "label": "DEMO",
            "balance_rupees": paise_to_rupees(existing.balance_paise),
            "is_active": existing.is_active,
        }

    created = register_account(
        db,
        name=SAM_DISPLAY_NAME,
        email=SAM_EMAIL,
        phone="9000000000",
        initial_balance_rupees=initial_balance_rupees,
        account_type=SAM_ACCOUNT_TYPE,
    )
    return {
        "account_id": created["account_id"],
        "user_id": created["user_id"],
        "username": "Sam",
        "display_name": "ShadowPay",
        "account_name": created["account_name"],
        "account_type": created["account_type"],
        "label": "DEMO",
        "balance_rupees": created["balance_rupees"],
        "is_active": created["is_active"],
    }


def _get_or_create_peer_accounts(db: Session, sam_account_id: str, needed: int = 5) -> list[Account]:
    """Return at least `needed` active non-Sam accounts, creating demo peers if DB is sparse."""
    peers = (
        db.query(Account)
        .filter(Account.account_id != sam_account_id, Account.is_active == True)
        .all()
    )
    idx = 1
    while len(peers) < needed:
        email = f"sim_peer_{idx}@fraudtrace.demo"
        try:
            res = register_account(
                db,
                name=f"Demo Peer {idx}",
                email=email,
                initial_balance_rupees=20000.0,
                account_type="NORMAL",
            )
            acc = db.query(Account).filter(Account.account_id == res["account_id"]).first()
            if acc:
                peers.append(acc)
        except ValueError:
            pass
        idx += 1
    return peers[:needed]


def _ensure_balance(db: Session, account: Account, min_rupees: float):
    """Top up virtual balance via FundAllocation if needed for a simulation step."""
    needed_paise = rupees_to_paise(min_rupees)
    if account.balance_paise < needed_paise:
        diff_paise = needed_paise - account.balance_paise
        account.balance_paise += diff_paise
        db.add(
            FundAllocation(
                allocation_id=generate_allocation_id(),
                account_id=account.account_id,
                origin_transaction_id="SIMULATION_DEMO_FUNDING",
                amount_paise=diff_paise,
                is_active=True,
            )
        )
        db.commit()
        db.refresh(account)


def _execute_monitored_payment(
    db: Session,
    sender_id: str,
    receiver_id: str,
    amount_rupees: float,
    description: str,
) -> tuple[dict, list[dict]]:
    """Run a single payment through the real payment, notification, and fraud engines."""
    txn = process_payment(
        db,
        sender_account_id=sender_id,
        receiver_account_id=receiver_id,
        amount_rupees=amount_rupees,
        description=description,
    )
    try:
        create_payment_notifications(
            db,
            transaction_id=txn["transaction_id"],
            sender_account_id=sender_id,
            receiver_account_id=receiver_id,
            amount_rupees=amount_rupees,
        )
    except Exception:
        pass

    alerts = monitor_transaction(db, txn["transaction_id"])
    alert_dicts = [
        {
            "alert_id": a.alert_id,
            "account_id": a.account_id,
            "transaction_id": a.transaction_id,
            "rule_triggered": a.rule_triggered,
            "severity": a.severity,
            "risk_score": a.risk_score,
            "reason": a.reason,
        }
        for a in alerts
    ]
    return txn, alert_dicts


def run_sam_scenario(db: Session, scenario: str) -> dict:
    """Execute one of the 5 predefined fraud simulation scenarios on Sam's account."""
    sam_info = ensure_sam_account(db)
    sam_acc = db.query(Account).filter(Account.account_id == sam_info["account_id"]).first()
    peers = _get_or_create_peer_accounts(db, sam_acc.account_id, needed=5)

    txns = []
    all_alerts = []
    detection_note = None

    if scenario == "FAN_IN":
        # 5 distinct accounts each send ₹1,500 to Sam
        for i, peer in enumerate(peers[:5]):
            _ensure_balance(db, peer, 2000.0)
            txn, alerts = _execute_monitored_payment(
                db,
                peer.account_id,
                sam_acc.account_id,
                1500.0,
                f"SIMULATION (Fan-in {i + 1}/5) to ShadowPay",
            )
            txns.append(txn)
            all_alerts.extend(alerts)

    elif scenario == "FAN_OUT":
        # Sam sends ₹1,200 to 5 distinct accounts
        _ensure_balance(db, sam_acc, 6500.0)
        for i, peer in enumerate(peers[:5]):
            txn, alerts = _execute_monitored_payment(
                db,
                sam_acc.account_id,
                peer.account_id,
                1200.0,
                f"SIMULATION (Fan-out {i + 1}/5) from ShadowPay",
            )
            txns.append(txn)
            all_alerts.extend(alerts)

    elif scenario == "HIGH_VELOCITY":
        # Sam sends 5 rapid transfers of ₹600 each
        _ensure_balance(db, sam_acc, 3500.0)
        target = peers[0]
        for i in range(5):
            txn, alerts = _execute_monitored_payment(
                db,
                sam_acc.account_id,
                target.account_id,
                600.0,
                f"SIMULATION (High Velocity {i + 1}/5) from ShadowPay",
            )
            txns.append(txn)
            all_alerts.extend(alerts)

    elif scenario == "TRANSACTION_SPLITTING":
        # Peer sends ₹4,500 to Sam, then Sam splits into 3 smaller ₹1,400 transfers
        source_peer = peers[0]
        _ensure_balance(db, source_peer, 5000.0)
        in_txn, in_alerts = _execute_monitored_payment(
            db,
            source_peer.account_id,
            sam_acc.account_id,
            4500.0,
            "SIMULATION (Splitting source) to ShadowPay",
        )
        txns.append(in_txn)
        all_alerts.extend(in_alerts)

        for i, peer in enumerate(peers[1:4]):
            txn, alerts = _execute_monitored_payment(
                db,
                sam_acc.account_id,
                peer.account_id,
                1400.0,
                f"SIMULATION (Split {i + 1}/3) from ShadowPay",
            )
            txns.append(txn)
            all_alerts.extend(alerts)

        if not all_alerts:
            detection_note = (
                "No alert triggered by existing rules: there is no dedicated TRANSACTION_SPLITTING "
                "rule yet, and ₹1,400 transfers are below HIGH_AMOUNT_THRESHOLD (₹5,000) while 3 "
                "transfers are below FANOUT_THRESHOLD (5) and VELOCITY_MAX_TRANSACTIONS (5)."
            )

    elif scenario == "RAPID_PASSTHROUGH":
        # Peer sends ₹4,000 to Sam, Sam immediately forwards ₹3,600 (90% >= 80% threshold)
        source_peer = peers[0]
        dest_peer = peers[1]
        _ensure_balance(db, source_peer, 4500.0)
        in_txn, in_alerts = _execute_monitored_payment(
            db,
            source_peer.account_id,
            sam_acc.account_id,
            4000.0,
            "SIMULATION (Pass-through inbound) to ShadowPay",
        )
        txns.append(in_txn)
        all_alerts.extend(in_alerts)

        out_txn, out_alerts = _execute_monitored_payment(
            db,
            sam_acc.account_id,
            dest_peer.account_id,
            3600.0,
            "SIMULATION (Pass-through outbound) from ShadowPay",
        )
        txns.append(out_txn)
        all_alerts.extend(out_alerts)

    else:
        raise ValueError(f"Unsupported scenario: {scenario}")

    db.refresh(sam_acc)

    if not all_alerts and not detection_note:
        detection_note = (
            "No alert was triggered by the current fraud detection thresholds for this run."
        )

    return {
        "scenario": scenario,
        "label": "DEMO",
        "sam_account_id": sam_acc.account_id,
        "sam_balance_rupees": paise_to_rupees(sam_acc.balance_paise),
        "transactions": [
            {
                "transaction_id": t["transaction_id"],
                "sender_account_id": t["sender_account_id"],
                "receiver_account_id": t["receiver_account_id"],
                "amount_rupees": t["amount_rupees"],
                "status": t["status"],
            }
            for t in txns
        ],
        "alerts_detected": all_alerts,
        "detection_note": detection_note,
    }
