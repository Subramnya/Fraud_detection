"""Report generation API endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from fraudtrace.app.core.database import get_db
from fraudtrace.app.services.report_service import generate_investigation_report

router = APIRouter(prefix="/api/reports", tags=["Reports"])


@router.get("/{case_id}")
def get_report(case_id: str, db: Session = Depends(get_db)):
    try:
        return generate_investigation_report(db, case_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
