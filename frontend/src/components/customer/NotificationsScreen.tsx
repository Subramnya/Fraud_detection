import React, { useState } from 'react';
import {
  Bell,
  ShieldAlert,
  CheckCheck,
  CreditCard,
  AlertTriangle,
  UserCheck,
  Send,
  X,
} from 'lucide-react';
import type { AppNotification } from '../../types';

interface NotificationsScreenProps {
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onInspectTransaction: (transactionId: string) => void;
  onReportToCyberCell?: (n: AppNotification) => void;
}

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onInspectTransaction,
  onReportToCyberCell,
}) => {
  const [category, setCategory] = useState<string>('ALL');

  const filtered =
    category === 'ALL'
      ? notifications
      : notifications.filter((n) => n.category === category);

  const severityStyle = (sev: string) => {
    if (sev === 'HIGH' || sev === 'CRITICAL') {
      return 'border-l-4 border-[#DC2626] bg-red-50/60';
    }
    if (sev === 'MEDIUM') {
      return 'border-l-4 border-[#F97316] bg-orange-50/50';
    }
    if (sev === 'LOW') {
      return 'border-l-4 border-[#F59E0B] bg-amber-50/40';
    }
    return 'border-l-4 border-[#16A34A] bg-white';
  };

  const categoryIcon = (cat: string, sev: string) => {
    if (cat === 'FRAUD_ALERT' || sev === 'HIGH' || sev === 'CRITICAL') {
      return <ShieldAlert className="w-5 h-5 text-[#DC2626] shrink-0" />;
    }
    if (cat === 'SECURITY') {
      return <AlertTriangle className="w-5 h-5 text-[#F97316] shrink-0" />;
    }
    if (cat === 'ACCOUNT') {
      return <UserCheck className="w-5 h-5 text-[#16A34A] shrink-0" />;
    }
    return <CreditCard className="w-5 h-5 text-[#16A34A] shrink-0" />;
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Notifications</h2>
        {notifications.some((n) => !n.is_read) && (
          <button
            onClick={onMarkAllRead}
            className="text-xs font-semibold text-[#16A34A] flex items-center gap-1 hover:underline"
          >
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[
          { key: 'ALL', label: 'All' },
          { key: 'PAYMENT', label: 'Payments' },
          { key: 'SECURITY', label: 'Security' },
          { key: 'FRAUD_ALERT', label: 'Fraud Alerts' },
        ].map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition ${
              category === c.key
                ? 'bg-[#16A34A] text-white'
                : 'bg-white text-gray-600 border border-orange-100'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 text-center border border-orange-100 space-y-2">
          <Bell className="w-8 h-8 text-gray-400 mx-auto opacity-50" />
          <p className="text-xs text-gray-500">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((n) => {
            const isBankReport = n.title.includes('Investigation Report Ready');
            return (
              <div
                key={n.notification_id}
                onClick={() => {
                  if (!n.is_read) onMarkRead(n.notification_id);
                }}
                className={`rounded-2xl p-3.5 border border-orange-100 shadow-xs cursor-pointer transition ${severityStyle(
                  n.severity
                )} ${n.is_read ? 'opacity-85' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {categoryIcon(n.category, n.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-gray-900">{n.title}</p>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-[#F97316] shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">{n.message}</p>

                    {isBankReport && onReportToCyberCell && (
                      <div className="flex gap-2 mt-2.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onReportToCyberCell(n);
                          }}
                          className="flex-1 py-2 rounded-xl bg-[#DC2626] text-white text-[11px] font-bold flex items-center justify-center gap-1"
                        >
                          <Send className="w-3 h-3" /> Report to Cyber Cell
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onMarkRead(n.notification_id);
                          }}
                          className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <X className="w-3 h-3" /> Cancel
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-orange-100/60">
                      <span className="text-[10px] text-gray-500">
                        {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                      </span>
                      {n.transaction_id && !isBankReport && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspectTransaction(n.transaction_id!);
                          }}
                          className="text-[11px] font-semibold text-[#F97316] hover:underline"
                        >
                          Review / Report →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
