"""Risk assessment model."""
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, func, Text, Index
from sqlalchemy.orm import relationship
from fraudtrace.app.core.database import Base


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"
    assessment_id = Column(String, primary_key=True, index=True)
    account_id = Column(String, ForeignKey("accounts.account_id"), nullable=False, index=True)
    alert_id = Column(String, nullable=True, index=True)
    case_id = Column(String, nullable=True, index=True)
    overall_score = Column(Float, default=0.0)  # 0 to 100
    risk_category = Column(String, default="LOW")  # LOW, MEDIUM, HIGH, CRITICAL
    velocity_score = Column(Float, default=0.0)
    fanin_score = Column(Float, default=0.0)
    fanout_score = Column(Float, default=0.0)
    passthrough_score = Column(Float, default=0.0)
    amount_score = Column(Float, default=0.0)
    new_recipient_score = Column(Float, default=0.0)
    timing_score = Column(Float, default=0.0)
    explanation = Column(Text, nullable=True)
    breakdown_json = Column(Text, nullable=True)  # 5-factor breakdown + observations
    model_version = Column(String, default="FraudTrace-AI-v2.0 (RF+IsoForest)")
    created_at = Column(DateTime, server_default=func.now())
    account = relationship("Account", backref="risk_assessments")
    __table_args__ = (Index("idx_risk_account", "account_id"),)
