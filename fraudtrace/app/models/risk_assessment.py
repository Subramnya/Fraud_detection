"""Risk assessment model."""
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, func, Text, Index
from sqlalchemy.orm import relationship
from fraudtrace.app.core.database import Base


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"
    assessment_id = Column(String, primary_key=True, index=True)
    account_id = Column(String, ForeignKey("accounts.account_id"), nullable=False, index=True)
    overall_score = Column(Float, default=0.0)
    risk_category = Column(String, default="LOW")
    velocity_score = Column(Float, default=0.0)
    fanin_score = Column(Float, default=0.0)
    fanout_score = Column(Float, default=0.0)
    passthrough_score = Column(Float, default=0.0)
    amount_score = Column(Float, default=0.0)
    new_recipient_score = Column(Float, default=0.0)
    timing_score = Column(Float, default=0.0)
    explanation = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    account = relationship("Account", backref="risk_assessments")
    __table_args__ = (Index("idx_risk_account", "account_id"),)
