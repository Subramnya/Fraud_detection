import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
      {toasts.map((t) => {
        const styles = {
          success: 'bg-white border-l-4 border-[#16A34A] text-[#201A32]',
          warning: 'bg-white border-l-4 border-[#F59E0B] text-[#201A32]',
          error: 'bg-white border-l-4 border-[#DC2626] text-[#201A32]',
          info: 'bg-white border-l-4 border-[#5B2EFF] text-[#201A32]',
        }[t.type];

        const Icon = {
          success: <CheckCircle2 className="w-5 h-5 text-[#16A34A] shrink-0" />,
          warning: <AlertTriangle className="w-5 h-5 text-[#F59E0B] shrink-0" />,
          error: <XCircle className="w-5 h-5 text-[#DC2626] shrink-0" />,
          info: <Info className="w-5 h-5 text-[#5B2EFF] shrink-0" />,
        }[t.type];

        return (
          <div
            key={t.id}
            className={`${styles} rounded-xl shadow-lg p-3.5 flex items-start gap-3 border border-purple-100`}
          >
            {Icon}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{t.title}</p>
              <p className="text-xs text-[#777184] mt-0.5 break-words">{t.message}</p>
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="text-[#777184] hover:text-[#201A32] p-0.5"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
