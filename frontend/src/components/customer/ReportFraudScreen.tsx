import React, { useState } from 'react';
import { ArrowLeft, ShieldAlert, CheckCircle2 } from 'lucide-react';
import type { Account, FraudCase, Transaction } from '../../types';
import { api } from '../../services/api';

interface ReportFraudScreenProps {
  account: Account;
  transactions: Transaction[];
  initialTransaction?: Transaction | null;
  onBack: () => void;
  onCaseCreated: () => void;
}

export const ReportFraudScreen: React.FC<ReportFraudScreenProps> = ({
  account,
  transactions,
  initialTransaction,
  onBack,
  onCaseCreated,
}) => {
  const [selectedTxnId, setSelectedTxnId] = useState(
    initialTransaction?.transaction_id || transactions[0]?.transaction_id || ''
  );
  const [category, setCategory] = useState<'PAYMENT_FRAUD' | 'UNAUTHORIZED_DEBIT'>(
    'PAYMENT_FRAUD'
  );
  const [description, setDescription] = useState('');
  const [deviceInfo, setDeviceInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCase, setCreatedCase] = useState<FraudCase | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTxnId) {
      setError('Please select a transaction to report.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.reportFraud({
        reporting_account_id: account.account_id,
        transaction_id: selectedTxnId,
        fraud_category: category,
        description: description.trim() || undefined,
        device_info:
          category === 'UNAUTHORIZED_DEBIT' && deviceInfo.trim()
            ? deviceInfo.trim()
            : undefined,
      });
      setCreatedCase(res);
      onCaseCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit fraud report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-24 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-xl bg-white border border-purple-100 text-[#201A32]"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-[#201A32]">Report Fraud</h2>
          <p className="text-xs text-[#777184]">Submit a transaction for investigation</p>
        </div>
      </div>

      {createdCase ? (
        <div className="bg-white rounded-3xl p-6 border border-purple-100 shadow-lg text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-green-50 text-[#16A34A] flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#201A32]">Investigation Registered</h3>
            <p className="text-xs text-[#777184] mt-1">
              Your report has been logged and money lineage tracing has been activated.
            </p>
          </div>
          <div className="bg-[#F4F0FF]/70 rounded-2xl p-4 text-left space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[#777184]">Case ID</span>
              <span className="font-mono font-bold text-[#351080]">{createdCase.case_id}</span>
            </div>
            {createdCase.trace_id && (
              <div className="flex justify-between">
                <span className="text-[#777184]">Trace ID</span>
                <span className="font-mono font-semibold text-[#5B2EFF]">
                  {createdCase.trace_id}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[#777184]">Status</span>
              <span className="font-semibold text-[#F59E0B]">{createdCase.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#777184]">Reported Amount</span>
              <span className="font-bold">
                ₹{createdCase.reported_amount_rupees.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
          <button
            onClick={onBack}
            className="w-full py-3 rounded-xl bg-[#5B2EFF] text-white font-semibold text-sm"
          >
            Back to Home
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="bg-white rounded-3xl p-5 border border-purple-100 shadow-sm space-y-4"
        >
          <div>
            <label className="block text-xs font-bold text-[#201A32] mb-1">
              Select Transaction
            </label>
            <select
              value={selectedTxnId}
              onChange={(e) => setSelectedTxnId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-purple-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
            >
              {transactions.length === 0 && <option value="">No transactions available</option>}
              {transactions.map((t) => (
                <option key={t.transaction_id} value={t.transaction_id}>
                  {t.transaction_id} — ₹{t.amount_rupees} ({t.sender_account_id} →{' '}
                  {t.receiver_account_id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#201A32] mb-2">
              Fraud Category
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setCategory('PAYMENT_FRAUD')}
                className={`p-3 rounded-2xl border text-left transition ${
                  category === 'PAYMENT_FRAUD'
                    ? 'border-[#5B2EFF] bg-[#F4F0FF]'
                    : 'border-purple-100'
                }`}
              >
                <p className="text-xs font-bold text-[#201A32]">Payment Fraud</p>
                <p className="text-[10px] text-[#777184] mt-0.5">
                  Deceived into sending payment
                </p>
              </button>
              <button
                type="button"
                onClick={() => setCategory('UNAUTHORIZED_DEBIT')}
                className={`p-3 rounded-2xl border text-left transition ${
                  category === 'UNAUTHORIZED_DEBIT'
                    ? 'border-[#5B2EFF] bg-[#F4F0FF]'
                    : 'border-purple-100'
                }`}
              >
                <p className="text-xs font-bold text-[#201A32]">Unauthorized Debit</p>
                <p className="text-[10px] text-[#777184] mt-0.5">
                  Account compromise / not authorized
                </p>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#201A32] mb-1">
              Description
            </label>
            <textarea
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-purple-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
            />
          </div>

          {category === 'UNAUTHORIZED_DEBIT' && (
            <div>
              <label className="block text-xs font-bold text-[#201A32] mb-1">
                Device / Session Info (Optional)
              </label>
              <input
                type="text"
                value={deviceInfo}
                onChange={(e) => setDeviceInfo(e.target.value)}
                placeholder="e.g., Unknown device login from another city"
                className="w-full px-3.5 py-2 rounded-xl border border-purple-200 text-xs"
              />
            </div>
          )}

          {error && <p className="text-xs text-[#DC2626] font-medium">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !selectedTxnId}
            className="w-full py-3 rounded-xl bg-[#DC2626] hover:bg-red-700 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ShieldAlert className="w-4 h-4" />
            {submitting ? 'Submitting Report...' : 'Submit Fraud Report'}
          </button>
        </form>
      )}
    </div>
  );
};
