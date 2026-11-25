"""Fraud-related schemas."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class FraudReport(BaseModel):
    reporting_account_id: str
    transaction_id: str
    fraud_category: str = Field(..., pattern="^(PAYMENT_FRAUD|UNAUTHORIZED_DEBIT)$")
    reported_amount_rupees: Optional[float] = None
    description: Optional[str] = None
    device_info: Optional[str] = None


class FraudCaseResponse(BaseModel):
    case_id: str
    reporting_account_id: str
    reported_transaction_id: str
    fraud_category: str
    reported_amount_rupees: float
    description: Optional[str] = None
    status: str
    trace_id: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FraudAlertResponse(BaseModel):
    alert_id: str
    account_id: str
    transaction_id: Optional[str] = None
    rule_triggered: str
    reason: str
    risk_score: float
    severity: str
    status: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TraceResult(BaseModel):
    trace_id: str
    origin_transaction_id: str
    original_amount_rupees: float
    total_traceable_remaining_rupees: float
    accounts_holding_funds: List[dict]
    transaction_paths: List[dict]
    hop_count: int
