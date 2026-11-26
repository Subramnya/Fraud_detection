"""Cyber Cell report model."""
from sqlalchemy import Column, String, DateTime, ForeignKey, func, Text, Index
from fraudtrace.app.core.database import Base


class CyberCellReport(Base):
    __tablename__ = "cybercell_reports"

    report_id = Column(String, primary_key=True, index=True)
    case_id = Column(String, ForeignKey("fraud_cases.case_id"), nullable=True, index=True)
    account_id = Column(String, ForeignKey("accounts.account_id"), nullable=False, index=True)
    submitted_by = Column(String, nullable=False)
    fraud_type = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    report_payload = Column(Text, nullable=True)  # Full JSON report + graph
    status = Column(String, default="PENDING")  # PENDING, INVESTIGATING, RESOLVED
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (Index("idx_cyber_status", "status"),)
