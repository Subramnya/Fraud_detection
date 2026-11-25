import React, { useState } from 'react';
import { ArrowLeft, Copy, Check, Share2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { Account } from '../../types';

interface ReceiveMoneyScreenProps {
  account: Account;
  onBack: () => void;
  onNotify: (type: 'success' | 'info', title: string, msg: string) => void;
}

export const ReceiveMoneyScreen: React.FC<ReceiveMoneyScreenProps> = ({
  account,
  onBack,
  onNotify,
}) => {
  const [copied, setCopied] = useState(false);
  const qrPayload = `FRAUDTRACE:PAY:${account.account_id}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(account.account_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onNotify('success', 'Copied', `Account ID ${account.account_id} copied to clipboard.`);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'FraudTrace Virtual Payment QR',
          text: `Pay ${account.account_name} via FraudTrace: ${qrPayload}`,
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    await navigator.clipboard.writeText(qrPayload);
    onNotify('info', 'QR Payload Copied', `Copied ${qrPayload} to clipboard.`);
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
          <h2 className="text-lg font-bold text-[#201A32]">Receive Money</h2>
          <p className="text-xs text-[#777184]">Virtual FraudTrace QR Code</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 border border-purple-100 shadow-lg text-center space-y-5">
        <div>
          <p className="text-base font-bold text-[#201A32]">{account.account_name}</p>
          <p className="text-xs font-mono text-[#5B2EFF] mt-0.5">{account.account_id}</p>
        </div>

        <div className="inline-block p-5 rounded-3xl bg-[#F4F0FF] border-2 border-purple-200">
          <QRCodeSVG
            value={qrPayload}
            size={200}
            bgColor="#F4F0FF"
            fgColor="#351080"
            level="M"
          />
        </div>

        <p className="text-[11px] font-mono text-[#777184] bg-gray-50 px-3 py-1.5 rounded-xl inline-block">
          {qrPayload}
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => void handleCopy()}
            className="flex-1 py-3 rounded-xl bg-[#F4F0FF] text-[#5B2EFF] font-semibold text-xs flex items-center justify-center gap-1.5"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy Account ID'}
          </button>
          <button
            onClick={() => void handleShare()}
            className="flex-1 py-3 rounded-xl bg-[#5B2EFF] text-white font-semibold text-xs flex items-center justify-center gap-1.5"
          >
            <Share2 className="w-4 h-4" /> Share QR
          </button>
        </div>

        <div className="text-left bg-[#F4F0FF]/60 p-3.5 rounded-2xl text-xs text-[#777184] space-y-1">
          <p className="font-semibold text-[#201A32]">How to receive virtual payments:</p>
          <p>1. Ask the sender to open Scan & Pay in FraudTrace.</p>
          <p>2. They can scan this QR or paste your Account ID.</p>
          <p className="text-[11px] text-[#5B2EFF] pt-1">
            Prototype notice: Synthetic virtual QR only — not connected to real UPI.
          </p>
        </div>
      </div>
    </div>
  );
};
