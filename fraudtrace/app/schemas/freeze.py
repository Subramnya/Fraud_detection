"""Freeze request schemas."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class FreezeRequestCreate(BaseModel):
    case_id: str
    account_id: str
    trace_id: Optional[str] = None
    reason: Optional[str] = None


class FreezeRequestResponse(BaseModel):
    request_id: str
    case_id: str
    account_id: str
    trace_id: Optional[str] = None
    suggested_amount_rupees: float
    available_balance_rupees: float
    traceable_balance_rupees: float
    reason: Optional[str] = None
    status: str
    reviewer: Optional[str] = None
    review_notes: Optional[str] = None
    created_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FreezeReview(BaseModel):
    status: str = Field(..., pattern="^(APPROVED_SIMULATED|PARTIALLY_APPROVED_SIMULATED|REJECTED)$")
    reviewer: str
    review_notes: Optional[str] = None
    approved_amount_rupees: Optional[float] = None
