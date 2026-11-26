"""Isolated Fraud Simulation API endpoints for Sam (ShadowPay)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from fraudtrace.app.core.database import get_db
from fraudtrace.app.simulation.sam_simulation import (
    DEFAULT_SAM_BALANCE_RUPEES,
    ensure_sam_account,
    run_sam_scenario,
)

router = APIRouter(prefix="/api/simulation", tags=["Fraud Simulation (DEMO)"])


class SamScenarioRequest(BaseModel):
    scenario: str = Field(
        ...,
        pattern="^(FAN_IN|FAN_OUT|HIGH_VELOCITY|TRANSACTION_SPLITTING|RAPID_PASSTHROUGH)$",
    )


@router.get("/sam")
def get_or_create_sam(
    initial_balance_rupees: float = Query(DEFAULT_SAM_BALANCE_RUPEES, ge=0),
    db: Session = Depends(get_db),
):
    """Get or idempotently register Sam (ShadowPay) Fraud Simulation Account."""
    return ensure_sam_account(db, initial_balance_rupees=initial_balance_rupees)


@router.post("/sam/scenario")
def trigger_sam_scenario(request: SamScenarioRequest, db: Session = Depends(get_db)):
    """Execute a controlled fraud simulation scenario on Sam's account."""
    try:
        return run_sam_scenario(db, request.scenario)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
