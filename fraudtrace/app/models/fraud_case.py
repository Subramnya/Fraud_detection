"""Fraud case model."""
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, func, Text, Index
from sqlalchemy.orm import relationship
from fraudtrace.app.core.database import Base


class FraudCase(Base):
    __tablename__ = "fraud_cases"
    case_id = Column(String, primary_key=True, index=True)
    reporting_account_id = Column(String, ForeignKey("accounts.account_id"), nullable=False, index=True)
    reported_transaction_id = Column(String, ForeignKey("transactions.transaction_id"), nullable=False, index=True)
    fraud_category = Column(String, nullable=False)
    reported_amount_paise = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, default="OPEN")
    device_info = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    reporting_account = relationship("Account", backref="fraud_cases")
    reported_transaction = relationship("Transaction", backref="fraud_cases")
    __table_args__ = (Index("idx_case_status", "status"),)
