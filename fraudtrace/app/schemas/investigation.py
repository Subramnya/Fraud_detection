"""Investigation schemas."""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class InvestigationPriority(BaseModel):
    account_id: str
    priority_score: float
    amount_score: float
    risk_score: float
    traceable_money_score: float
    urgency_score: float
    traceable_balance_rupees: float
    available_balance_rupees: float


class InvestigationReport(BaseModel):
    case_id: str
    status: str
    fraud_category: str
    original_transaction: dict
    reported_amount_rupees: float
    trace_id: Optional[str] = None
    transaction_timeline: List[dict]
    connected_accounts: List[dict]
    multi_hop_paths: List[dict]
    risk_assessments: List[dict]
    traceable_amounts: List[dict]
    account_prioritization: List[dict]
    freeze_recommendations: List[dict]
    audit_trail: List[dict]
    generated_at: datetime
