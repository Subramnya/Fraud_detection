import React, { useState } from 'react';
import { ArrowLeft, Search, ShieldCheck } from 'lucide-react';
import type { Account, Transaction } from '../../types';
import { api } from '../../services/api';
import { ConfirmDialog } from '../ConfirmDialog';

interface SendMoneyScreenProps {
  senderAccount: Account;
  allAccounts: Account[];
  initialRecipient?: Account | null;
  onBack: () => void;
  onSuccess: (txn: Transaction, recipientName: string) => void;
  onFailure: (errorMessage: string) => void;
}

export const SendMoneyScreen: React.FC<SendMoneyScreenProps> = ({
  senderAccount,
  allAccounts,
  initialRecipient,
  onBack,
  onSuccess,
  onFailure,
}) => {
  const [query, setQuery] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<Account | null>(
    initialRecipient || null
  );
  const [manualId, setManualId] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);
  const [upiPin, setUpiPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [fraudWarningOpen, setFraudWarningOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const candidates = allAccounts.filter(
    (a) =>
      a.account_id !== senderAccount.account_id &&
      a.is_active &&
      (a.account_name.toLowerCase().includes(query.toLowerCase()) ||
        a.account_id.toLowerCase().includes(query.toLowerCase()))
  );

  const handleManualLookup = async () => {
    setLookupError(null);
    const id = manualId.trim();
    if (!id) return;
    if (id === senderAccount.account_id) {
      setLookupError('Cannot send money to your own account.');
      return;
    }
    try {
      const acc = await api.getAccount(id);
      if (!acc.is_active) {
        setLookupError('Recipient account is inactive.');
        return;
      }
      setSelectedRecipient(acc);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Account not found');
    }
  };

  const handleConfirm = async () => {
    if (!selectedRecipient) return;
    setSubmitting(true);
    try {
      const txn = await api.sendPayment({
        sender_account_id: senderAccount.account_id,
        receiver_account_id: selectedRecipient.account_id,
        amount_rupees: Number(amount),
        description: description.trim() || undefined,
      });
      onSuccess(txn, selectedRecipient.account_name);
    } catch (err) {
      onFailure(err instanceof Error ? err.message : 'Payment rejected by backend');
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
          <h2 className="text-lg font-bold text-[#201A32]">Send Money</h2>
          <p className="text-xs text-[#777184]">
            Available: ₹{senderAccount.balance_rupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {!selectedRecipient ? (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-4 border border-purple-100 shadow-sm space-y-3">
            <label className="block text-xs font-bold text-[#201A32]">
              Enter Account ID Directly
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="e.g., ACC_10002"
                className="flex-1 px-3 py-2.5 rounded-xl border border-purple-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
              />
              <button
                onClick={() => void handleManualLookup()}
                className="px-4 py-2.5 rounded-xl bg-[#5B2EFF] text-white text-xs font-semibold"
              >
                Verify
              </button>
            </div>
            {lookupError && <p className="text-xs text-[#DC2626]">{lookupError}</p>}
          </div>

          <div className="bg-white rounded-3xl p-4 border border-purple-100 shadow-sm space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#777184] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search recent contacts..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#F4F0FF]/70 text-xs focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
              />
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {candidates.map((acc) => (
                <button
                  key={acc.account_id}
                  onClick={() => setSelectedRecipient(acc)}
                  className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-[#F4F0FF] transition text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#F4F0FF] text-[#5B2EFF] font-bold text-sm flex items-center justify-center">
                      {acc.account_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#201A32]">{acc.account_name}</p>
                      <p className="text-xs font-mono text-[#777184]">{acc.account_id}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[#5B2EFF]">Select</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : !confirmStep ? (
        <div className="bg-white rounded-3xl p-5 border border-purple-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F4F0FF]">
            <div>
              <p className="text-xs text-[#777184]">Sending To</p>
              <p className="text-base font-bold text-[#201A32]">
                {selectedRecipient.account_name}
              </p>
              <p className="text-xs font-mono text-[#5B2EFF]">
                {selectedRecipient.account_id}
              </p>
            </div>
            <ShieldCheck className="w-6 h-6 text-[#16A34A]" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#777184] mb-1">
              Amount (₹)
            </label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-3 rounded-2xl border border-purple-200 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#777184] mb-1">
              Payment Note (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Dinner split"
              className="w-full px-3.5 py-2.5 rounded-xl border border-purple-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
            />
          </div>

          {Number(amount) > senderAccount.balance_rupees && (
            <p className="text-xs text-[#DC2626] font-medium">
              Insufficient balance (available ₹{senderAccount.balance_rupees.toLocaleString('en-IN')}).
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setSelectedRecipient(null)}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-[#777184] font-semibold text-sm"
            >
              Change
            </button>
            <button
              onClick={() => setConfirmStep(true)}
              disabled={
                !amount || Number(amount) <= 0 || Number(amount) > senderAccount.balance_rupees
              }
              className="flex-1 py-3 rounded-xl bg-[#5B2EFF] hover:bg-[#351080] text-white font-semibold text-sm disabled:opacity-50"
            >
              Review Payment
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-5 border border-purple-100 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-[#201A32]">Payment Summary</h3>
          <div className="space-y-2.5 text-sm bg-[#F4F0FF]/70 p-4 rounded-2xl">
            <div className="flex justify-between">
              <span className="text-[#777184]">Recipient</span>
              <span className="font-semibold text-[#201A32]">
                {selectedRecipient.account_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#777184]">Recipient ID</span>
              <span className="font-mono text-xs">{selectedRecipient.account_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#777184]">Sender</span>
              <span className="font-mono text-xs">{senderAccount.account_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#777184]">Amount</span>
              <span className="font-bold text-lg text-[#5B2EFF]">
                ₹{Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {description && (
              <div className="flex justify-between">
                <span className="text-[#777184]">Note</span>
                <span>{description}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#777184] mb-1">
              Virtual UPI PIN (Demo PIN: 0000)
            </label>
            <input
              type="password"
              maxLength={4}
              value={upiPin}
              onChange={(e) => {
                setUpiPin(e.target.value);
                setPinError(null);
              }}
              placeholder="Enter 4-digit PIN (0000)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-purple-200 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
            />
            {pinError && <p className="text-xs text-[#DC2626] mt-1">{pinError}</p>}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setConfirmStep(false)}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-[#777184] font-semibold text-sm"
            >
              Back
            </button>
            <button
              onClick={async () => {
                if (upiPin.trim() !== '0000') {
                  setPinError('Invalid Virtual UPI PIN. Use 0000 for demo.');
                  return;
                }
                if (selectedRecipient) {
                  try {
                    const warn = await api.checkAccountFraudWarning(selectedRecipient.account_id);
                    if (warn.detected_earlier) {
                      setFraudWarningOpen(true);
                      return;
                    }
                  } catch {
                    // continue if check fails
                  }
                }
                void handleConfirm();
              }}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-[#16A34A] hover:bg-green-700 text-white font-semibold text-sm disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Confirm Payment'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={fraudWarningOpen}
        title="Fraud Warning — Detected Earlier"
        description="Are you sure? Do you want to really make the payment? Because this person has been detected as a fraud earlier."
        confirmLabel="Yes, Pay Anyway"
        cancelLabel="Cancel"
        variant="danger"
        loading={submitting}
        onConfirm={() => {
          setFraudWarningOpen(false);
          void handleConfirm();
        }}
        onCancel={() => setFraudWarningOpen(false)}
      />
    </div>
  );
};
