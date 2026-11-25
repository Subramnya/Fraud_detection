import React, { useState } from 'react';
import {
  Bell,
  ShieldAlert,
  CheckCheck,
  CreditCard,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';
import type { AppNotification } from '../../types';

interface NotificationsScreenProps {
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onInspectTransaction: (transactionId: string) => void;
}

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onInspectTransaction,
}) => {
  const [category, setCategory] = useState<string>('ALL');

  const filtered =
    category === 'ALL'
      ? notifications
      : notifications.filter((n) => n.category === category);

  const severityStyle = (sev: string) => {
    if (sev === 'HIGH' || sev === 'CRITICAL') {
      return 'border-l-4 border-[#DC2626] bg-red-50/40';
    }
    if (sev === 'MEDIUM') {
      return 'border-l-4 border-orange-500 bg-orange-50/40';
    }
    if (sev === 'LOW') {
      return 'border-l-4 border-[#F59E0B] bg-amber-50/40';
    }
    return 'border-l-4 border-[#5B2EFF] bg-white';
  };

  const categoryIcon = (cat: string, sev: string) => {
    if (cat === 'FRAUD_ALERT' || sev === 'HIGH' || sev === 'CRITICAL') {
      return <ShieldAlert className="w-5 h-5 text-[#DC2626] shrink-0" />;
    }
    if (cat === 'SECURITY') {
      return <AlertTriangle className="w-5 h-5 text-[#F59E0B] shrink-0" />;
    }
    if (cat === 'ACCOUNT') {
      return <UserCheck className="w-5 h-5 text-[#5B2EFF] shrink-0" />;
    }
    return <CreditCard className="w-5 h-5 text-[#16A34A] shrink-0" />;
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#201A32]">Notifications</h2>
        {notifications.some((n) => !n.is_read) && (
          <button
            onClick={onMarkAllRead}
            className="text-xs font-semibold text-[#5B2EFF] flex items-center gap-1 hover:underline"
          >
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      {/* Category Filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[
          { key: 'ALL', label: 'All' },
          { key: 'PAYMENT', label: 'Payments' },
          { key: 'SECURITY', label: 'Security' },
          { key: 'FRAUD_ALERT', label: 'Fraud Alerts' },
          { key: 'ACCOUNT', label: 'Account' },
        ].map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition ${
              category === c.key
                ? 'bg-[#5B2EFF] text-white'
                : 'bg-white text-[#777184] border border-purple-100'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 text-center border border-purple-100 space-y-2">
          <Bell className="w-8 h-8 text-[#777184] mx-auto opacity-50" />
          <p className="text-xs text-[#777184]">No notifications in this category yet.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((n) => (
            <div
              key={n.notification_id}
              onClick={() => {
                if (!n.is_read) onMarkRead(n.notification_id);
              }}
              className={`rounded-2xl p-3.5 border border-purple-100 shadow-xs cursor-pointer transition ${severityStyle(
                n.severity
              )} ${n.is_read ? 'opacity-80' : ''}`}
            >
              <div className="flex items-start gap-3">
                {categoryIcon(n.category, n.severity)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-[#201A32]">{n.title}</p>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-[#5B2EFF] shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-[#777184] mt-1 leading-relaxed">
                    {n.message}
                  </p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-purple-100/60">
                    <span className="text-[10px] text-[#777184]">
                      {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                    </span>
                    {n.transaction_id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onInspectTransaction(n.transaction_id!);
                        }}
                        className="text-[11px] font-semibold text-[#5B2EFF] hover:underline"
                      >
                        Review / Report →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
