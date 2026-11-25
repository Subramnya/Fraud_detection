import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  QrCode,
  Send,
  ArrowDownLeft,
  Wallet,
  Plus,
  Search,
  ArrowUpRight,
  ShieldCheck,
  HelpCircle,
  Clock,
  ChevronRight,
} from 'lucide-react';
import type { Account, CustomerTab, Transaction } from '../../types';
import { api } from '../../services/api';

interface HomeScreenProps {
  account: Account;
  allAccounts: Account[];
  transactions: Transaction[];
  onNavigate: (tab: CustomerTab) => void;
  onSelectRecipient: (acc: Account) => void;
  onBalanceUpdated: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, msg: string) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  account,
  allAccounts,
  transactions,
  onNavigate,
  onSelectRecipient,
  onBalanceUpdated,
  onNotify,
}) => {
  const [showBalance, setShowBalance] = useState(true);
  const [contactQuery, setContactQuery] = useState('');
  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState('2000');
  const [topupLoading, setTopupLoading] = useState(false);

  const otherAccounts = allAccounts.filter(
    (a) => a.account_id !== account.account_id && a.is_active
  );

  const filteredContacts = otherAccounts.filter(
    (a) =>
      a.account_name.toLowerCase().includes(contactQuery.toLowerCase()) ||
      a.account_id.toLowerCase().includes(contactQuery.toLowerCase())
  );

  const accountNameMap = new Map(allAccounts.map((a) => [a.account_id, a.account_name]));

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(topupAmount);
    if (!amt || amt <= 0) return;
    setTopupLoading(true);
    try {
      await api.topupVirtualMoney(account.account_id, amt);
      onBalanceUpdated();
      onNotify(
        'success',
        'Virtual Money Added',
        `₹${amt.toLocaleString('en-IN')} simulated funds added to ${account.account_id}.`
      );
      setShowTopup(false);
    } catch (err) {
      onNotify('error', 'Top-up Failed', err instanceof Error ? err.message : 'Error');
    } finally {
      setTopupLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-24 space-y-5">
      {/* Wallet Balance Card */}
      <div className="rounded-3xl bg-gradient-to-br from-[#351080] via-[#5B2EFF] to-[#7B4DFF] p-5 text-white shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-purple-200 font-medium">Virtual Wallet Balance</p>
            <div className="flex items-center gap-2.5 mt-1">
              <span className="text-2xl font-bold tracking-tight">
                {showBalance
                  ? `₹${account.balance_rupees.toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}`
                  : '₹ ••••••'}
              </span>
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition"
                aria-label={showBalance ? 'Hide balance' : 'Show balance'}
              >
                {showBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-white/15 text-[11px] font-semibold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
            {account.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-purple-200">Account ID</p>
            <p className="text-xs font-mono font-semibold">{account.account_id}</p>
          </div>
          <button
            onClick={() => setShowTopup(!showTopup)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white text-[#351080] text-xs font-bold hover:bg-purple-50 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add Money
          </button>
        </div>

        {showTopup && (
          <form onSubmit={handleTopup} className="mt-3 pt-3 border-t border-white/15 flex gap-2">
            <input
              type="number"
              min="1"
              max="1000000"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-xl bg-white/15 text-white placeholder-purple-200 text-xs focus:outline-none"
              placeholder="Amount in ₹"
            />
            <button
              type="submit"
              disabled={topupLoading}
              className="px-3 py-1.5 rounded-xl bg-[#16A34A] text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {topupLoading ? 'Adding...' : 'Add (Sim)'}
            </button>
          </form>
        )}
      </div>

      {/* Quick Payment Actions */}
      <div className="bg-white rounded-3xl p-4 shadow-sm border border-purple-100">
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => onNavigate('scan')}
            className="flex flex-col items-center gap-2 p-2.5 rounded-2xl bg-[#F4F0FF] hover:bg-purple-100 transition"
          >
            <div className="w-11 h-11 rounded-2xl bg-[#5B2EFF] text-white flex items-center justify-center shadow-md">
              <QrCode className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold text-[#351080] text-center leading-tight">
              Scan & Pay
            </span>
          </button>

          <button
            onClick={() => onNavigate('send')}
            className="flex flex-col items-center gap-2 p-2.5 rounded-2xl hover:bg-[#F4F0FF] transition"
          >
            <div className="w-11 h-11 rounded-2xl bg-purple-100 text-[#5B2EFF] flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-[#201A32] text-center leading-tight">
              Send Money
            </span>
          </button>

          <button
            onClick={() => onNavigate('receive')}
            className="flex flex-col items-center gap-2 p-2.5 rounded-2xl hover:bg-[#F4F0FF] transition"
          >
            <div className="w-11 h-11 rounded-2xl bg-purple-100 text-[#5B2EFF] flex items-center justify-center">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-[#201A32] text-center leading-tight">
              Receive
            </span>
          </button>

          <button
            onClick={() => {
              onBalanceUpdated();
              setShowBalance(true);
              onNotify(
                'info',
                'Balance Refreshed',
                `Available balance: ₹${account.balance_rupees.toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                })}`
              );
            }}
            className="flex flex-col items-center gap-2 p-2.5 rounded-2xl hover:bg-[#F4F0FF] transition"
          >
            <div className="w-11 h-11 rounded-2xl bg-purple-100 text-[#5B2EFF] flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-[#201A32] text-center leading-tight">
              Balance
            </span>
          </button>
        </div>
      </div>

      {/* People / Contacts */}
      <div className="bg-white rounded-3xl p-4 shadow-sm border border-purple-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[#201A32]">People & Contacts</h3>
          <span className="text-[11px] text-[#777184]">{otherAccounts.length} available</span>
        </div>

        <div className="relative mb-3">
          <Search className="w-4 h-4 text-[#777184] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={contactQuery}
            onChange={(e) => setContactQuery(e.target.value)}
            placeholder="Search contact or Account ID..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F4F0FF]/70 text-xs focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
          />
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1">
          {filteredContacts.slice(0, 8).map((c) => (
            <button
              key={c.account_id}
              onClick={() => onSelectRecipient(c)}
              className="flex flex-col items-center gap-1.5 min-w-[64px] group"
            >
              <div className="w-11 h-11 rounded-full bg-[#F4F0FF] group-hover:bg-[#5B2EFF] group-hover:text-white text-[#5B2EFF] font-bold text-sm flex items-center justify-center transition">
                {c.account_name.charAt(0).toUpperCase()}
              </div>
              <span className="text-[11px] font-medium text-[#201A32] truncate max-w-[64px]">
                {c.account_name.split(' ')[0]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-3xl p-4 shadow-sm border border-purple-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[#201A32]">Recent Transactions</h3>
          <button
            onClick={() => onNavigate('history')}
            className="text-xs font-semibold text-[#5B2EFF] flex items-center gap-0.5"
          >
            View All <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {transactions.length === 0 ? (
          <p className="text-xs text-[#777184] py-4 text-center">
            No transactions yet. Tap Scan & Pay or Send Money to get started.
          </p>
        ) : (
          <div className="space-y-2.5">
            {transactions.slice(0, 4).map((txn) => {
              const isOutgoing = txn.sender_account_id === account.account_id;
              const peerId = isOutgoing ? txn.receiver_account_id : txn.sender_account_id;
              const peerName = accountNameMap.get(peerId) || peerId;

              return (
                <button
                  key={txn.transaction_id}
                  onClick={() => onNavigate('history')}
                  className="w-full flex items-center justify-between p-2.5 rounded-2xl hover:bg-[#F4F0FF]/60 transition text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isOutgoing
                          ? 'bg-red-50 text-[#DC2626]'
                          : 'bg-green-50 text-[#16A34A]'
                      }`}
                    >
                      {isOutgoing ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : (
                        <ArrowDownLeft className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#201A32] truncate">
                        {isOutgoing ? `To ${peerName}` : `From ${peerName}`}
                      </p>
                      <p className="text-[11px] text-[#777184]">
                        {txn.created_at
                          ? new Date(txn.created_at).toLocaleString()
                          : txn.transaction_id}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-xs font-bold ${
                        isOutgoing ? 'text-[#201A32]' : 'text-[#16A34A]'
                      }`}
                    >
                      {isOutgoing ? '-' : '+'}₹{txn.amount_rupees.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[10px] text-[#16A34A] font-medium">{txn.status}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Services & Security */}
      <div className="grid grid-cols-3 gap-2.5">
        <button
          onClick={() => onNavigate('history')}
          className="bg-white p-3 rounded-2xl border border-purple-100 flex flex-col items-center gap-1.5 hover:border-[#5B2EFF] transition"
        >
          <Clock className="w-5 h-5 text-[#5B2EFF]" />
          <span className="text-[11px] font-semibold text-[#201A32]">History</span>
        </button>
        <button
          onClick={() => onNavigate('profile')}
          className="bg-white p-3 rounded-2xl border border-purple-100 flex flex-col items-center gap-1.5 hover:border-[#5B2EFF] transition"
        >
          <ShieldCheck className="w-5 h-5 text-[#5B2EFF]" />
          <span className="text-[11px] font-semibold text-[#201A32]">Security</span>
        </button>
        <button
          onClick={() => onNavigate('report')}
          className="bg-white p-3 rounded-2xl border border-purple-100 flex flex-col items-center gap-1.5 hover:border-[#DC2626] transition"
        >
          <HelpCircle className="w-5 h-5 text-[#DC2626]" />
          <span className="text-[11px] font-semibold text-[#201A32]">Report Fraud</span>
        </button>
      </div>
    </div>
  );
};
