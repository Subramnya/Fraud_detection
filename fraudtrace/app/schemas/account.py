"""Account schemas."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class AccountRegister(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=3)
    phone: Optional[str] = None
    initial_balance_rupees: float = Field(default=0.0, ge=0)
    account_type: str = Field(default="NORMAL")


class AccountResponse(BaseModel):
    account_id: str
    user_id: str
    account_name: str
    balance_rupees: float
    is_active: bool
    account_type: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AccountBalance(BaseModel):
    account_id: str
    balance_rupees: float
    balance_paise: int


class AllocationInfo(BaseModel):
    allocation_id: str
    origin_transaction_id: str
    trace_id: Optional[str] = None
    amount_rupees: float
    amount_paise: int
    is_active: bool
    parent_allocation_id: Optional[str] = None
    created_at: Optional[datetime] = None


class AccountAllocations(BaseModel):
    account_id: str
    total_balance_rupees: float
    allocations: List[AllocationInfo]
    traceable_total_rupees: float
    legitimate_total_rupees: float
