"""Payment API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from fraudtrace.app.core.database import get_db
from fraudtrace.app.schemas.transaction import PaymentRequest, TransactionResponse, TransactionHistory
from fraudtrace.app.services.payment_service import process_payment, get_transaction, get_transaction_history
from fraudtrace.app.services.fraud_detection_service import monitor_transaction
from fraudtrace.app.services.notification_service import create_payment_notifications

router = APIRouter(prefix="/api/payments", tags=["Payments"])


@router.post("/send", response_model=TransactionResponse)
def send_payment(request: PaymentRequest, db: Session = Depends(get_db)):
    try:
        result = process_payment(
            db, request.sender_account_id, request.receiver_account_id,
            request.amount_rupees, request.description,
        )
        # Emit customer payment notifications
        try:
            create_payment_notifications(
                db,
                transaction_id=result["transaction_id"],
                sender_account_id=request.sender_account_id,
                receiver_account_id=request.receiver_account_id,
                amount_rupees=request.amount_rupees,
            )
        except Exception:
            pass
        # Trigger real-time monitoring
        try:
            monitor_transaction(db, result["transaction_id"])
        except Exception:
            pass  # Monitoring failure should not fail the payment
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/history", response_model=TransactionHistory)
@router.get("/history/", response_model=TransactionHistory)
def get_history(account_id: str = Query(None), db: Session = Depends(get_db)):
    return get_transaction_history(db, account_id)


@router.get("/{transaction_id}", response_model=TransactionResponse)
def get_txn(transaction_id: str, db: Session = Depends(get_db)):
    try:
        return get_transaction(db, transaction_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
