import React, { useCallback, useEffect, useState } from 'react';
import {
  Terminal,
  Monitor,
  Smartphone,
  Zap,
  ShieldAlert,
  Bell,
  X,
} from 'lucide-react';
import type { Account, Transaction } from '../../types';
import { api } from '../../services/api';

const FRAUD_CATALOG = [
  { key: 'FAN_IN', label: 'Fan-In (Multiple Unrelated Senders -> Target)' },
  { key: 'FAN_OUT', label: 'Fan-Out (Random Mesh to F1..F50)' },
  { key: 'TRANSACTION_VELOCITY', label: 'Transaction Velocity (Random Mesh Burst)' },
  { key: 'NEW_ACCOUNT_HIGH_TXN', label: 'New Account High Transaction' },
  { key: 'UNRELATED_SENDERS', label: 'Funds from Unrelated Senders' },
  { key: 'HUGE_AMOUNT', label: 'Huge Amount Transfer' },
  { key: 'TRANSACTION_SPLITTING', label: 'Transaction Splitting (Random Mesh)' },
  { key: 'RAPID_PASSTHROUGH', label: 'Rapid Pass-through (Random Mesh)' },
];

type IncomingPayment = {
  transaction_id: string;
  sender_account_id: string;
  sender_name: string;
  receiver_account_id: string;
  receiver_name: string;
  amount_rupees: number;
  created_at: string;
};

export const FraudsterApp: React.FC = () => {
  const [device, setDevice] = useState<'PC' | 'PHONE'>(
    () => (localStorage.getItem('ft_fraudster_device') as 'PC' | 'PHONE') || 'PC'
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [partnersCount, setPartnersCount] = useState(0);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    () => localStorage.getItem('ft_fraudster_target') || ''
  );
  const [selectedFraudType, setSelectedFraudType] = useState<string>(
    () => localStorage.getItem('ft_fraudster_type') || 'FAN_OUT'
  );
  const [amount, setAmount] = useState<string>(
    () => localStorage.getItem('ft_fraudster_amount') || '6000'
  );
  const [lockedNotif, setLockedNotif] = useState<IncomingPayment | null>(() => {
    try {
      const raw = localStorage.getItem('ft_fraudster_locked_notif');
      return raw ? (JSON.parse(raw) as IncomingPayment) : null;
    } catch {
      return null;
    }
  });
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incomingNotifs, setIncomingNotifs] = useState<IncomingPayment[]>([]);
  const [lastResult, setLastResult] = useState<{
    fraud_type: string;
    target_account_id: string;
    transactions: Transaction[];
    alerts_triggered: Array<{ alert_id: string; rule_triggered: string; severity: string; reason: string }>;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [accs, partners, incoming] = await Promise.all([
        api.listAccounts(),
        api.listFraudsterPartners(),
        api.getFraudsterIncoming(),
      ]);
      const normalAccs = accs.filter((a) => a.account_type !== 'FRAUDSTER_PARTNER');
      setAccounts(normalAccs);
      setPartnersCount(partners.length);
      if (!selectedAccountId && normalAccs.length > 0) {
        setSelectedAccountId(normalAccs[0].account_id);
      }
      setIncomingNotifs(incoming);
    } catch {
      // silent
    }
  }, [selectedAccountId]);

  useEffect(() => {
    void loadData();
    const timer = setInterval(() => void loadData(), 3500);
    return () => clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    localStorage.setItem('ft_fraudster_device', device);
  }, [device]);

  useEffect(() => {
    if (selectedAccountId) localStorage.setItem('ft_fraudster_target', selectedAccountId);
  }, [selectedAccountId]);

  useEffect(() => {
    localStorage.setItem('ft_fraudster_type', selectedFraudType);
  }, [selectedFraudType]);

  useEffect(() => {
    localStorage.setItem('ft_fraudster_amount', amount);
  }, [amount]);

  useEffect(() => {
    if (lockedNotif) {
      localStorage.setItem('ft_fraudster_locked_notif', JSON.stringify(lockedNotif));
    } else {
      localStorage.removeItem('ft_fraudster_locked_notif');
    }
  }, [lockedNotif]);

  const handleSelectIncoming = (n: IncomingPayment) => {
    setLockedNotif(n);
    setSelectedAccountId(n.receiver_account_id);
    setAmount(String(n.amount_rupees));
    setError(null);
  };

  const handleExecute = async () => {
    const targetId = lockedNotif ? lockedNotif.receiver_account_id : selectedAccountId;
    const amtVal = lockedNotif ? lockedNotif.amount_rupees : Number(amount) || 6000;
    if (!targetId) return;
    setExecuting(true);
    setError(null);
    try {
      const res = await api.executeFraudAttack({
        target_account_id: targetId,
        fraud_type: selectedFraudType,
        amount_rupees: amtVal,
      });
      setLastResult(res);
      setLockedNotif(null);
      void loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attack blocked');
    } finally {
      setExecuting(false);
    }
  };

  const effectiveTargetId = lockedNotif ? lockedNotif.receiver_account_id : selectedAccountId;
  const targetAcc = accounts.find((a) => a.account_id === effectiveTargetId);

  return (
    <div className="min-h-screen bg-[#050A08] text-[#00FF66] font-mono p-4">
      <div
        className={`mx-auto transition-all ${
          device === 'PHONE'
            ? 'max-w-sm border-4 border-[#00FF66]/40 rounded-[2.2rem] p-4 bg-[#07110D]'
            : 'max-w-6xl space-y-5'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#00FF66]/30 pb-3">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-6 h-6 text-[#00FF66]" />
            <div>
              <h1 className="text-base font-bold tracking-wider">SHADOW_NET // FRAUDSTER_NODE</h1>
              <p className="text-[11px] text-[#00FF66]/70">
                DB_ACCESS: FULL • PARTNER_POOL: F1..F{partnersCount}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-[#0B1912] p-1 rounded-xl border border-[#00FF66]/30">
            <button
              onClick={() => setDevice('PC')}
              className={`px-3 py-1 rounded-lg text-xs flex items-center gap-1 ${
                device === 'PC' ? 'bg-[#00FF66] text-black font-bold' : 'text-[#00FF66]/70'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" /> PC
            </button>
            <button
              onClick={() => setDevice('PHONE')}
              className={`px-3 py-1 rounded-lg text-xs flex items-center gap-1 ${
                device === 'PHONE' ? 'bg-[#00FF66] text-black font-bold' : 'text-[#00FF66]/70'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" /> Phone
            </button>
          </div>
        </div>

        <div className={`grid gap-4 mt-4 ${device === 'PC' ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
          <div className="bg-[#0B1912] border border-[#00FF66]/30 rounded-2xl p-4 space-y-4">
            {lockedNotif ? (
              <div className="p-3 rounded-xl bg-[#050A08] border border-[#00FF66] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">AUTO-FILLED FROM RECEIVED PAYMENT</span>
                  <button
                    onClick={() => setLockedNotif(null)}
                    className="text-[#00FF66]/70 hover:text-[#00FF66]"
                    title="Clear auto-fill"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px]">
                  Paid By: {lockedNotif.sender_name} ({lockedNotif.sender_account_id})
                </p>
                <p className="text-[11px]">
                  Receiver (Active): {lockedNotif.receiver_name} ({lockedNotif.receiver_account_id})
                </p>
                <p className="text-xs font-bold">
                  Received Amount: ₹{lockedNotif.amount_rupees.toLocaleString('en-IN')}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-[11px] text-[#00FF66]/70 mb-1">
                    TARGET_ACCOUNT (ALL DB ACCOUNTS)
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full bg-[#050A08] border border-[#00FF66]/40 rounded-xl px-3 py-2.5 text-xs text-[#00FF66]"
                  >
                    {accounts.map((a) => (
                      <option key={a.account_id} value={a.account_id}>
                        {a.account_name} ({a.account_id}) — ₹{a.balance_rupees}
                        {a.account_type === 'FRAUDSTER' ? ' [FRAUDSTER]' : ''}
                        {a.is_frozen ? ' [FROZEN]' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[#00FF66]/70 mb-1">AMOUNT (₹)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-[#050A08] border border-[#00FF66]/40 rounded-xl px-3 py-2 text-xs text-[#00FF66]"
                  />
                </div>
              </>
            )}

            {targetAcc?.is_frozen && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-500 text-red-400 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>TARGET ACCOUNT FROZEN — ALL TRANSACTIONS BLOCKED BY BANKER</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] text-[#00FF66]/70 mb-1">
                SELECT FRAUD TYPE
              </label>
              <select
                value={selectedFraudType}
                onChange={(e) => setSelectedFraudType(e.target.value)}
                className="w-full bg-[#050A08] border border-[#00FF66]/40 rounded-xl px-3 py-2.5 text-xs text-[#00FF66]"
              >
                {FRAUD_CATALOG.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-950/70 border border-red-500 text-red-300 text-xs">
                ERROR: {error}
              </div>
            )}

            <button
              onClick={() => void handleExecute()}
              disabled={executing || Boolean(targetAcc?.is_frozen)}
              className="w-full py-3 rounded-xl bg-[#00FF66] text-black font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#00cc52] disabled:opacity-40"
            >
              <Zap className="w-4 h-4" />
              {executing ? 'EXECUTING...' : `GO AHEAD & EXECUTE ${selectedFraudType}`}
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-[#0B1912] border border-[#00FF66]/30 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold">
                <Bell className="w-4 h-4" /> RECEIVED PAYMENT MESSAGES (CLICK TO AUTO-FILL)
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {incomingNotifs.length === 0 ? (
                  <p className="text-[11px] opacity-60">No incoming payments received yet.</p>
                ) : (
                  incomingNotifs.map((n) => (
                    <button
                      key={n.transaction_id}
                      onClick={() => handleSelectIncoming(n)}
                      className={`w-full text-left p-2.5 rounded-xl bg-[#050A08] border text-[11px] transition ${
                        lockedNotif?.transaction_id === n.transaction_id
                          ? 'border-[#00FF66]'
                          : 'border-[#00FF66]/20 hover:border-[#00FF66]'
                      }`}
                    >
                      <div className="font-bold">
                        Received ₹{n.amount_rupees.toLocaleString('en-IN')} from {n.sender_name}
                      </div>
                      <div className="text-[10px] opacity-75">
                        To: {n.receiver_name} ({n.receiver_account_id}) • TXN: {n.transaction_id}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {lastResult && (
              <div className="bg-[#0B1912] border border-[#00FF66]/30 rounded-2xl p-4 space-y-2">
                <div className="text-xs font-bold">
                  EXECUTED: {lastResult.fraud_type} ({lastResult.transactions.length} TXNS)
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto text-[11px]">
                  {lastResult.transactions.map((t) => (
                    <div
                      key={t.transaction_id}
                      className="p-2 rounded-lg bg-[#050A08] border border-[#00FF66]/20"
                    >
                      <div>
                        {t.sender_account_id} ──(₹{t.amount_rupees})──▶ {t.receiver_account_id}
                      </div>
                      <div className="text-[10px] opacity-70">
                        TXN: {t.transaction_id} | {t.created_at}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
