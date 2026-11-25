import React from 'react';
import { Home, Clock, QrCode, Bell, User } from 'lucide-react';
import type { CustomerTab } from '../types';

interface BottomNavProps {
  activeTab: CustomerTab;
  onSelect: (tab: CustomerTab) => void;
  unreadCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelect,
  unreadCount,
}) => {
  const isHome = activeTab === 'home';
  const isHistory = activeTab === 'history';
  const isScan = activeTab === 'scan';
  const isNotifs = activeTab === 'notifications';
  const isProfile = activeTab === 'profile';

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-purple-100 shadow-lg">
      <div className="max-w-md mx-auto px-3 py-1.5 flex items-center justify-around">
        <button
          onClick={() => onSelect('home')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[11px] font-medium transition ${
            isHome ? 'text-[#5B2EFF]' : 'text-[#777184]'
          }`}
        >
          <Home className="w-5 h-5" />
          <span>Home</span>
        </button>

        <button
          onClick={() => onSelect('history')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[11px] font-medium transition ${
            isHistory ? 'text-[#5B2EFF]' : 'text-[#777184]'
          }`}
        >
          <Clock className="w-5 h-5" />
          <span>History</span>
        </button>

        {/* Prominent Central Scan Button */}
        <button
          onClick={() => onSelect('scan')}
          className={`-mt-6 flex flex-col items-center justify-center w-14 h-14 rounded-2xl shadow-lg transition ${
            isScan
              ? 'bg-[#351080] text-white'
              : 'bg-gradient-to-br from-[#5B2EFF] to-[#7B4DFF] text-white hover:from-[#351080] hover:to-[#5B2EFF]'
          }`}
          aria-label="Scan and Pay"
        >
          <QrCode className="w-6 h-6" />
        </button>

        <button
          onClick={() => onSelect('notifications')}
          className={`relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[11px] font-medium transition ${
            isNotifs ? 'text-[#5B2EFF]' : 'text-[#777184]'
          }`}
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-[#DC2626] text-white text-[9px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          <span>Alerts</span>
        </button>

        <button
          onClick={() => onSelect('profile')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[11px] font-medium transition ${
            isProfile ? 'text-[#5B2EFF]' : 'text-[#777184]'
          }`}
        >
          <User className="w-5 h-5" />
          <span>Profile</span>
        </button>
      </div>
    </nav>
  );
};
