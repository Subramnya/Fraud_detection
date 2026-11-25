"""Notification service for customer and banker notifications."""
import uuid
from sqlalchemy.orm import Session
from fraudtrace.app.models.notification import Notification


def _gen_notif_id() -> str:
    return f"NTF_{uuid.uuid4().hex[:8].upper()}"


def create_notification(
    db: Session,
    recipient_role: str,
    category: str,
    title: str,
    message: str,
    account_id: str = None,
    severity: str = "INFO",
    transaction_id: str = None,
    alert_id: str = None,
    case_id: str = None,
) -> Notification:
    """Create a notification, avoiding duplicates for the same alert_id + role."""
    if alert_id:
        existing = (
            db.query(Notification)
            .filter(
                Notification.alert_id == alert_id,
                Notification.recipient_role == recipient_role,
                Notification.account_id == account_id,
            )
            .first()
        )
        if existing:
            return existing

    notif = Notification(
        notification_id=_gen_notif_id(),
        recipient_role=recipient_role,
        account_id=account_id,
        category=category,
        severity=severity,
        title=title,
        message=message,
        transaction_id=transaction_id,
        alert_id=alert_id,
        case_id=case_id,
        is_read=False,
    )
    db.add(notif)
    return notif


def create_payment_notifications(
    db: Session,
    transaction_id: str,
    sender_account_id: str,
    receiver_account_id: str,
    amount_rupees: float,
):
    """Create payment notifications for sender and receiver."""
    create_notification(
        db,
        recipient_role="CUSTOMER",
        account_id=sender_account_id,
        category="PAYMENT",
        severity="INFO",
        title="Payment Sent",
        message=f"Payment successful. ₹{amount_rupees:,.2f} sent to Account {receiver_account_id}.",
        transaction_id=transaction_id,
    )
    create_notification(
        db,
        recipient_role="CUSTOMER",
        account_id=receiver_account_id,
        category="PAYMENT",
        severity="INFO",
        title="Payment Received",
        message=f"You received ₹{amount_rupees:,.2f} from Account {sender_account_id}.",
        transaction_id=transaction_id,
    )
    db.commit()


def create_alert_notifications(
    db: Session,
    alert_id: str,
    account_id: str,
    transaction_id: str,
    severity: str,
    reason: str,
    amount_rupees: float,
):
    """Create both customer security notification and banker fraud alert notification."""
    if severity in ("HIGH", "CRITICAL"):
        cust_msg = (
            f"Important Security Alert: A potentially suspicious transaction of ₹{amount_rupees:,.2f} "
            f"was detected. Please review the activity and report it immediately if you did not authorize it."
        )
        cust_title = "Important Security Alert"
    elif severity == "MEDIUM":
        cust_msg = (
            f"Security Warning: Unusual transfer activity (₹{amount_rupees:,.2f}) was detected in your account. "
            f"Please verify whether these transactions were authorized."
        )
        cust_title = "Security Warning"
    else:
        cust_msg = (
            f"Unusual activity detected (₹{amount_rupees:,.2f}). Please review your recent transactions."
        )
        cust_title = "Unusual Activity Detected"

    # Customer notification
    create_notification(
        db,
        recipient_role="CUSTOMER",
        account_id=account_id,
        category="FRAUD_ALERT" if severity in ("HIGH", "CRITICAL") else "SECURITY",
        severity=severity,
        title=cust_title,
        message=cust_msg,
        transaction_id=transaction_id,
        alert_id=alert_id,
    )

    # Banker notification
    create_notification(
        db,
        recipient_role="BANKER",
        account_id=account_id,
        category="FRAUD_ALERT",
        severity=severity,
        title=f"{severity} Fraud Alert: {account_id}",
        message=f"Alert {alert_id} on {account_id} (₹{amount_rupees:,.2f}): {reason}",
        transaction_id=transaction_id,
        alert_id=alert_id,
    )


def get_notifications(
    db: Session,
    role: str,
    account_id: str = None,
    unread_only: bool = False,
) -> list:
    query = db.query(Notification).filter(Notification.recipient_role == role)
    if role == "CUSTOMER" and account_id:
        query = query.filter(Notification.account_id == account_id)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    items = query.order_by(Notification.created_at.desc()).limit(100).all()
    return [
        {
            "notification_id": n.notification_id,
            "recipient_role": n.recipient_role,
            "account_id": n.account_id,
            "category": n.category,
            "severity": n.severity,
            "title": n.title,
            "message": n.message,
            "transaction_id": n.transaction_id,
            "alert_id": n.alert_id,
            "case_id": n.case_id,
            "is_read": n.is_read,
            "created_at": n.created_at,
        }
        for n in items
    ]


def mark_read(db: Session, notification_id: str) -> dict:
    n = db.query(Notification).filter(Notification.notification_id == notification_id).first()
    if not n:
        raise ValueError(f"Notification {notification_id} not found")
    n.is_read = True
    db.commit()
    return {"notification_id": n.notification_id, "is_read": True}


def mark_all_read(db: Session, role: str, account_id: str = None) -> dict:
    query = db.query(Notification).filter(
        Notification.recipient_role == role,
        Notification.is_read == False,
    )
    if role == "CUSTOMER" and account_id:
        query = query.filter(Notification.account_id == account_id)
    count = query.update({"is_read": True})
    db.commit()
    return {"marked_read": count}
