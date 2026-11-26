import React from 'react';
import { Bell, Shield, User } from 'lucide-react';
import type { AppMode } from '../types';

interface HeaderProps {
  mode: AppMode;
  onModeChange?: (mode: AppMode) => void;
  userName?: string;
  unreadCount: number;
  onBellClick: () => void;
  onProfileClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  userName,
  unreadCount,
  onBellClick,
  onProfileClick,
}) => {
  const subtitle = {
    USER: userName ? `Hello, ${userName}` : 'UPay Digital Wallet',
    FRAUDSTER: 'Fraudster Terminal',
    BANKER: 'Banker Monitoring Console',
    CYBERCELL: 'Cyber Cell Command',
    AI_MODEL: 'AI Detection & Graph Engine',
    DB_VIEWER: 'Live Database CLI',
  }[mode];

  return (
    <header className="sticky top-0 z-30 bg-[#FFFFFF]/95 backdrop-blur border-b border-orange-100 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#16A34A] to-[#F97316] flex items-center justify-center text-white shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-gray-900">
                {mode === 'USER' ? 'UPay' : 'FraudTrace'}
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-50 text-[#F97316] border border-orange-200">
                {mode}
              </span>
            </div>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onBellClick}
            className="relative p-2 rounded-xl bg-[#FBF8F3] text-[#F97316] hover:bg-orange-50 border border-orange-100 transition"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {mode === 'USER' && onProfileClick && (
            <button
              onClick={onProfileClick}
              className="w-9 h-9 rounded-xl bg-green-50 text-[#16A34A] border border-green-200 flex items-center justify-center hover:bg-green-100 transition"
              aria-label="Profile"
            >
              <User className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
