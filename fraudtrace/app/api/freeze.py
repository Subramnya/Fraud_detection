"""Freeze request API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from fraudtrace.app.core.database import get_db
from fraudtrace.app.schemas.freeze import FreezeRequestCreate, FreezeRequestResponse, FreezeReview
from fraudtrace.app.services.freeze_service import (
    create_freeze_request, review_freeze_request,
    get_freeze_requests, get_freeze_request,
)

router = APIRouter(prefix="/api/freeze", tags=["Freeze Requests"])


@router.post("/request", response_model=FreezeRequestResponse)
def create_request(request: FreezeRequestCreate, db: Session = Depends(get_db)):
    try:
        return create_freeze_request(
            db, request.case_id, request.account_id,
            request.trace_id, request.reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/requests", response_model=list)
def list_requests(case_id: str = Query(None), db: Session = Depends(get_db)):
    return get_freeze_requests(db, case_id)


@router.get("/requests/{request_id}", response_model=FreezeRequestResponse)
def get_request(request_id: str, db: Session = Depends(get_db)):
    try:
        return get_freeze_request(db, request_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/requests/{request_id}/review", response_model=FreezeRequestResponse)
def review_request(request_id: str, review: FreezeReview, db: Session = Depends(get_db)):
    try:
        return review_freeze_request(
            db, request_id, review.status, review.reviewer,
            review.review_notes, review.approved_amount_rupees,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
