"""Login activity model for security auditing."""
from sqlalchemy import Column, String, DateTime, ForeignKey, func, Index
from fraudtrace.app.core.database import Base


class LoginActivity(Base):
    __tablename__ = "login_activities"

    activity_id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    account_id = Column(String, nullable=False, index=True)
    status = Column(String, default="SUCCESS")  # SUCCESS, FAILED
    device_info = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (Index("idx_login_user", "user_id"),)
