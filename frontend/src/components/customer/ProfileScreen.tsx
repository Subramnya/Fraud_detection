import React, { useCallback, useEffect, useState } from 'react';
import {
  User,
  Landmark,
  BadgeCheck,
  Shield,
  Bell,
  Lock,
  LogOut,
  Edit3,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  KeyRound,
  Smartphone,
  Mail,
} from 'lucide-react';
import type { Account } from '../../types';
import { api } from '../../services/api';

interface ProfileScreenProps {
  account: Account;
  onProfileUpdated: () => void;
  onNotify: (type: 'success' | 'warning' | 'error' | 'info', title: string, msg: string) => void;
  onLogout: () => void;
}

type ProfileData = Awaited<ReturnType<typeof api.getUserProfile>>;

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  account,
  onProfileUpdated,
  onNotify,
  onLogout,
}) => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit Personal Info
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [savingPersonal, setSavingPersonal] = useState(false);

  // Change Password
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  // Support / Issue
  const [showSupportForm, setShowSupportForm] = useState(false);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMsg, setSupportMsg] = useState('');
  const [sendingSupport, setSendingSupport] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getUserProfile(account.account_id);
      setProfile(data);
      setFullName(data.personal.full_name);
      setPhone(data.personal.phone === 'Not available' ? '' : data.personal.phone);
      setDob(data.personal.date_of_birth === 'Not available' ? '' : data.personal.date_of_birth);
      setAddress(data.personal.address === 'Not available' ? '' : data.personal.address);
    } catch (err) {
      onNotify('error', 'Profile Load Failed', err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [account.account_id, onNotify]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPersonal(true);
    try {
      await api.updatePersonalProfile(account.account_id, {
        full_name: fullName,
        phone,
        date_of_birth: dob,
        address,
      });
      setEditingPersonal(false);
      await loadProfile();
      onProfileUpdated();
      onNotify('success', 'Profile Updated', 'Personal information saved.');
    } catch (err) {
      onNotify('error', 'Update Failed', err instanceof Error ? err.message : 'Error');
    } finally {
      setSavingPersonal(false);
    }
  };

  const handleVerifyKyc = async (verifyMobile: boolean, verifyEmail: boolean) => {
    try {
      const res = await api.verifyKyc(account.account_id, {
        verify_mobile: verifyMobile,
        verify_email: verifyEmail,
      });
      await loadProfile();
      onNotify('success', 'KYC Updated', `KYC status is now ${res.kyc_status}.`);
    } catch (err) {
      onNotify('error', 'Verification Failed', err instanceof Error ? err.message : 'Error');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPwd(true);
    try {
      await api.changePassword(account.account_id, {
        current_password: currentPwd || undefined,
        new_password: newPwd,
      });
      setCurrentPwd('');
      setNewPwd('');
      setShowPasswordForm(false);
      await loadProfile();
      onNotify('success', 'Password Updated', 'Your account password has been changed.');
    } catch (err) {
      onNotify('error', 'Password Update Failed', err instanceof Error ? err.message : 'Error');
    } finally {
      setSavingPwd(false);
    }
  };

  const handleTogglePref = async (key: keyof ProfileData['notification_preferences']) => {
    if (!profile || key === 'suspicious_txn') return;
    const updated = {
      ...profile.notification_preferences,
      [key]: !profile.notification_preferences[key],
    };
    try {
      await api.updateNotificationPreferences(account.account_id, updated);
      setProfile({ ...profile, notification_preferences: updated });
      onNotify('info', 'Preferences Saved', 'Notification preferences updated.');
    } catch (err) {
      onNotify('error', 'Save Failed', err instanceof Error ? err.message : 'Error');
    }
  };

  const handleTogglePrivacy = async (key: 'privacy_consent' | 'data_sharing_opt_in') => {
    if (!profile) return;
    const updated = {
      ...profile.privacy,
      [key]: !profile.privacy[key],
    };
    try {
      await api.updatePrivacySettings(account.account_id, updated);
      setProfile({ ...profile, privacy: updated });
      onNotify('info', 'Privacy Updated', 'Your privacy preferences have been saved.');
    } catch (err) {
      onNotify('error', 'Save Failed', err instanceof Error ? err.message : 'Error');
    }
  };

  const handleSupportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingSupport(true);
    try {
      const res = await api.submitSupportTicket(account.account_id, {
        subject: supportSubject,
        message: supportMsg,
      });
      setSupportSubject('');
      setSupportMsg('');
      setShowSupportForm(false);
      onNotify('success', 'Ticket Submitted', `Support Ticket ${res.ticket_id} logged.`);
    } catch (err) {
      onNotify('error', 'Support Failed', err instanceof Error ? err.message : 'Error');
    } finally {
      setSendingSupport(false);
    }
  };

  if (loading && !profile) {
    return (
      <div className="max-w-md mx-auto px-4 pt-8 pb-24 text-center text-xs text-gray-500">
        Loading banking profile...
      </div>
    );
  }

  const kycBadge = (status: string) => {
    if (status === 'VERIFIED') return 'bg-green-50 text-[#16A34A] border-green-200';
    if (status === 'PENDING') return 'bg-amber-50 text-amber-800 border-amber-200';
    return 'bg-red-50 text-[#DC2626] border-red-200';
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-24 space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Banking Profile & Security</h2>

      {/* 1. PERSONAL INFORMATION */}
      <div className="bg-white rounded-3xl p-5 border border-orange-100 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#16A34A] to-[#F97316] text-white font-bold text-lg flex items-center justify-center shrink-0">
              {(profile?.personal.full_name || account.account_name).charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#16A34A]" /> Personal Information
              </h3>
              <p className="text-[11px] text-gray-500">User ID: {profile?.personal.user_id}</p>
            </div>
          </div>
          <button
            onClick={() => setEditingPersonal(!editingPersonal)}
            className="px-2.5 py-1.5 rounded-xl bg-[#FBF8F3] border border-orange-200 text-xs font-semibold text-[#F97316] flex items-center gap-1"
          >
            <Edit3 className="w-3.5 h-3.5" /> {editingPersonal ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {editingPersonal ? (
          <form onSubmit={(e) => void handleSavePersonal(e)} className="space-y-2.5 pt-2 border-t border-orange-100">
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full Name"
              className="w-full px-3 py-2 rounded-xl border border-orange-200 text-xs"
            />
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Mobile Number"
              className="w-full px-3 py-2 rounded-xl border border-orange-200 text-xs"
            />
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-orange-200 text-xs"
            />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Residential Address"
              className="w-full px-3 py-2 rounded-xl border border-orange-200 text-xs"
            />
            <button
              type="submit"
              disabled={savingPersonal}
              className="w-full py-2.5 rounded-xl bg-[#16A34A] text-white text-xs font-bold disabled:opacity-50"
            >
              {savingPersonal ? 'Saving...' : 'Save Personal Details'}
            </button>
          </form>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 text-xs pt-2 border-t border-orange-100">
            <div className="flex justify-between">
              <span className="text-gray-500">Full Name</span>
              <span className="font-semibold text-gray-900">{profile?.personal.full_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Email</span>
              <span className="font-medium text-gray-900">{profile?.personal.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Mobile</span>
              <span className="font-medium text-gray-900">{profile?.personal.phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date of Birth</span>
              <span className="font-medium text-gray-900">{profile?.personal.date_of_birth}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500 shrink-0">Address</span>
              <span className="font-medium text-gray-900 text-right">{profile?.personal.address}</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. BANK ACCOUNT INFORMATION */}
      <div className="bg-white rounded-3xl p-5 border border-orange-100 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-[#16A34A]" /> Bank Account Information
          </h3>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${profile?.bank_account.status === 'Active'
                ? 'bg-green-50 text-[#16A34A]'
                : 'bg-red-50 text-[#DC2626]'
              }`}
          >
            {profile?.bank_account.status}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-1.5 text-xs pt-2 border-t border-orange-100">
          <div className="flex justify-between">
            <span className="text-gray-500">Account Holder</span>
            <span className="font-semibold">{profile?.bank_account.account_holder_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Account Number</span>
            <span className="font-mono font-bold text-gray-900">
              {profile?.bank_account.masked_account_number}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Account Type</span>
            <span>{profile?.bank_account.account_type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Bank Name</span>
            <span>{profile?.bank_account.bank_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Branch</span>
            <span>{profile?.bank_account.branch_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">IFSC Code</span>
            <span className="font-mono">{profile?.bank_account.ifsc_code}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Opened On</span>
            <span>
              {profile?.bank_account.opened_at && profile.bank_account.opened_at !== 'Not available'
                ? new Date(profile.bank_account.opened_at).toLocaleDateString()
                : 'Not available'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. KYC VERIFICATION */}
      <div className="bg-white rounded-3xl p-5 border border-orange-100 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <BadgeCheck className="w-4 h-4 text-[#16A34A]" /> KYC Verification
          </h3>
          <span
            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${kycBadge(
              profile?.kyc.overall_status || 'PENDING'
            )}`}
          >
            {profile?.kyc.overall_status}
          </span>
        </div>

        <div className="space-y-2 text-xs pt-2 border-t border-orange-100">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-gray-600">
              <Smartphone className="w-3.5 h-3.5" /> Mobile Verification
            </span>
            {profile?.kyc.mobile_verified ? (
              <span className="text-[#16A34A] font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Verified
              </span>
            ) : (
              <button
                onClick={() => void handleVerifyKyc(true, false)}
                className="px-2.5 py-1 rounded-lg bg-orange-50 text-[#F97316] font-semibold text-[11px]"
              >
                Verify Mobile
              </button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-gray-600">
              <Mail className="w-3.5 h-3.5" /> Email Verification
            </span>
            {profile?.kyc.email_verified ? (
              <span className="text-[#16A34A] font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Verified
              </span>
            ) : (
              <button
                onClick={() => void handleVerifyKyc(false, true)}
                className="px-2.5 py-1 rounded-lg bg-orange-50 text-[#F97316] font-semibold text-[11px]"
              >
                Verify Email
              </button>
            )}
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500">Verification Date</span>
            <span>{profile?.kyc.verified_at}</span>
          </div>
        </div>
      </div>

      {/* 4. SECURITY & LOGIN ACTIVITY */}
      <div className="bg-white rounded-3xl p-5 border border-orange-100 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#F97316]" /> Security & Login Activity
          </h3>
          <button
            onClick={() => setShowPasswordForm(!showPasswordForm)}
            className="text-xs font-semibold text-[#16A34A] flex items-center gap-1"
          >
            <KeyRound className="w-3.5 h-3.5" /> Change Password
          </button>
        </div>

        {showPasswordForm && (
          <form onSubmit={(e) => void handlePasswordChange(e)} className="space-y-2 p-3 rounded-2xl bg-[#FBF8F3] border border-orange-100">
            {profile?.security.password_configured && (
              <input
                type="password"
                required
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                placeholder="Current Password"
                className="w-full px-3 py-2 rounded-xl border border-orange-200 text-xs"
              />
            )}
            <input
              type="password"
              required
              minLength={6}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="New Password (min 6 chars)"
              className="w-full px-3 py-2 rounded-xl border border-orange-200 text-xs"
            />
            <button
              type="submit"
              disabled={savingPwd}
              className="w-full py-2 rounded-xl bg-[#16A34A] text-white text-xs font-bold"
            >
              {savingPwd ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}

        <div className="space-y-1.5 text-xs pt-2 border-t border-orange-100">
          <div className="flex justify-between">
            <span className="text-gray-500">Two-Factor Authentication</span>
            <span className="font-semibold text-amber-700">
              {profile?.security.two_factor_status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Last Successful Login</span>
            <span className="font-mono text-[11px]">
              {profile?.security.last_successful_login &&
                profile.security.last_successful_login !== 'Not available'
                ? new Date(profile.security.last_successful_login).toLocaleString()
                : 'Not available'}
            </span>
          </div>
        </div>

        {profile && profile.security.recent_logins.length > 0 && (
          <div className="space-y-1 max-h-28 overflow-y-auto pt-1">
            <p className="text-[11px] font-semibold text-gray-500">Recent Login Activity</p>
            {profile.security.recent_logins.map((l) => (
              <div
                key={l.activity_id}
                className="p-2 rounded-xl bg-[#FBF8F3] text-[10px] flex justify-between gap-2"
              >
                <span className="truncate">{l.device_info}</span>
                <span className="font-mono shrink-0">
                  {new Date(l.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. TRANSACTION NOTIFICATION PREFERENCES */}
      {profile && (
        <div className="bg-white rounded-3xl p-5 border border-orange-100 shadow-sm space-y-2.5">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#F97316]" /> Transaction Notification Preferences
          </h3>
          <div className="space-y-2 pt-1 border-t border-orange-100">
            {(
              [
                ['txn_success', 'Transaction Successful Alerts', false],
                ['txn_failed', 'Transaction Failed Alerts', false],
                ['suspicious_txn', 'Suspicious Transaction Alerts (Required)', true],
                ['fraud_updates', 'Fraud Reporting Updates', false],
                ['login_alerts', 'Login Activity Alerts', false],
                ['email_notifications', 'Email Notifications', false],
                ['sms_notifications', 'SMS Notifications', false],
              ] as const
            ).map(([key, label, locked]) => (
              <label
                key={key}
                className="flex items-center justify-between text-xs text-gray-800 py-0.5"
              >
                <span className={locked ? 'font-semibold text-gray-900' : ''}>{label}</span>
                <input
                  type="checkbox"
                  checked={profile.notification_preferences[key]}
                  disabled={locked}
                  onChange={() => void handleTogglePref(key)}
                  className="accent-[#16A34A] w-4 h-4"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 6. PRIVACY & ACCOUNT SETTINGS */}
      {profile && (
        <div className="bg-white rounded-3xl p-5 border border-orange-100 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#16A34A]" /> Privacy & Account Settings
          </h3>

          <div className="space-y-2 text-xs pt-1 border-t border-orange-100">
            <label className="flex items-center justify-between">
              <span>Account & Fraud Monitoring Consent</span>
              <input
                type="checkbox"
                checked={profile.privacy.privacy_consent}
                onChange={() => void handleTogglePrivacy('privacy_consent')}
                className="accent-[#16A34A] w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between">
              <span>Optional Analytics Data Sharing</span>
              <input
                type="checkbox"
                checked={profile.privacy.data_sharing_opt_in}
                onChange={() => void handleTogglePrivacy('data_sharing_opt_in')}
                className="accent-[#16A34A] w-4 h-4"
              />
            </label>
          </div>

          <button
            onClick={() => setShowSupportForm(!showSupportForm)}
            className="w-full py-2 rounded-xl bg-[#FBF8F3] border border-orange-200 text-xs font-semibold text-gray-800 flex items-center justify-center gap-1.5"
          >
            <HelpCircle className="w-4 h-4 text-[#F97316]" /> Contact Support / Report an Issue
          </button>

          {showSupportForm && (
            <form onSubmit={(e) => void handleSupportSubmit(e)} className="space-y-2">
              <input
                type="text"
                required
                value={supportSubject}
                onChange={(e) => setSupportSubject(e.target.value)}
                placeholder="Issue Subject"
                className="w-full px-3 py-2 rounded-xl border border-orange-200 text-xs"
              />
              <textarea
                rows={2}
                required
                value={supportMsg}
                onChange={(e) => setSupportMsg(e.target.value)}
                placeholder="Describe your issue..."
                className="w-full px-3 py-2 rounded-xl border border-orange-200 text-xs"
              />
              <button
                type="submit"
                disabled={sendingSupport}
                className="w-full py-2 rounded-xl bg-[#F97316] text-white text-xs font-bold flex items-center justify-center gap-1"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                {sendingSupport ? 'Submitting...' : 'Submit Support Request'}
              </button>
            </form>
          )}

          <button
            onClick={onLogout}
            className="w-full py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-[#DC2626] font-semibold text-xs flex items-center justify-center gap-1.5 transition"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      )}
    </div>
  );
};
