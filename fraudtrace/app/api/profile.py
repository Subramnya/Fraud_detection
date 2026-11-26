"""User Profile, Banking Info, KYC, Security, Preferences & Privacy API."""
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from fraudtrace.app.core.database import get_db
from fraudtrace.app.models.account import Account
from fraudtrace.app.models.user import User
from fraudtrace.app.models.login_activity import LoginActivity
from fraudtrace.app.models.audit_log import AuditLog
from fraudtrace.app.services.notification_service import create_notification
from fraudtrace.app.utils.identifiers import generate_log_id

router = APIRouter(prefix="/api/profile", tags=["User Profile"])

DEFAULT_PREFS = {
    "txn_success": True,
    "txn_failed": True,
    "suspicious_txn": True,  # Essential security alert (always enforced)
    "fraud_updates": True,
    "login_alerts": True,
    "email_notifications": True,
    "sms_notifications": True,
}


def _hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or os.urandom(16).hex()
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return f"{salt}${dk.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, expected = stored.split("$", 1)
        return _hash_password(password, salt) == stored
    except Exception:
        return False


def _mask_account_id(account_id: str) -> str:
    tail = account_id[-4:] if len(account_id) >= 4 else account_id
    return f"XXXX XXXX {tail}"


def _get_user_and_account(db: Session, account_id: str) -> tuple[User, Account]:
    acc = db.query(Account).filter(Account.account_id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    user = db.query(User).filter(User.user_id == acc.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Associated user not found")
    return user, acc


@router.get("/{account_id}")
def get_profile(account_id: str, db: Session = Depends(get_db)):
    """Retrieve realistic banking profile, KYC, security, login activity, and preferences."""
    user, acc = _get_user_and_account(db, account_id)

    prefs = dict(DEFAULT_PREFS)
    if getattr(user, "notification_prefs_json", None):
        try:
            prefs.update(json.loads(user.notification_prefs_json))
        except Exception:
            pass
    prefs["suspicious_txn"] = True  # Essential security notifications cannot be disabled

    logins = (
        db.query(LoginActivity)
        .filter(LoginActivity.user_id == user.user_id)
        .order_by(LoginActivity.created_at.desc())
        .limit(8)
        .all()
    )
    last_success = next((l for l in logins if l.status == "SUCCESS"), None)

    return {
        "personal": {
            "user_id": user.user_id,
            "full_name": user.name,
            "email": user.email,
            "phone": user.phone or "Not available",
            "date_of_birth": getattr(user, "date_of_birth", None) or "Not available",
            "address": getattr(user, "address", None) or "Not available",
        },
        "bank_account": {
            "account_id": acc.account_id,
            "masked_account_number": _mask_account_id(acc.account_id),
            "account_holder_name": acc.account_name,
            "account_type": "Savings Account" if acc.account_type == "NORMAL" else acc.account_type,
            "bank_name": getattr(acc, "bank_name", None) or "Not available",
            "branch_name": getattr(acc, "branch_name", None) or "Not available",
            "ifsc_code": getattr(acc, "ifsc_code", None) or "Not available",
            "opened_at": str(acc.created_at) if acc.created_at else "Not available",
            "status": "Frozen" if getattr(acc, "is_frozen", False) else ("Active" if acc.is_active else "Inactive"),
        },
        "kyc": {
            "overall_status": getattr(user, "kyc_status", None) or "PENDING",
            "mobile_verified": bool(getattr(user, "mobile_verified", False)),
            "email_verified": bool(getattr(user, "email_verified", False)),
            "verified_at": str(user.kyc_verified_at) if getattr(user, "kyc_verified_at", None) else "Not available",
        },
        "security": {
            "password_configured": bool(getattr(user, "password_hash", None)),
            "two_factor_enabled": bool(getattr(user, "two_factor_enabled", False)),
            "two_factor_status": "Enabled" if getattr(user, "two_factor_enabled", False) else "Not Enabled",
            "last_successful_login": str(last_success.created_at) if last_success else "Not available",
            "recent_logins": [
                {
                    "activity_id": l.activity_id,
                    "status": l.status,
                    "device_info": l.device_info or "Web Browser",
                    "ip_address": l.ip_address or "127.0.0.1",
                    "timestamp": str(l.created_at),
                }
                for l in logins
            ],
        },
        "notification_preferences": prefs,
        "privacy": {
            "privacy_consent": bool(getattr(user, "privacy_consent", True))
            if getattr(user, "privacy_consent", None) is not None
            else True,
            "data_sharing_opt_in": bool(getattr(user, "data_sharing_opt_in", False)),
        },
    }


class PersonalUpdate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=120)
    phone: str | None = None
    date_of_birth: str | None = None
    address: str | None = None


@router.patch("/{account_id}/personal")
def update_personal_info(account_id: str, req: PersonalUpdate, db: Session = Depends(get_db)):
    user, acc = _get_user_and_account(db, account_id)
    user.name = req.full_name.strip()
    acc.account_name = req.full_name.strip()
    if req.phone is not None:
        user.phone = req.phone.strip() or None
    if req.date_of_birth is not None:
        user.date_of_birth = req.date_of_birth.strip() or None
    if req.address is not None:
        user.address = req.address.strip() or None

    db.add(AuditLog(
        log_id=generate_log_id(),
        entity_type="USER_PROFILE",
        entity_id=user.user_id,
        action="UPDATE_PERSONAL",
        actor=account_id,
        details=json.dumps({"full_name": user.name}),
    ))
    db.commit()
    return {"updated": True, "full_name": user.name}


class KycVerifyRequest(BaseModel):
    verify_mobile: bool = False
    verify_email: bool = False


@router.post("/{account_id}/kyc/verify")
def update_kyc_verification(account_id: str, req: KycVerifyRequest, db: Session = Depends(get_db)):
    user, _ = _get_user_and_account(db, account_id)
    if req.verify_mobile:
        if not user.phone:
            raise HTTPException(status_code=400, detail="Add a mobile number before verifying it")
        user.mobile_verified = True
    if req.verify_email:
        user.email_verified = True

    if user.mobile_verified and user.email_verified:
        user.kyc_status = "VERIFIED"
        user.kyc_verified_at = datetime.now(timezone.utc).replace(tzinfo=None)
    elif user.mobile_verified or user.email_verified:
        user.kyc_status = "PENDING"
    else:
        user.kyc_status = "VERIFICATION_REQUIRED"

    db.add(AuditLog(
        log_id=generate_log_id(),
        entity_type="KYC",
        entity_id=user.user_id,
        action="KYC_UPDATE",
        actor=account_id,
        details=json.dumps({"kyc_status": user.kyc_status}),
    ))
    db.commit()
    return {"kyc_status": user.kyc_status, "mobile_verified": user.mobile_verified, "email_verified": user.email_verified}


class PasswordChangeRequest(BaseModel):
    current_password: str | None = None
    new_password: str = Field(..., min_length=6, max_length=128)


@router.post("/{account_id}/password")
def change_password(account_id: str, req: PasswordChangeRequest, db: Session = Depends(get_db)):
    user, _ = _get_user_and_account(db, account_id)
    if user.password_hash:
        if not req.current_password or not _verify_password(req.current_password, user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = _hash_password(req.new_password)
    db.add(AuditLog(
        log_id=generate_log_id(),
        entity_type="SECURITY",
        entity_id=user.user_id,
        action="PASSWORD_CHANGE",
        actor=account_id,
        details="Password updated",
    ))
    db.commit()
    return {"updated": True}


@router.post("/{account_id}/login-event")
def record_login_event(account_id: str, request: Request, db: Session = Depends(get_db)):
    user, _ = _get_user_and_account(db, account_id)
    ua = request.headers.get("user-agent", "Web Browser")[:120]
    ip = request.client.host if request.client else "127.0.0.1"
    act = LoginActivity(
        activity_id=f"LGN_{uuid.uuid4().hex[:8].upper()}",
        user_id=user.user_id,
        account_id=account_id,
        status="SUCCESS",
        device_info=ua,
        ip_address=ip,
    )
    db.add(act)
    db.commit()
    return {"recorded": True, "activity_id": act.activity_id}


class NotificationPrefsUpdate(BaseModel):
    txn_success: bool = True
    txn_failed: bool = True
    suspicious_txn: bool = True
    fraud_updates: bool = True
    login_alerts: bool = True
    email_notifications: bool = True
    sms_notifications: bool = True


@router.put("/{account_id}/preferences")
def update_notification_preferences(
    account_id: str, req: NotificationPrefsUpdate, db: Session = Depends(get_db)
):
    user, _ = _get_user_and_account(db, account_id)
    prefs = req.model_dump()
    prefs["suspicious_txn"] = True  # Essential security alerts cannot be disabled
    user.notification_prefs_json = json.dumps(prefs)
    db.commit()
    return prefs


class PrivacyUpdate(BaseModel):
    privacy_consent: bool = True
    data_sharing_opt_in: bool = False


@router.put("/{account_id}/privacy")
def update_privacy(account_id: str, req: PrivacyUpdate, db: Session = Depends(get_db)):
    user, _ = _get_user_and_account(db, account_id)
    user.privacy_consent = req.privacy_consent
    user.data_sharing_opt_in = req.data_sharing_opt_in
    db.commit()
    return {"privacy_consent": user.privacy_consent, "data_sharing_opt_in": user.data_sharing_opt_in}


class SupportTicketRequest(BaseModel):
    subject: str = Field(..., min_length=3, max_length=120)
    message: str = Field(..., min_length=5, max_length=1000)


@router.post("/{account_id}/support")
def submit_support_issue(account_id: str, req: SupportTicketRequest, db: Session = Depends(get_db)):
    user, _ = _get_user_and_account(db, account_id)
    ticket_id = f"SUP_{uuid.uuid4().hex[:8].upper()}"
    db.add(AuditLog(
        log_id=generate_log_id(),
        entity_type="SUPPORT_TICKET",
        entity_id=ticket_id,
        action="CREATE",
        actor=account_id,
        details=json.dumps({"user_id": user.user_id, "subject": req.subject, "message": req.message}),
    ))
    create_notification(
        db,
        recipient_role="CUSTOMER",
        account_id=account_id,
        category="ACCOUNT",
        severity="INFO",
        title=f"Support Ticket Logged ({ticket_id})",
        message=f"We received your request: '{req.subject}'. Our team will review it shortly.",
    )
    db.commit()
    return {"ticket_id": ticket_id, "status": "OPEN"}
