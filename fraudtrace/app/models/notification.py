"""Notification model for customer and banker alerts."""
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, func, Text, Index
from fraudtrace.app.core.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    notification_id = Column(String, primary_key=True, index=True)
    recipient_role = Column(String, nullable=False, index=True)  # CUSTOMER, BANKER
    account_id = Column(String, ForeignKey("accounts.account_id"), nullable=True, index=True)
    category = Column(String, nullable=False)  # PAYMENT, SECURITY, FRAUD_ALERT, ACCOUNT
    severity = Column(String, default="INFO")  # INFO, LOW, MEDIUM, HIGH, CRITICAL
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    transaction_id = Column(String, nullable=True, index=True)
    alert_id = Column(String, nullable=True, index=True)
    case_id = Column(String, nullable=True, index=True)
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("idx_notif_role_acc", "recipient_role", "account_id", "is_read"),
    )
