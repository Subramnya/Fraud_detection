"""Unique identifier generators."""
import uuid


def generate_account_id() -> str:
    return f"ACC_{uuid.uuid4().hex[:8].upper()}"


def generate_transaction_id() -> str:
    return f"TXN_{uuid.uuid4().hex[:8].upper()}"


def generate_trace_id() -> str:
    return f"TRC_{uuid.uuid4().hex[:8].upper()}"


def generate_case_id() -> str:
    return f"CASE_{uuid.uuid4().hex[:6].upper()}"


def generate_alert_id() -> str:
    return f"ALERT_{uuid.uuid4().hex[:8].upper()}"


def generate_allocation_id() -> str:
    return f"ALLOC_{uuid.uuid4().hex[:10].upper()}"


def generate_entry_id() -> str:
    return f"LED_{uuid.uuid4().hex[:10].upper()}"


def generate_user_id() -> str:
    return f"USR_{uuid.uuid4().hex[:8].upper()}"


def generate_request_id() -> str:
    return f"FRZ_{uuid.uuid4().hex[:8].upper()}"


def generate_assessment_id() -> str:
    return f"RISK_{uuid.uuid4().hex[:8].upper()}"


def generate_log_id() -> str:
    return f"LOG_{uuid.uuid4().hex[:10].upper()}"


def generate_txn_alloc_id() -> str:
    return f"TXNALLOC_{uuid.uuid4().hex[:8].upper()}"
