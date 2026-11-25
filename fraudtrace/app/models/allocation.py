"""Fund allocation models - the heart of money tracing."""
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, func, Index, Boolean
from sqlalchemy.orm import relationship
from fraudtrace.app.core.database import Base


class FundAllocation(Base):
    __tablename__ = "fund_allocations"
    allocation_id = Column(String, primary_key=True, index=True)
    account_id = Column(String, ForeignKey("accounts.account_id"), nullable=False, index=True)
    origin_transaction_id = Column(String, nullable=False, index=True)
    trace_id = Column(String, nullable=True, index=True)
    amount_paise = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=True)
    parent_allocation_id = Column(String, ForeignKey("fund_allocations.allocation_id"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    account = relationship("Account", backref="fund_allocations")
    parent_allocation = relationship("FundAllocation", remote_side=[allocation_id], backref="child_allocations")
    __table_args__ = (
        Index("idx_alloc_account_active", "account_id", "is_active"),
        Index("idx_alloc_trace", "trace_id"),
        Index("idx_alloc_origin", "origin_transaction_id"),
        Index("idx_alloc_parent", "parent_allocation_id"),
    )


class TransactionAllocation(Base):
    __tablename__ = "transaction_allocations"
    id = Column(String, primary_key=True, index=True)
    transaction_id = Column(String, ForeignKey("transactions.transaction_id"), nullable=False, index=True)
    source_allocation_id = Column(String, ForeignKey("fund_allocations.allocation_id"), nullable=False, index=True)
    destination_allocation_id = Column(String, ForeignKey("fund_allocations.allocation_id"), nullable=False, index=True)
    amount_paise = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    transaction = relationship("Transaction", backref="transaction_allocations")
    source_allocation = relationship("FundAllocation", foreign_keys=[source_allocation_id])
    destination_allocation = relationship("FundAllocation", foreign_keys=[destination_allocation_id])
    __table_args__ = (Index("idx_txnalloc_txn", "transaction_id"),)


class TraceOrigin(Base):
    __tablename__ = "trace_origins"
    trace_id = Column(String, primary_key=True, index=True)
    case_id = Column(String, ForeignKey("fraud_cases.case_id"), nullable=False, index=True)
    origin_transaction_id = Column(String, ForeignKey("transactions.transaction_id"), nullable=False)
    traced_amount_paise = Column(Integer, nullable=False)
    activated_at = Column(DateTime, server_default=func.now())
    origin_transaction = relationship("Transaction")
