"""Synthetic demo data generator."""
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from fraudtrace.app.core.database import SessionLocal, init_db
from fraudtrace.app.services.account_service import register_account
from fraudtrace.app.services.payment_service import process_payment


def seed_database():
    """Create synthetic accounts and transactions."""
    init_db()
    db = SessionLocal()

    try:
        # Check if already seeded
        from fraudtrace.app.models.account import Account
        if db.query(Account).count() > 0:
            print("Database already seeded. Skipping.")
            return

        print("=== Seeding FraudTrace Database ===")
        print()

        # Create accounts with initial balances
        accounts = {}

        # Victim account
        result = register_account(db, "Ravi Kumar (Victim)", "ravi@example.com",
                                  "9876543210", 50000.0, "NORMAL")
        accounts["victim"] = result["account_id"]
        print(f"Created Victim: {result['account_id']} - Balance: ₹50,000")

        # Fraudster account (Account A)
        result = register_account(db, "Amit Shah (Account A)", "amit@example.com",
                                  "9876543211", 5000.0, "NORMAL")
        accounts["A"] = result["account_id"]
        print(f"Created Account A: {result['account_id']} - Balance: ₹5,000")

        # Intermediary accounts
        result = register_account(db, "Priya Patel (Account B)", "priya@example.com",
                                  "9876543212", 3000.0, "NORMAL")
        accounts["B"] = result["account_id"]
        print(f"Created Account B: {result['account_id']} - Balance: ₹3,000")

        result = register_account(db, "Suresh Verma (Account C)", "suresh@example.com",
                                  "9876543213", 2000.0, "NORMAL")
        accounts["C"] = result["account_id"]
        print(f"Created Account C: {result['account_id']} - Balance: ₹2,000")

        result = register_account(db, "Deepak Gupta (Account D)", "deepak@example.com",
                                  "9876543214", 1000.0, "NORMAL")
        accounts["D"] = result["account_id"]
        print(f"Created Account D: {result['account_id']} - Balance: ₹1,000")

        result = register_account(db, "Neha Sharma (Account E)", "neha@example.com",
                                  "9876543215", 500.0, "NORMAL")
        accounts["E"] = result["account_id"]
        print(f"Created Account E: {result['account_id']} - Balance: ₹500")

        result = register_account(db, "Vikram Singh (Account F)", "vikram@example.com",
                                  "9876543216", 1500.0, "NORMAL")
        accounts["F"] = result["account_id"]
        print(f"Created Account F: {result['account_id']} - Balance: ₹1,500")

        # Additional accounts for mixed-balance scenario
        result = register_account(db, "Anjali Mehta (Legitimate)", "anjali@example.com",
                                  "9876543217", 20000.0, "NORMAL")
        accounts["legitimate"] = result["account_id"]
        print(f"Created Legitimate: {result['account_id']} - Balance: ₹20,000")

        result = register_account(db, "Rajesh Nair (Mixed)", "rajesh@example.com",
                                  "9876543218", 8000.0, "NORMAL")
        accounts["mixed"] = result["account_id"]
        print(f"Created Mixed: {result['account_id']} - Balance: ₹8,000")

        # Unauthorized debit scenario account
        result = register_account(db, "Kavita Reddy (Compromised)", "kavita@example.com",
                                  "9876543219", 30000.0, "NORMAL")
        accounts["compromised"] = result["account_id"]
        print(f"Created Compromised: {result['account_id']} - Balance: ₹30,000")

        result = register_account(db, "Unknown Attacker", "attacker@example.com",
                                  "9876543220", 0.0, "SIMULATION")
        accounts["attacker"] = result["account_id"]
        print(f"Created Attacker: {result['account_id']} - Balance: ₹0")

        print()
        print("=== Processing Fraud Scenario Transactions ===")
        print()

        # Normal background transactions first
        print("--- Normal transactions ---")
        result = process_payment(db, accounts["legitimate"], accounts["mixed"],
                                 5000.0, "Normal business payment")
        print(f"Legitimate -> Mixed: ₹5,000 ({result['transaction_id']})")

        # FRAUD SCENARIO: Victim sends ₹10,000 to Account A (deceived payment)
        print()
        print("--- Fraud scenario: Victim -> A -> B/C -> D/E/F ---")
        result = process_payment(db, accounts["victim"], accounts["A"],
                                 10000.0, "Payment for online purchase (FRAUD)")
        fraud_txn_id = result["transaction_id"]
        print(f"Victim -> A: ₹10,000 ({fraud_txn_id}) [THIS IS THE FRAUD TXN]")

        # Account A splits the money
        result = process_payment(db, accounts["A"], accounts["B"],
                                 6000.0, "Transfer to associate B")
        print(f"A -> B: ₹6,000 ({result['transaction_id']})")

        result = process_payment(db, accounts["A"], accounts["C"],
                                 4000.0, "Transfer to associate C")
        print(f"A -> C: ₹4,000 ({result['transaction_id']})")

        # Account B distributes further
        result = process_payment(db, accounts["B"], accounts["D"],
                                 3000.0, "Transfer to D")
        print(f"B -> D: ₹3,000 ({result['transaction_id']})")

        result = process_payment(db, accounts["B"], accounts["E"],
                                 2000.0, "Transfer to E")
        print(f"B -> E: ₹2,000 ({result['transaction_id']})")
        # B retains ₹1,000 of fraud money + ₹3,000 legitimate

        # Account C sends to F
        result = process_payment(db, accounts["C"], accounts["F"],
                                 2500.0, "Transfer to F")
        print(f"C -> F: ₹2,500 ({result['transaction_id']})")
        # C retains ₹1,500 of fraud money + ₹2,000 legitimate

        print()
        print("--- Mixed balance scenario ---")
        # Mixed account receives from both legitimate AND fraud-related source
        result = process_payment(db, accounts["B"], accounts["mixed"],
                                 1000.0, "Payment from B to mixed")
        print(f"B -> Mixed: ₹1,000 ({result['transaction_id']})")
        # Mixed now has: ₹8,000 initial + ₹5,000 from legitimate + ₹1,000 from B (some traced)

        # Mixed sends some money onward
        result = process_payment(db, accounts["mixed"], accounts["D"],
                                 3000.0, "Payment from mixed to D")
        print(f"Mixed -> D: ₹3,000 ({result['transaction_id']})")

        print()
        print("--- Unauthorized debit scenario ---")
        # Simulated unauthorized transaction
        result = process_payment(db, accounts["compromised"], accounts["attacker"],
                                 15000.0, "Unauthorized transfer")
        unauth_txn_id = result["transaction_id"]
        print(f"Compromised -> Attacker: ₹15,000 ({unauth_txn_id}) [UNAUTHORIZED]")

        # Attacker moves money quickly
        result = process_payment(db, accounts["attacker"], accounts["F"],
                                 10000.0, "Quick laundering")
        print(f"Attacker -> F: ₹10,000 ({result['transaction_id']})")

        print()
        print("=== Seed Data Summary ===")
        print(f"Total accounts created: {len(accounts)}")
        print(f"Fraud transaction ID: {fraud_txn_id}")
        print(f"Unauthorized transaction ID: {unauth_txn_id}")
        print()
        print("Account IDs:")
        for label, acc_id in accounts.items():
            print(f"  {label}: {acc_id}")

        # Store IDs for the demo script
        return {
            "accounts": accounts,
            "fraud_txn_id": fraud_txn_id,
            "unauth_txn_id": unauth_txn_id,
        }

    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
