"""Transaction schemas."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class PaymentRequest(BaseModel):
    sender_account_id: str
    receiver_account_id: str
    amount_rupees: float = Field(..., gt=0)
    description: Optional[str] = None


class TransactionResponse(BaseModel):
    transaction_id: str
    trace_id: Optional[str] = None
    sender_account_id: str
    receiver_account_id: str
    amount_rupees: float
    status: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    allocations_used: Optional[List[dict]] = None

    class Config:
        from_attributes = True


class TransactionHistory(BaseModel):
    account_id: Optional[str] = None
    transactions: List[TransactionResponse]
    total_count: int
