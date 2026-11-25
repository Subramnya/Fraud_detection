import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'purple' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'purple',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-purple-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                variant === 'danger' ? 'bg-red-50 text-[#DC2626]' : 'bg-[#F4F0FF] text-[#5B2EFF]'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[#201A32]">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            className="text-[#777184] hover:text-[#201A32]"
            disabled={loading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-[#777184] mt-3 leading-relaxed">{description}</p>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-[#777184] bg-gray-100 hover:bg-gray-200 transition"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50 ${
              variant === 'danger'
                ? 'bg-[#DC2626] hover:bg-red-700'
                : 'bg-[#5B2EFF] hover:bg-[#351080]'
            }`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
