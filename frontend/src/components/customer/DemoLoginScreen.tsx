import React, { useState } from 'react';
import { Shield, UserPlus, LogIn, Wallet, RefreshCw, Trash2 } from 'lucide-react';
import type { Account } from '../../types';
import { api } from '../../services/api';

interface DemoLoginScreenProps {
  accounts: Account[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectAccount: (account: Account) => void;
}

export const DemoLoginScreen: React.FC<DemoLoginScreenProps> = ({
  accounts,
  loading,
  error,
  onRefresh,
  onSelectAccount,
}) => {
  const [showRegister, setShowRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [initialBalance, setInitialBalance] = useState('10000');
  const [isFraudster, setIsFraudster] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const created = await api.registerAccount({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        initial_balance_rupees: Number(initialBalance) || 0,
        account_type: isFraudster ? 'FRAUDSTER' : 'NORMAL',
      });
      onRefresh();
      onSelectAccount(created);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, accountId: string) => {
    e.stopPropagation();
    try {
      await api.deleteAccount(accountId);
      onRefresh();
    } catch {
      // ignore
    }
  };

  const handleToggleRole = async (e: React.MouseEvent, acc: Account) => {
    e.stopPropagation();
    const nextRole = acc.account_type === 'FRAUDSTER' ? 'NORMAL' : 'FRAUDSTER';
    try {
      await api.updateAccountRole(acc.account_id, nextRole);
      onRefresh();
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-orange-100 overflow-hidden">
        <div className="bg-gradient-to-br from-[#15803D] via-[#16A34A] to-[#F97316] p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">UPay — FraudTrace</h1>
              <p className="text-xs text-green-50">
                Virtual UPI Prototype • Demo Account Manager
              </p>
            </div>
          </div>
          <p className="text-xs text-white/90 mt-4 bg-black/15 rounded-xl px-3 py-2">
            Add, delete, or tag demo accounts as Normal or Fraudster. Virtual UPI PIN: 0000.
          </p>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">
              {showRegister ? 'Create Virtual Account' : 'Select Demo Account'}
            </h2>
            <button
              onClick={() => setShowRegister(!showRegister)}
              className="text-xs font-semibold text-[#16A34A] hover:underline flex items-center gap-1"
            >
              {showRegister ? (
                <>
                  <LogIn className="w-3.5 h-3.5" /> Existing Accounts
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" /> Add User
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-[#DC2626] flex items-center justify-between gap-2">
              <span>{error}</span>
              <button onClick={onRefresh} className="font-semibold underline shrink-0">
                Retry
              </button>
            </div>
          )}

          {showRegister ? (
            <form onSubmit={(e) => void handleRegister(e)} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Aarav Sharma"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-orange-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="aarav@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-orange-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Phone (Optional)
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-orange-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Opening Balance (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-orange-200 text-sm"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 bg-[#FBF8F3] p-2.5 rounded-xl border border-orange-100">
                <input
                  type="checkbox"
                  checked={isFraudster}
                  onChange={(e) => setIsFraudster(e.target.checked)}
                  className="accent-[#DC2626] w-4 h-4"
                />
                <span>Mark this user as Fraudster (Demo tag)</span>
              </label>

              {formError && (
                <p className="text-xs text-[#DC2626] font-medium">{formError}</p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-[#16A34A] hover:bg-green-700 text-white font-semibold text-sm transition disabled:opacity-50"
              >
                {submitting ? 'Creating Account...' : 'Register & Continue'}
              </button>
            </form>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {loading ? (
                <div className="py-8 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Loading accounts...
                </div>
              ) : accounts.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No accounts found. Click "Add User" above.
                </div>
              ) : (
                accounts.map((acc) => {
                  const isFraudTag = acc.account_type === 'FRAUDSTER';
                  return (
                    <div
                      key={acc.account_id}
                      onClick={() => onSelectAccount(acc)}
                      className="w-full text-left p-3 rounded-2xl border border-orange-100 hover:border-[#16A34A] hover:bg-[#FBF8F3] transition flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl font-bold flex items-center justify-center shrink-0 ${
                            isFraudTag
                              ? 'bg-red-50 text-[#DC2626]'
                              : 'bg-green-50 text-[#16A34A]'
                          }`}
                        >
                          {acc.account_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {acc.account_name}
                          </p>
                          <p className="text-[11px] text-gray-500 font-mono">
                            {acc.account_id}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="text-right mr-1">
                          <p className="text-xs font-bold text-[#16A34A] flex items-center gap-1 justify-end">
                            <Wallet className="w-3 h-3" />
                            ₹{acc.balance_rupees.toLocaleString('en-IN')}
                          </p>
                          <button
                            onClick={(e) => void handleToggleRole(e, acc)}
                            title="Toggle Normal / Fraudster demo tag"
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              isFraudTag
                                ? 'bg-red-100 text-[#DC2626]'
                                : 'bg-green-100 text-[#16A34A]'
                            }`}
                          >
                            {isFraudTag ? 'FRAUDSTER' : 'NORMAL'}
                          </button>
                        </div>
                        <button
                          onClick={(e) => void handleDelete(e, acc.account_id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-[#DC2626] hover:bg-red-50"
                          title="Delete demo user"
                          aria-label="Delete user"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
