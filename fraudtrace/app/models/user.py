"""User model with banking profile, KYC, security, and notification preferences."""
from sqlalchemy import Column, String, Boolean, DateTime, Text, func
from fraudtrace.app.core.database import Base


class User(Base):
    __tablename__ = "users"
    user_id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    phone = Column(String, nullable=True)
    date_of_birth = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    password_hash = Column(String, nullable=True)
    two_factor_enabled = Column(Boolean, default=False)
    kyc_status = Column(String, default="PENDING")  # VERIFIED, PENDING, VERIFICATION_REQUIRED
    mobile_verified = Column(Boolean, default=False)
    email_verified = Column(Boolean, default=False)
    kyc_verified_at = Column(DateTime, nullable=True)
    notification_prefs_json = Column(Text, nullable=True)
    privacy_consent = Column(Boolean, default=True)
    data_sharing_opt_in = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
