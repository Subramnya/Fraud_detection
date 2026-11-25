"""Complete demo script: seed data, report fraud, trace money, generate reports."""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fraudtrace.app.core.database import init_db, SessionLocal
from fraudtrace.app.simulation.seed_data import seed_database
from fraudtrace.app.simulation.fraud_scenarios import (
    run_fraud_report_scenario, run_unauthorized_debit_scenario,
)
from fraudtrace.app.services.risk_service import assess_account_risk
from fraudtrace.app.services.prioritization_service import (
    calculate_investigation_priority, calculate_freeze_priority,
)
from fraudtrace.app.services.freeze_service import create_freeze_request, review_freeze_request
from fraudtrace.app.services.report_service import generate_investigation_report
from fraudtrace.app.services.graph_service import get_graph_for_case
from fraudtrace.app.utils.helpers import paise_to_rupees


def run_complete_demo():
    print("=" * 70)
    print("  FRAUDTRACE - Complete Demo")
    print("  Graph-Based Fraud Detection & Transaction Lineage Analysis")
    print("  ⚠️  SYNTHETIC PROTOTYPE - Not connected to real payment systems")
    print("=" * 70)
    print()

    # Step 1: Seed database
    print("STEP 1: Seeding database...")
    print("-" * 40)
    seed_result = seed_database()
    if not seed_result:
        print("Database was already seeded. Using existing data.")
        # Try to find existing data
        db = SessionLocal()
        from fraudtrace.app.models.account import Account
        from fraudtrace.app.models.transaction import Transaction
        accounts_list = db.query(Account).all()
        txns = db.query(Transaction).all()
        print(f"Found {len(accounts_list)} accounts, {len(txns)} transactions")
        db.close()
        return

    accounts = seed_result["accounts"]
    fraud_txn_id = seed_result["fraud_txn_id"]
    unauth_txn_id = seed_result["unauth_txn_id"]

    print()
    print()

    # Step 2: Report fraud (after money has already moved!)
    print("STEP 2: Reporting fraud (delayed report - money has already moved)")
    print("-" * 40)
    fraud_result = run_fraud_report_scenario(fraud_txn_id, accounts["victim"])

    print()
    print()

    # Step 3: Report unauthorized debit
    print("STEP 3: Reporting unauthorized debit")
    print("-" * 40)
    unauth_result = run_unauthorized_debit_scenario(unauth_txn_id, accounts["compromised"])

    print()
    print()

    # Step 4: Risk assessments
    print("STEP 4: Running risk assessments")
    print("-" * 40)
    db = SessionLocal()
    try:
        for label, acc_id in accounts.items():
            risk = assess_account_risk(db, acc_id)
            print(f"  {label} ({acc_id}): Score={risk['overall_score']:.4f} Category={risk['risk_category']}")
    finally:
        db.close()

    print()
    print()

    # Step 5: Investigation priorities
    if fraud_result:
        print("STEP 5: Investigation priorities")
        print("-" * 40)
        db = SessionLocal()
        try:
            priorities = calculate_investigation_priority(db, fraud_result["case_id"])
            for p in priorities:
                print(f"  {p['account_id']}: Priority={p['priority_score']:.4f} "
                      f"Traceable=₹{p['traceable_balance_rupees']:,.2f} "
                      f"Available=₹{p['available_balance_rupees']:,.2f}")
        finally:
            db.close()

        print()
        print()

        # Step 6: Freeze requests
        print("STEP 6: Creating freeze requests")
        print("-" * 40)
        db = SessionLocal()
        try:
            freeze_prios = calculate_freeze_priority(db, fraud_result["case_id"])
            freeze_requests = []
            for fp in freeze_prios:
                fr = create_freeze_request(
                    db, fraud_result["case_id"], fp["account_id"],
                    fp["trace_id"], "Automated freeze recommendation based on traced funds"
                )
                print(f"  Created freeze request {fr['request_id']} for {fp['account_id']}: "
                      f"₹{fr['suggested_amount_rupees']:,.2f} ({fr['status']})")
                freeze_requests.append(fr)

            # Approve first freeze request
            if freeze_requests:
                approved = review_freeze_request(
                    db, freeze_requests[0]["request_id"],
                    "APPROVED_SIMULATED", "Admin_Demo",
                    "Approved based on traced fund evidence"
                )
                print(f"\n  Approved freeze request {approved['request_id']}: {approved['status']}")

                # Reject one if there are multiple
                if len(freeze_requests) > 1:
                    rejected = review_freeze_request(
                        db, freeze_requests[-1]["request_id"],
                        "REJECTED", "Admin_Demo",
                        "Insufficient evidence for this account"
                    )
                    print(f"  Rejected freeze request {rejected['request_id']}: {rejected['status']}")
        finally:
            db.close()

        print()
        print()

        # Step 7: Generate investigation report
        print("STEP 7: Generating investigation report")
        print("-" * 40)
        db = SessionLocal()
        try:
            report = generate_investigation_report(db, fraud_result["case_id"])
            print(f"  Case ID: {report['case_id']}")
            print(f"  Status: {report['status']}")
            print(f"  Fraud Category: {report['fraud_category']}")
            print(f"  Reported Amount: ₹{report['reported_amount_rupees']:,.2f}")
            print(f"  Trace ID: {report['trace_id']}")
            print(f"  Connected Accounts: {len(report['connected_accounts'])}")
            print(f"  Transaction Paths: {len(report['multi_hop_paths'])}")
            print(f"  Traceable Accounts: {len(report['traceable_amounts'])}")

            # Save report to file
            report_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                "data", f"report_{fraud_result['case_id']}.json"
            )
            os.makedirs(os.path.dirname(report_path), exist_ok=True)
            with open(report_path, "w") as f:
                json.dump(report, f, indent=2, default=str)
            print(f"\n  Report saved to: {report_path}")
        finally:
            db.close()

        # Step 8: Graph data
        print()
        print()
        print("STEP 8: Graph analysis")
        print("-" * 40)
        db = SessionLocal()
        try:
            graph_data = get_graph_for_case(db, fraud_result["case_id"])
            print(f"  Graph nodes: {len(graph_data.get('nodes', []))}")
            print(f"  Graph edges: {len(graph_data.get('edges', []))}")

            graph_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                "data", f"graph_{fraud_result['case_id']}.json"
            )
            with open(graph_path, "w") as f:
                json.dump(graph_data, f, indent=2, default=str)
            print(f"  Graph saved to: {graph_path}")
        finally:
            db.close()

    print()
    print("=" * 70)
    print("  DEMO COMPLETE")
    print("=" * 70)
    print()
    print("To interact with the API, start the server:")
    print("  cd d:\\ait hackathon\\Fraud_detection")
    print("  python -m uvicorn fraudtrace.app.main:app --reload --port 8000")
    print()
    print("Then open: http://localhost:8000/docs")
    print()


if __name__ == "__main__":
    run_complete_demo()
