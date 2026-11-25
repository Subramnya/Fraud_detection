"""Transaction and LedgerEntry models."""
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, func, Index, Text
from sqlalchemy.orm import relationship
from fraudtrace.app.core.database import Base


class Transaction(Base):
    __tablename__ = "transactions"
    transaction_id = Column(String, primary_key=True, index=True)
    sender_account_id = Column(String, ForeignKey("accounts.account_id"), nullable=False, index=True)
    receiver_account_id = Column(String, ForeignKey("accounts.account_id"), nullable=False, index=True)
    amount_paise = Column(Integer, nullable=False)
    status = Column(String, default="COMPLETED")
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    sender = relationship("Account", foreign_keys=[sender_account_id], backref="sent_transactions")
    receiver = relationship("Account", foreign_keys=[receiver_account_id], backref="received_transactions")
    __table_args__ = (
        Index("idx_txn_sender", "sender_account_id"),
        Index("idx_txn_receiver", "receiver_account_id"),
        Index("idx_txn_created", "created_at"),
    )


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    entry_id = Column(String, primary_key=True, index=True)
    transaction_id = Column(String, ForeignKey("transactions.transaction_id"), nullable=False, index=True)
    account_id = Column(String, ForeignKey("accounts.account_id"), nullable=False, index=True)
    entry_type = Column(String, nullable=False)
    amount_paise = Column(Integer, nullable=False)
    balance_after_paise = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    transaction = relationship("Transaction", backref="ledger_entries")
    account = relationship("Account", backref="ledger_entries")
