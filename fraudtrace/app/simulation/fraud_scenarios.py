"""Pre-built fraud scenarios for testing and demonstration."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from fraudtrace.app.core.database import SessionLocal
from fraudtrace.app.models.account import Account
from fraudtrace.app.models.transaction import Transaction
from fraudtrace.app.services.lineage_service import activate_trace, get_trace_summary
from fraudtrace.app.models.fraud_case import FraudCase
from fraudtrace.app.models.allocation import TraceOrigin
from fraudtrace.app.utils.identifiers import generate_case_id
from fraudtrace.app.utils.helpers import paise_to_rupees
import json


def run_fraud_report_scenario(fraud_txn_id: str, reporting_account_id: str):
    """Report the fraud transaction and activate tracing."""
    db = SessionLocal()
    try:
        txn = db.query(Transaction).filter(
            Transaction.transaction_id == fraud_txn_id
        ).first()
        if not txn:
            print(f"Transaction {fraud_txn_id} not found!")
            return None

        # Create fraud case
        case_id = generate_case_id()
        case = FraudCase(
            case_id=case_id,
            reporting_account_id=reporting_account_id,
            reported_transaction_id=fraud_txn_id,
            fraud_category="PAYMENT_FRAUD",
            reported_amount_paise=txn.amount_paise,
            description="Victim was deceived into paying for a fake online purchase",
            status="UNDER_INVESTIGATION",
        )
        db.add(case)
        db.commit()

        print(f"Created fraud case: {case_id}")

        # Activate trace
        trace_id = activate_trace(db, case_id, fraud_txn_id, txn.amount_paise)
        db.commit()
        print(f"Activated trace: {trace_id}")

        # Get trace summary
        summary = get_trace_summary(db, trace_id)
        print(f"\n=== Trace Summary ===")
        print(f"Original amount: ₹{summary['original_amount_rupees']:,.2f}")
        print(f"Total traceable remaining: ₹{summary['total_traceable_remaining_rupees']:,.2f}")
        print(f"Hop count: {summary['hop_count']}")
        print(f"\nAccounts holding traced funds:")
        for acc in summary["accounts_holding_funds"]:
            print(f"  {acc['account_id']}: ₹{acc['traceable_balance_rupees']:,.2f}")

        return {
            "case_id": case_id,
            "trace_id": trace_id,
            "summary": summary,
        }

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


def run_unauthorized_debit_scenario(unauth_txn_id: str, reporting_account_id: str):
    """Report an unauthorized debit and trace the funds."""
    db = SessionLocal()
    try:
        txn = db.query(Transaction).filter(
            Transaction.transaction_id == unauth_txn_id
        ).first()
        if not txn:
            print(f"Transaction {unauth_txn_id} not found!")
            return None

        case_id = generate_case_id()
        case = FraudCase(
            case_id=case_id,
            reporting_account_id=reporting_account_id,
            reported_transaction_id=unauth_txn_id,
            fraud_category="UNAUTHORIZED_DEBIT",
            reported_amount_paise=txn.amount_paise,
            description="Transaction initiated without account holder authorization",
            status="UNDER_INVESTIGATION",
            device_info=json.dumps({
                "device_id": "UNKNOWN_DEVICE_X92",
                "ip_address": "192.168.1.100",
                "user_agent": "FakeApp/1.0",
                "location": "Different City",
                "session_anomaly": True,
            }),
        )
        db.add(case)
        db.commit()

        print(f"Created unauthorized debit case: {case_id}")

        trace_id = activate_trace(db, case_id, unauth_txn_id, txn.amount_paise)
        db.commit()
        print(f"Activated trace: {trace_id}")

        summary = get_trace_summary(db, trace_id)
        print(f"\n=== Unauthorized Debit Trace ===")
        print(f"Original amount: ₹{summary['original_amount_rupees']:,.2f}")
        print(f"Total traceable remaining: ₹{summary['total_traceable_remaining_rupees']:,.2f}")
        print(f"Accounts holding traced funds:")
        for acc in summary["accounts_holding_funds"]:
            print(f"  {acc['account_id']}: ₹{acc['traceable_balance_rupees']:,.2f}")

        return {
            "case_id": case_id,
            "trace_id": trace_id,
            "summary": summary,
        }

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()
