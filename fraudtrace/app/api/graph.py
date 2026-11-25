"""Graph analysis API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from fraudtrace.app.core.database import get_db
from fraudtrace.app.services.graph_service import (
    get_graph_for_case, get_graph_for_trace,
    get_graph_for_account, multi_hop_trace,
)

router = APIRouter(prefix="/api/graph", tags=["Graph Analysis"])


@router.get("/case/{case_id}")
def graph_for_case(case_id: str, db: Session = Depends(get_db)):
    try:
        return get_graph_for_case(db, case_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/trace/{trace_id}")
def graph_for_trace(trace_id: str, db: Session = Depends(get_db)):
    try:
        return get_graph_for_trace(db, trace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/account/{account_id}")
def graph_for_account(account_id: str, db: Session = Depends(get_db)):
    return get_graph_for_account(db, account_id)


@router.get("/trace-hops/{account_id}")
def trace_hops(account_id: str, direction: str = Query("downstream"),
               max_hops: int = Query(10), db: Session = Depends(get_db)):
    return multi_hop_trace(db, account_id, direction, max_hops)
