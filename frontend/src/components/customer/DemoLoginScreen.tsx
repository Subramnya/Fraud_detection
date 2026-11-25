import React, { useState } from 'react';
import { Shield, UserPlus, LogIn, Wallet, RefreshCw } from 'lucide-react';
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
      });
      onRefresh();
      onSelectAccount(created);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-purple-100 overflow-hidden">
        <div className="bg-gradient-to-br from-[#351080] via-[#5B2EFF] to-[#7B4DFF] p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">FraudTrace Pay</h1>
              <p className="text-xs text-purple-100">
                Virtual UPI Prototype • Development Access
              </p>
            </div>
          </div>
          <p className="text-xs text-purple-100 mt-4 bg-white/10 rounded-xl px-3 py-2">
            Simulated environment only. Not connected to real UPI or bank accounts.
          </p>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#201A32]">
              {showRegister ? 'Create Virtual Account' : 'Select Demo Account'}
            </h2>
            <button
              onClick={() => setShowRegister(!showRegister)}
              className="text-xs font-semibold text-[#5B2EFF] hover:underline flex items-center gap-1"
            >
              {showRegister ? (
                <>
                  <LogIn className="w-3.5 h-3.5" /> Existing Accounts
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" /> New Account
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
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#777184] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Aarav Sharma"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-purple-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#777184] mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="aarav@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-purple-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#777184] mb-1">
                    Phone (Optional)
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-purple-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#777184] mb-1">
                    Opening Balance (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-purple-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
                  />
                </div>
              </div>
              {formError && (
                <p className="text-xs text-[#DC2626] font-medium">{formError}</p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-[#5B2EFF] hover:bg-[#351080] text-white font-semibold text-sm transition disabled:opacity-50"
              >
                {submitting ? 'Creating Account...' : 'Register & Continue'}
              </button>
            </form>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {loading ? (
                <div className="py-8 text-center text-sm text-[#777184] flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Loading accounts...
                </div>
              ) : accounts.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#777184]">
                  No accounts found. Create a new virtual account above.
                </div>
              ) : (
                accounts.map((acc) => (
                  <button
                    key={acc.account_id}
                    onClick={() => onSelectAccount(acc)}
                    className="w-full text-left p-3.5 rounded-2xl border border-purple-100 hover:border-[#5B2EFF] hover:bg-[#F4F0FF]/60 transition flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#F4F0FF] text-[#5B2EFF] font-bold flex items-center justify-center shrink-0">
                        {acc.account_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#201A32] truncate">
                          {acc.account_name}
                        </p>
                        <p className="text-xs text-[#777184] font-mono">
                          {acc.account_id}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[#351080] flex items-center gap-1 justify-end">
                        <Wallet className="w-3.5 h-3.5" />
                        ₹{acc.balance_rupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-[#16A34A]">
                        {acc.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
