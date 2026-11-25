import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Flashlight,
  ImageUp,
  Keyboard,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import type { Account, Transaction } from '../../types';
import { api, parseFraudTraceQR } from '../../services/api';

interface ScanPayScreenProps {
  senderAccount: Account;
  allAccounts: Account[];
  onBack: () => void;
  onSuccess: (txn: Transaction, recipientName: string) => void;
  onFailure: (errorMessage: string) => void;
}

export const ScanPayScreen: React.FC<ScanPayScreenProps> = ({
  senderAccount,
  allAccounts,
  onBack,
  onSuccess,
  onFailure,
}) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [qrError, setQrError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const [recipient, setRecipient] = useState<Account | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [paying, setPaying] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {
        // ignore stop errors
      }
      scannerRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, []);

  const handleDecodedPayload = async (rawText: string) => {
    setQrError(null);
    const parsed = parseFraudTraceQR(rawText);
    const targetId = parsed
      ? parsed.recipient_account_id
      : rawText.trim().startsWith('ACC_')
      ? rawText.trim()
      : null;

    if (!targetId) {
      setQrError(
        'Unrecognized QR format. Expected FRAUDTRACE:PAY:ACC_XXXX or valid FraudTrace JSON.'
      );
      return;
    }

    if (targetId === senderAccount.account_id) {
      setQrError('Cannot transfer to your own account.');
      return;
    }

    setValidating(true);
    try {
      const validated = await api.getAccount(targetId);
      if (!validated.is_active) {
        setQrError(`Account ${targetId} is inactive.`);
        return;
      }
      await stopCamera();
      setRecipient(validated);
    } catch (err) {
      setQrError(
        err instanceof Error
          ? err.message
          : `Recipient ${targetId} could not be validated.`
      );
    } finally {
      setValidating(false);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    setQrError(null);
    try {
      const qr = new Html5Qrcode('ft-qr-reader');
      scannerRef.current = qr;
      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          void handleDecodedPayload(decodedText);
        },
        () => {
          // ignore per-frame scan miss
        }
      );
      setCameraActive(true);
    } catch {
      setCameraError(
        'Camera access unavailable or permission denied. Use Gallery Upload or Manual Entry below.'
      );
      setCameraActive(false);
    }
  };

  const toggleTorch = async () => {
    if (!scannerRef.current || !cameraActive) return;
    try {
      const next = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setCameraError('Flashlight toggle is not supported on this device/browser.');
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrError(null);
    try {
      const qr = new Html5Qrcode('ft-qr-file-temp');
      const decoded = await qr.scanFile(file, true);
      await handleDecodedPayload(decoded);
    } catch {
      setQrError('Could not detect a valid FraudTrace QR code in that image.');
    }
  };

  const handleConfirmPayment = async () => {
    if (!recipient) return;
    setPaying(true);
    try {
      const txn = await api.sendPayment({
        sender_account_id: senderAccount.account_id,
        receiver_account_id: recipient.account_id,
        amount_rupees: Number(amount),
        description: note.trim() || 'QR Payment',
      });
      onSuccess(txn, recipient.account_name);
    } catch (err) {
      onFailure(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  const sampleAccount = allAccounts.find(
    (a) => a.account_id !== senderAccount.account_id && a.is_active
  );

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-24 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            void stopCamera();
            onBack();
          }}
          className="p-2 rounded-xl bg-white border border-purple-100 text-[#201A32]"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-[#201A32]">Scan & Pay</h2>
          <p className="text-xs text-[#777184]">Scan FraudTrace payment QR code</p>
        </div>
      </div>

      {!recipient ? (
        <>
          {/* Square QR Scanner Frame */}
          <div className="bg-[#201A32] rounded-3xl p-4 text-white shadow-lg">
            <div className="relative rounded-2xl overflow-hidden bg-black/50 min-h-[240px] flex flex-col items-center justify-center border-2 border-[#7B4DFF]">
              <div id="ft-qr-reader" className="w-full" />
              <div id="ft-qr-file-temp" className="hidden" />
              {!cameraActive && (
                <div className="p-6 text-center space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-[#5B2EFF]/30 flex items-center justify-center text-[#7B4DFF]">
                    <Camera className="w-7 h-7" />
                  </div>
                  <p className="text-xs text-purple-100">
                    Camera preview is paused. Tap below to grant camera permission and scan.
                  </p>
                  <button
                    onClick={() => void startCamera()}
                    className="px-4 py-2 rounded-xl bg-[#5B2EFF] hover:bg-[#7B4DFF] text-white text-xs font-semibold transition"
                  >
                    Enable Camera Scanner
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-around mt-3 pt-3 border-t border-white/10">
              <button
                onClick={() => void toggleTorch()}
                disabled={!cameraActive}
                className="flex items-center gap-1.5 text-xs font-medium text-purple-100 disabled:opacity-40"
              >
                <Flashlight className="w-4 h-4" />
                {torchOn ? 'Flash On' : 'Flashlight'}
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs font-medium text-purple-100 hover:text-white"
              >
                <ImageUp className="w-4 h-4" />
                Upload QR
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => void handleGalleryUpload(e)}
                className="hidden"
              />
            </div>
          </div>

          {cameraError && (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{cameraError}</span>
            </div>
          )}

          {qrError && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-[#DC2626] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{qrError}</span>
            </div>
          )}

          {/* Manual Fallback */}
          <div className="bg-white rounded-3xl p-4 border border-purple-100 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#201A32]">
              <Keyboard className="w-4 h-4 text-[#5B2EFF]" />
              <span>Manual QR Payload or Account ID Fallback</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="FRAUDTRACE:PAY:ACC_... or ACC_..."
                className="flex-1 px-3 py-2.5 rounded-xl border border-purple-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
              />
              <button
                onClick={() => void handleDecodedPayload(manualInput)}
                disabled={!manualInput.trim() || validating}
                className="px-4 py-2.5 rounded-xl bg-[#5B2EFF] text-white text-xs font-semibold hover:bg-[#351080] disabled:opacity-50"
              >
                {validating ? 'Checking...' : 'Verify'}
              </button>
            </div>
            {sampleAccount && (
              <button
                onClick={() =>
                  void handleDecodedPayload(`FRAUDTRACE:PAY:${sampleAccount.account_id}`)
                }
                className="text-[11px] font-semibold text-[#5B2EFF] hover:underline"
              >
                Demo Quick-Fill: FRAUDTRACE:PAY:{sampleAccount.account_id} (
                {sampleAccount.account_name})
              </button>
            )}
          </div>
        </>
      ) : !showConfirm ? (
        /* Recipient Validated -> Enter Amount */
        <div className="bg-white rounded-3xl p-5 border border-purple-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F4F0FF]">
            <div>
              <p className="text-xs text-[#777184]">Verified Recipient</p>
              <p className="text-base font-bold text-[#201A32]">{recipient.account_name}</p>
              <p className="text-xs font-mono text-[#5B2EFF]">{recipient.account_id}</p>
            </div>
            <ShieldCheck className="w-6 h-6 text-[#16A34A]" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#777184] mb-1">
              Amount (₹) — Available: ₹{senderAccount.balance_rupees.toLocaleString('en-IN')}
            </label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-3 rounded-2xl border border-purple-200 text-2xl font-bold text-[#201A32] focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#777184] mb-1">
              Payment Note (Optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Coffee, Groceries"
              className="w-full px-3.5 py-2.5 rounded-xl border border-purple-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B2EFF]"
            />
          </div>

          {Number(amount) > senderAccount.balance_rupees && (
            <p className="text-xs text-[#DC2626] font-medium">
              Amount exceeds available balance.
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setRecipient(null)}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-[#777184] font-semibold text-sm"
            >
              Rescan
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={
                !amount || Number(amount) <= 0 || Number(amount) > senderAccount.balance_rupees
              }
              className="flex-1 py-3 rounded-xl bg-[#5B2EFF] hover:bg-[#351080] text-white font-semibold text-sm disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      ) : (
        /* Explicit Payment Confirmation */
        <div className="bg-white rounded-3xl p-5 border border-purple-100 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-[#201A32]">Confirm Payment</h3>
          <div className="space-y-2.5 text-sm bg-[#F4F0FF]/70 p-4 rounded-2xl">
            <div className="flex justify-between">
              <span className="text-[#777184]">To</span>
              <span className="font-semibold text-[#201A32]">
                {recipient.account_name} ({recipient.account_id})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#777184]">From</span>
              <span className="font-mono text-xs text-[#201A32]">{senderAccount.account_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#777184]">Amount</span>
              <span className="font-bold text-lg text-[#5B2EFF]">
                ₹{Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {note && (
              <div className="flex justify-between">
                <span className="text-[#777184]">Note</span>
                <span className="text-[#201A32]">{note}</span>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              disabled={paying}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-[#777184] font-semibold text-sm"
            >
              Edit
            </button>
            <button
              onClick={() => void handleConfirmPayment()}
              disabled={paying}
              className="flex-1 py-3 rounded-xl bg-[#16A34A] hover:bg-green-700 text-white font-semibold text-sm disabled:opacity-50"
            >
              {paying ? 'Processing...' : 'Confirm & Pay'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
