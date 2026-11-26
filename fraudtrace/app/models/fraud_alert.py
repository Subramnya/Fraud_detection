"""Fraud alert model."""
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, func, Text, Float, Index
from sqlalchemy.orm import relationship
from fraudtrace.app.core.database import Base


class FraudAlert(Base):
    __tablename__ = "fraud_alerts"
    alert_id = Column(String, primary_key=True, index=True)
    account_id = Column(String, ForeignKey("accounts.account_id"), nullable=False, index=True)
    transaction_id = Column(String, ForeignKey("transactions.transaction_id"), nullable=True, index=True)
    rule_triggered = Column(String, nullable=False)
    reason = Column(Text, nullable=False)
    risk_score = Column(Float, default=0.0)
    severity = Column(String, default="LOW")
    status = Column(String, default="NEW")
    evidence = Column(Text, nullable=True)  # JSON: supporting txns, timestamps, amounts, explanation
    created_at = Column(DateTime, server_default=func.now())
    account = relationship("Account", backref="fraud_alerts")
    transaction = relationship("Transaction", backref="fraud_alerts")
    __table_args__ = (Index("idx_alert_severity", "severity"), Index("idx_alert_status", "status"),)
