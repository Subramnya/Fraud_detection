"""Audit log model."""
from sqlalchemy import Column, String, DateTime, func, Text, Index
from fraudtrace.app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"
    log_id = Column(String, primary_key=True, index=True)
    entity_type = Column(String, nullable=False)
    entity_id = Column(String, nullable=False, index=True)
    action = Column(String, nullable=False)
    actor = Column(String, nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    __table_args__ = (Index("idx_audit_entity", "entity_type", "entity_id"),)
