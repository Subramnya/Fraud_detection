"""Clear existing database and seed clean normal users + F1..F50 fraudster partners."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fraudtrace.app.core.database import SessionLocal, init_db
from fraudtrace.app.services.account_service import register_account
from fraudtrace.app.simulation.sam_simulation import ensure_sam_account
from fraudtrace.app.api.fraudster import ensure_fraudster_partners
from fraudtrace.app.models.cybercell_report import CyberCellReport


def reset_and_seed():
    for fname in ("data/fraudtrace.db", "data/fraudtrace.db-wal", "data/fraudtrace.db-shm"):
        if os.path.exists(fname):
            os.remove(fname)

    init_db()
    db = SessionLocal()
    try:
        ravi = register_account(db, "Ravi Kumar", "ravi@upay.demo", "9876543210", 50000.0, "NORMAL")
        priya = register_account(db, "Priya Patel", "priya@upay.demo", "9876543211", 30000.0, "NORMAL")
        anjali = register_account(db, "Anjali Mehta", "anjali@upay.demo", "9876543212", 25000.0, "NORMAL")
        sam = ensure_sam_account(db, initial_balance_rupees=25000.0)
        partners = ensure_fraudster_partners(db)

        # Seed a few sample Cyber Cell reference records
        samples = [
            CyberCellReport(
                report_id="CYB_DEMO_001",
                account_id=ravi["account_id"],
                submitted_by="System Archive",
                fraud_type="PHISHING_LINK",
                summary="Historical reference case: phishing link velocity pattern.",
                status="RESOLVED",
            ),
            CyberCellReport(
                report_id="CYB_DEMO_002",
                account_id=priya["account_id"],
                submitted_by="System Archive",
                fraud_type="MULE_FAN_OUT",
                summary="Historical reference case: multi-account sign-out fan-out.",
                status="INVESTIGATING",
            ),
        ]
        for s in samples:
            db.add(s)
        db.commit()

        print(f"Seeded clean DB: Ravi={ravi['account_id']}, Priya={priya['account_id']}, "
              f"Anjali={anjali['account_id']}, Sam={sam['account_id']}, Partners=F1..F{len(partners)}")
    finally:
        db.close()


if __name__ == "__main__":
    reset_and_seed()
