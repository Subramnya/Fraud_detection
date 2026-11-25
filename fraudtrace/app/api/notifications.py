"""Notification API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from fraudtrace.app.core.database import get_db
from fraudtrace.app.services.notification_service import (
    get_notifications, mark_read, mark_all_read,
)

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("")
def list_notifications(
    role: str = Query(..., pattern="^(CUSTOMER|BANKER)$"),
    account_id: str = Query(None),
    unread_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    items = get_notifications(db, role, account_id, unread_only)
    unread_count = sum(1 for item in items if not item["is_read"])
    if unread_only:
        all_items = get_notifications(db, role, account_id, False)
        unread_count = sum(1 for item in all_items if not item["is_read"])
    return {
        "notifications": items,
        "unread_count": unread_count,
    }


@router.post("/{notification_id}/read")
def read_notification(notification_id: str, db: Session = Depends(get_db)):
    try:
        return mark_read(db, notification_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/read-all")
def read_all_notifications(
    role: str = Query(..., pattern="^(CUSTOMER|BANKER)$"),
    account_id: str = Query(None),
    db: Session = Depends(get_db),
):
    return mark_all_read(db, role, account_id)
