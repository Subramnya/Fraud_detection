"""Account model."""
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, func, Index
from sqlalchemy.orm import relationship
from fraudtrace.app.core.database import Base


class Account(Base):
    __tablename__ = "accounts"
    account_id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    account_name = Column(String, nullable=False)
    balance_paise = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True)
    is_frozen = Column(Boolean, default=False)
    account_type = Column(String, default="NORMAL")
    user_trace_id = Column(String, nullable=True, index=True)
    bank_name = Column(String, nullable=True)
    branch_name = Column(String, nullable=True)
    ifsc_code = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    user = relationship("User", backref="accounts")
    __table_args__ = (Index("idx_account_user", "user_id"),)
