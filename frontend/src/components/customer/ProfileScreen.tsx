import React, { useState } from 'react';
import {
  User,
  Shield,
  Bell,
  HelpCircle,
  LogOut,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import type { Account } from '../../types';
import { api } from '../../services/api';

interface ProfileScreenProps {
  account: Account;
  onTriggerDemoComplete: () => void;
  onNotify: (type: 'success' | 'warning' | 'error' | 'info', title: string, msg: string) => void;
  onLogout: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  account,
  onTriggerDemoComplete,
  onNotify,
  onLogout,
}) => {
  const [pushAlerts, setPushAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const handleTriggerDemo = async () => {
    setTriggering(true);
    try {
      const res = await api.triggerSuspiciousDemo(account.account_id);
      onTriggerDemoComplete();
      onNotify(
        'warning',
        'Suspicious Scenario Triggered (Demo)',
        `Simulated ₹${res.amount_rupees.toLocaleString('en-IN')} transfer (${res.transaction_id}) triggered ${res.alerts_triggered.length} alert(s). Check Notifications & Banker Desk!`
      );
    } catch (err) {
      onNotify('error', 'Demo Trigger Failed', err instanceof Error ? err.message : 'Error');
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-24 space-y-4">
      <h2 className="text-lg font-bold text-[#201A32]">Profile & Security</h2>

      {/* User Card */}
      <div className="bg-white rounded-3xl p-5 border border-purple-100 shadow-sm flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#5B2EFF] to-[#351080] text-white font-bold text-xl flex items-center justify-center">
          {account.account_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-[#201A32] truncate">{account.account_name}</p>
          <p className="text-xs font-mono text-[#5B2EFF]">{account.account_id}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-[#16A34A] flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {account.is_active ? 'Active' : 'Inactive'}
            </span>
            <span className="text-[10px] text-[#777184]">{account.account_type}</span>
          </div>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="bg-white rounded-3xl p-4 border border-purple-100 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[#201A32]">
          <Bell className="w-4 h-4 text-[#5B2EFF]" />
          <span>Notification Preferences</span>
        </div>
        <label className="flex items-center justify-between text-xs text-[#201A32] py-1">
          <span>Real-time security alerts</span>
          <input
            type="checkbox"
            checked={pushAlerts}
            onChange={(e) => setPushAlerts(e.target.checked)}
            className="accent-[#5B2EFF] w-4 h-4"
          />
        </label>
        <label className="flex items-center justify-between text-xs text-[#201A32] py-1">
          <span>Payment confirmation alerts</span>
          <input
            type="checkbox"
            checked={smsAlerts}
            onChange={(e) => setSmsAlerts(e.target.checked)}
            className="accent-[#5B2EFF] w-4 h-4"
          />
        </label>
      </div>

      {/* Security Centre + Demo Simulation */}
      <div className="bg-white rounded-3xl p-4 border border-purple-100 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[#201A32]">
          <Shield className="w-4 h-4 text-[#5B2EFF]" />
          <span>Security Centre</span>
        </div>
        <p className="text-xs text-[#777184] leading-relaxed">
          All virtual transactions are monitored in the background. Suspicious patterns generate
          security alerts without automatically freezing your account.
        </p>

        <div className="p-3.5 rounded-2xl bg-[#F4F0FF] border border-purple-200 space-y-2">
          <p className="text-xs font-bold text-[#351080] flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-[#5B2EFF]" />
            Demo Simulation Controls (Dev Only)
          </p>
          <p className="text-[11px] text-[#777184]">
            Trigger a predefined suspicious high-value transfer on this account to test real-time
            customer & banker fraud alerts.
          </p>
          <button
            onClick={() => void handleTriggerDemo()}
            disabled={triggering}
            className="w-full py-2.5 rounded-xl bg-[#5B2EFF] hover:bg-[#351080] text-white text-xs font-semibold transition disabled:opacity-50"
          >
            {triggering ? 'Triggering Scenario...' : 'Trigger Suspicious Transaction (Demo)'}
          </button>
        </div>
      </div>

      {/* Help & Logout */}
      <div className="bg-white rounded-3xl p-4 border border-purple-100 shadow-sm space-y-2">
        <div className="flex items-center gap-2 text-xs text-[#777184] py-1">
          <HelpCircle className="w-4 h-4 text-[#5B2EFF]" />
          <span>Help & Support: Synthetic Prototype — Dev Mode</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#777184] py-1">
          <User className="w-4 h-4 text-[#5B2EFF]" />
          <span>User ID: {account.user_id}</span>
        </div>
        <button
          onClick={onLogout}
          className="w-full mt-2 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-[#DC2626] font-semibold text-xs flex items-center justify-center gap-1.5 transition"
        >
          <LogOut className="w-4 h-4" /> Switch / Exit Demo Account
        </button>
      </div>
    </div>
  );
};
