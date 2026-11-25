"""Helper utilities."""
from datetime import datetime, timezone


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def paise_to_rupees(paise: int) -> float:
    return round(paise / 100.0, 2)


def rupees_to_paise(rupees: float) -> int:
    return int(round(rupees * 100))


def format_currency(paise: int) -> str:
    return f"₹{paise / 100:,.2f}"
