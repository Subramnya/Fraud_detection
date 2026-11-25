import React from 'react';
import { CheckCircle2, XCircle, Download, Home, RotateCcw } from 'lucide-react';
import type { Transaction } from '../../types';

interface PaymentResultScreenProps {
  success: boolean;
  transaction?: Transaction | null;
  recipientName?: string;
  errorMessage?: string | null;
  onDone: () => void;
  onRetry: () => void;
}

export const PaymentResultScreen: React.FC<PaymentResultScreenProps> = ({
  success,
  transaction,
  recipientName,
  errorMessage,
  onDone,
  onRetry,
}) => {
  const handleDownloadReceipt = () => {
    if (!transaction) return;
    const text = [
      'FRAUDTRACE VIRTUAL PAYMENT RECEIPT (PROTOTYPE)',
      '==============================================',
      `Transaction ID : ${transaction.transaction_id}`,
      `Status         : ${transaction.status}`,
      `Amount         : INR ${transaction.amount_rupees.toFixed(2)}`,
      `Sender         : ${transaction.sender_account_id}`,
      `Receiver       : ${recipientName || ''} (${transaction.receiver_account_id})`,
      `Description    : ${transaction.description || '-'}`,
      `Timestamp      : ${transaction.created_at || new Date().toISOString()}`,
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt_${transaction.transaction_id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-8 pb-24">
      <div className="bg-white rounded-3xl p-6 border border-purple-100 shadow-lg text-center space-y-5">
        {success && transaction ? (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-green-50 text-[#16A34A] flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#201A32]">Payment Successful</h2>
              <p className="text-3xl font-bold text-[#16A34A] mt-2">
                ₹{transaction.amount_rupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-[#777184] mt-1">
                Paid to {recipientName || transaction.receiver_account_id}
              </p>
            </div>

            <div className="bg-[#F4F0FF]/70 rounded-2xl p-4 text-left space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#777184]">Transaction ID</span>
                <span className="font-mono font-semibold text-[#201A32]">
                  {transaction.transaction_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777184]">Recipient Account</span>
                <span className="font-mono">{transaction.receiver_account_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777184]">Date & Time</span>
                <span>
                  {transaction.created_at
                    ? new Date(transaction.created_at).toLocaleString()
                    : new Date().toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777184]">Status</span>
                <span className="font-bold text-[#16A34A]">{transaction.status}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDownloadReceipt}
                className="flex-1 py-3 rounded-xl bg-[#F4F0FF] text-[#5B2EFF] font-semibold text-sm flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" /> Receipt
              </button>
              <button
                onClick={onDone}
                className="flex-1 py-3 rounded-xl bg-[#5B2EFF] text-white font-semibold text-sm flex items-center justify-center gap-1.5"
              >
                <Home className="w-4 h-4" /> Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-red-50 text-[#DC2626] flex items-center justify-center">
              <XCircle className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#201A32]">Payment Failed</h2>
              <p className="text-xs font-semibold text-[#DC2626] mt-2">
                {errorMessage || 'Transaction could not be completed.'}
              </p>
              <p className="text-[11px] text-[#777184] mt-1">Status: FAILED / REJECTED</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onDone}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-[#777184] font-semibold text-sm"
              >
                Home
              </button>
              <button
                onClick={onRetry}
                className="flex-1 py-3 rounded-xl bg-[#5B2EFF] text-white font-semibold text-sm flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" /> Retry
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
