import React, { useState } from 'react';
import {
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { Account, Transaction } from '../../types';

interface HistoryScreenProps {
  account: Account;
  allAccounts: Account[];
  transactions: Transaction[];
  onReportTransaction: (txn: Transaction) => void;
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({
  account,
  allAccounts,
  transactions,
  onReportTransaction,
}) => {
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

  const accountNameMap = new Map(allAccounts.map((a) => [a.account_id, a.account_name]));

  const filtered = transactions.filter((t) => {
    const isOutgoing = t.sender_account_id === account.account_id;
    if (direction === 'IN' && isOutgoing) return false;
    if (direction === 'OUT' && !isOutgoing) return false;

    if (dateFilter && t.created_at) {
      const txnDate = new Date(t.created_at).toISOString().slice(0, 10);
      if (txnDate !== dateFilter) return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const peerId = isOutgoing ? t.receiver_account_id : t.sender_account_id;
      const peerName = (accountNameMap.get(peerId) || '').toLowerCase();
      return (
        t.transaction_id.toLowerCase().includes(q) ||
        peerId.toLowerCase().includes(q) ||
        peerName.includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-24 space-y-4">
      <h2 className="text-lg font-bold text-[#201A32]">Transaction History</h2>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-3.5 border border-purple-100 shadow-sm space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-[#777184] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID, name, or note..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F4F0FF]/70 text-xs focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {(['ALL', 'IN', 'OUT'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  direction === d
                    ? 'bg-[#5B2EFF] text-white'
                    : 'bg-[#F4F0FF] text-[#777184]'
                }`}
              >
                {d === 'ALL' ? 'All' : d === 'IN' ? 'Incoming' : 'Outgoing'}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-2 py-1 rounded-lg border border-purple-200 text-xs text-[#777184]"
          />
        </div>
      </div>

      {/* Transaction List */}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center text-xs text-[#777184] border border-purple-100">
            No matching transactions found.
          </div>
        ) : (
          filtered.map((txn) => {
            const isOutgoing = txn.sender_account_id === account.account_id;
            const peerId = isOutgoing ? txn.receiver_account_id : txn.sender_account_id;
            const peerName = accountNameMap.get(peerId) || peerId;

            return (
              <button
                key={txn.transaction_id}
                onClick={() => setSelectedTxn(txn)}
                className="w-full bg-white rounded-2xl p-3.5 border border-purple-100 hover:border-[#5B2EFF] transition flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isOutgoing ? 'bg-red-50 text-[#DC2626]' : 'bg-green-50 text-[#16A34A]'
                    }`}
                  >
                    {isOutgoing ? (
                      <ArrowUpRight className="w-5 h-5" />
                    ) : (
                      <ArrowDownLeft className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#201A32] truncate">
                      {isOutgoing ? `To ${peerName}` : `From ${peerName}`}
                    </p>
                    <p className="text-[11px] font-mono text-[#777184]">
                      {txn.transaction_id}
                    </p>
                    <p className="text-[10px] text-[#777184]">
                      {txn.created_at ? new Date(txn.created_at).toLocaleString() : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={`text-sm font-bold ${
                      isOutgoing ? 'text-[#201A32]' : 'text-[#16A34A]'
                    }`}
                  >
                    {isOutgoing ? '-' : '+'}₹{txn.amount_rupees.toLocaleString('en-IN')}
                  </p>
                  <span className="text-[10px] font-semibold text-[#16A34A]">
                    {txn.status}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Transaction Detail Modal */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#201A32]">Transaction Details</h3>
              <button
                onClick={() => setSelectedTxn(null)}
                className="p-1 text-[#777184] hover:text-[#201A32]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#F4F0FF]/70 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#777184]">Transaction ID</span>
                <span className="font-mono font-semibold">{selectedTxn.transaction_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777184]">Amount</span>
                <span className="font-bold text-sm text-[#5B2EFF]">
                  ₹{selectedTxn.amount_rupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777184]">Sender</span>
                <span className="font-mono">{selectedTxn.sender_account_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777184]">Receiver</span>
                <span className="font-mono">{selectedTxn.receiver_account_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777184]">Status</span>
                <span className="font-semibold text-[#16A34A]">{selectedTxn.status}</span>
              </div>
              {selectedTxn.description && (
                <div className="flex justify-between">
                  <span className="text-[#777184]">Note</span>
                  <span>{selectedTxn.description}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                const txn = selectedTxn;
                setSelectedTxn(null);
                onReportTransaction(txn);
              }}
              className="w-full py-3 rounded-xl bg-red-50 hover:bg-red-100 text-[#DC2626] font-semibold text-sm flex items-center justify-center gap-2 transition"
            >
              <ShieldAlert className="w-4 h-4" /> Report a Problem / Report Fraud
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
