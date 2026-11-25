"""Freeze request model."""
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, func, Text, Index
from sqlalchemy.orm import relationship
from fraudtrace.app.core.database import Base


class FreezeRequest(Base):
    __tablename__ = "freeze_requests"
    request_id = Column(String, primary_key=True, index=True)
    case_id = Column(String, ForeignKey("fraud_cases.case_id"), nullable=False, index=True)
    account_id = Column(String, ForeignKey("accounts.account_id"), nullable=False, index=True)
    trace_id = Column(String, nullable=True, index=True)
    suggested_amount_paise = Column(Integer, nullable=False)
    available_balance_paise = Column(Integer, nullable=False)
    traceable_balance_paise = Column(Integer, nullable=False)
    reason = Column(Text, nullable=True)
    status = Column(String, default="PENDING_REVIEW")
    reviewer = Column(String, nullable=True)
    review_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    reviewed_at = Column(DateTime, nullable=True)
    case = relationship("FraudCase", backref="freeze_requests")
    account = relationship("Account", backref="freeze_requests")
    __table_args__ = (Index("idx_freeze_case", "case_id"), Index("idx_freeze_status", "status"),)
