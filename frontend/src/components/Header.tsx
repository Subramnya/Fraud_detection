import React from 'react';
import { Bell, Shield, User, Building2, Smartphone } from 'lucide-react';
import type { AppMode } from '../types';

interface HeaderProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  userName?: string;
  unreadCount: number;
  onBellClick: () => void;
  onProfileClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  onModeChange,
  userName,
  unreadCount,
  onBellClick,
  onProfileClick,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-purple-100 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#5B2EFF] to-[#351080] flex items-center justify-center text-white shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-[#201A32]">
                FraudTrace
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#F4F0FF] text-[#5B2EFF]">
                PROTOTYPE
              </span>
            </div>
            {mode === 'CUSTOMER' && userName ? (
              <p className="text-xs text-[#777184]">Hello, {userName}</p>
            ) : (
              <p className="text-xs text-[#777184]">Banker Monitoring Console</p>
            )}
          </div>
        </div>

        {/* Role Switcher + Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center bg-[#F4F0FF] p-1 rounded-xl">
            <button
              onClick={() => onModeChange('CUSTOMER')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === 'CUSTOMER'
                  ? 'bg-[#5B2EFF] text-white shadow-xs'
                  : 'text-[#777184] hover:text-[#201A32]'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Customer App</span>
            </button>
            <button
              onClick={() => onModeChange('BANKER')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === 'BANKER'
                  ? 'bg-[#351080] text-white shadow-xs'
                  : 'text-[#777184] hover:text-[#201A32]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Banker Desk</span>
            </button>
          </div>

          {/* Notification Bell */}
          <button
            onClick={onBellClick}
            className="relative p-2 rounded-xl bg-[#F4F0FF] text-[#5B2EFF] hover:bg-purple-100 transition"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {mode === 'CUSTOMER' && onProfileClick && (
            <button
              onClick={onProfileClick}
              className="w-9 h-9 rounded-xl bg-[#F4F0FF] text-[#351080] flex items-center justify-center hover:bg-purple-100 transition"
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
