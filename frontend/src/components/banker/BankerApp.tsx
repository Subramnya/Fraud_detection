import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  ShieldAlert,
  Lock,
  Plus,
  Minus,
  RefreshCw,
  Bell,
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react';
import type { FreezeRequest, SystemSummary } from '../../types';
import { api } from '../../services/api';

type BankerAccountRow = {
  account_id: string;
  account_name: string;
  balance_rupees: number;
  is_active: boolean;
  is_frozen: boolean;
  account_type: string;
  open_alerts: number;
  latest_transaction: {
    transaction_id: string;
    trace_id?: string;
    type: 'CREDIT' | 'DEBIT';
    amount_rupees: number;
    timestamp: string;
    peer_account_id: string;
  } | null;
};

type PrioritizedAlert = Awaited<ReturnType<typeof api.getBankerPrioritizedAlerts>>[number];

export const BankerApp: React.FC = () => {
  const [accounts, setAccounts] = useState<BankerAccountRow[]>([]);
  const [prioritizedAlerts, setPrioritizedAlerts] = useState<PrioritizedAlert[]>([]);
  const [freezeRequests, setFreezeRequests] = useState<FreezeRequest[]>([]);
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [adjustAmounts, setAdjustAmounts] = useState<Record<string, string>>({});
  const [expandedAlertUsers, setExpandedAlertUsers] = useState<Record<string, boolean>>({});
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [accs, al, fr, sum] = await Promise.all([
        api.getBankerAccounts(),
        api.getBankerPrioritizedAlerts(),
        api.listFreezeRequests(),
        api.getSystemSummary(),
      ]);
      setAccounts(accs);
      setPrioritizedAlerts(al);
      setFreezeRequests(fr);
      setSummary(sum);
    } catch {
      // silent during poll
    }
  }, []);

  useEffect(() => {
    void loadAll();
    const timer = setInterval(() => void loadAll(), 3500);
    return () => clearInterval(timer);
  }, [loadAll]);

  const handleAdjust = async (accId: string, action: 'ADD' | 'DEDUCT') => {
    const amt = Number(adjustAmounts[accId] || '1000');
    if (!amt || amt <= 0) return;
    try {
      await api.adjustBankerAccount(accId, action, amt);
      setStatusMsg(`${action === 'ADD' ? 'Added' : 'Deducted'} ₹${amt} on ${accId}`);
      void loadAll();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Adjustment failed');
    }
  };

  const handleFreeze = async (accId: string) => {
    try {
      const res = await api.freezeBankerAccount(accId);
      setStatusMsg(
        `FROZEN ${accId}. All transactions stopped & report (Case ${res.case_id || 'N/A'}) sent to user.`
      );
      void loadAll();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Freeze failed');
    }
  };

  const handleDeleteFrozen = async (accId: string) => {
    try {
      await api.deleteAccount(accId);
      setStatusMsg(`Deleted frozen account ${accId}.`);
      void loadAll();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const riskBadgeStyle = (cat: string) => {
    if (cat === 'CRITICAL') return 'bg-[#DC2626] text-white';
    if (cat === 'HIGH') return 'bg-[#F97316] text-white';
    if (cat === 'MEDIUM') return 'bg-amber-100 text-amber-900 border border-amber-300';
    return 'bg-green-100 text-[#16A34A]';
  };

  return (
    <div className="min-h-screen bg-[#FBF8F3] text-gray-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="bg-white rounded-3xl p-5 border border-orange-100 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#16A34A] text-white flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold">FraudTrace Banker Real-Time Desk</h1>
              <p className="text-xs text-gray-500">
                AI Risk-Prioritized Live Alerts • Expandable 5-Factor Breakdown • Cyber Cell Forwarding
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="px-3 py-1.5 rounded-xl bg-orange-50 text-[#F97316] font-bold">
              Alerted Users: {prioritizedAlerts.length}
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-red-50 text-[#DC2626] font-bold">
              Freeze Requests: {summary?.pending_freeze_requests ?? 0}
            </span>
            <button
              onClick={() => void loadAll()}
              className="p-2 rounded-xl bg-green-50 text-[#16A34A]"
              aria-label="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {statusMsg && (
          <div className="p-3.5 rounded-2xl bg-green-50 border border-green-200 text-xs font-semibold text-[#16A34A]">
            {statusMsg}
          </div>
        )}

        {/* Real-Time Accounts Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((a) => (
            <div
              key={a.account_id}
              className={`bg-white rounded-3xl p-4 border shadow-xs space-y-3 ${
                a.is_frozen
                  ? 'border-[#DC2626] bg-red-50/30'
                  : a.open_alerts > 0
                  ? 'border-[#F97316]'
                  : 'border-orange-100'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-gray-900">{a.account_name}</p>
                  <p className="text-xs font-mono text-gray-500">{a.account_id}</p>
                </div>
                {a.is_frozen ? (
                  <span className="px-2 py-0.5 rounded-full bg-[#DC2626] text-white text-[10px] font-bold">
                    FROZEN
                  </span>
                ) : a.open_alerts > 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-[#F97316] text-white text-[10px] font-bold">
                    ALERTED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-green-50 text-[#16A34A] text-[10px] font-bold">
                    ACTIVE
                  </span>
                )}
              </div>

              <div>
                <p className="text-[11px] text-gray-500">Current Balance</p>
                <p className="text-2xl font-bold text-[#16A34A]">
                  ₹{a.balance_rupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>

              {a.latest_transaction ? (
                <div className="p-2.5 rounded-2xl bg-[#FBF8F3] border border-orange-100">
                  <p className="text-xs font-semibold">
                    Latest{' '}
                    <span
                      className={
                        a.latest_transaction.type === 'CREDIT'
                          ? 'text-[#16A34A]'
                          : 'text-[#DC2626]'
                      }
                    >
                      {a.latest_transaction.type}
                    </span>
                    : ₹{a.latest_transaction.amount_rupees.toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {new Date(a.latest_transaction.timestamp).toLocaleString()} •{' '}
                    {a.latest_transaction.transaction_id}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-gray-400">No transactions yet</p>
              )}

              <div className="flex gap-1.5">
                <input
                  type="number"
                  min="1"
                  placeholder="₹1000"
                  value={adjustAmounts[a.account_id] || ''}
                  onChange={(e) =>
                    setAdjustAmounts((prev) => ({ ...prev, [a.account_id]: e.target.value }))
                  }
                  className="w-24 px-2.5 py-1.5 rounded-xl border border-orange-200 text-xs"
                />
                <button
                  onClick={() => void handleAdjust(a.account_id, 'ADD')}
                  className="flex-1 py-1.5 rounded-xl bg-green-50 text-[#16A34A] text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
                <button
                  onClick={() => void handleAdjust(a.account_id, 'DEDUCT')}
                  className="flex-1 py-1.5 rounded-xl bg-orange-50 text-[#F97316] text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Minus className="w-3 h-3" /> Deduct
                </button>
              </div>

              {!a.is_frozen ? (
                <button
                  onClick={() => void handleFreeze(a.account_id)}
                  className="w-full py-2 rounded-xl bg-[#DC2626] hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" /> Freeze Account & Send Report
                </button>
              ) : (
                <button
                  onClick={() => void handleDeleteFrozen(a.account_id)}
                  className="w-full py-2 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Frozen Account
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Risk-Prioritized Live Alerts + Freeze Requests */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-3xl p-5 border border-orange-100 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#F97316]" /> Live Alerts
              </h2>
              <span className="text-[11px] font-semibold text-gray-500">
                Sorted by AI Risk Priority (Critical → Low)
              </span>
            </div>

            <div className="space-y-2.5 max-h-[540px] overflow-y-auto">
              {prioritizedAlerts.length === 0 ? (
                <p className="text-xs text-gray-500">No active fraud alerts.</p>
              ) : (
                prioritizedAlerts.map((al, idx) => {
                  const expanded = Boolean(expandedAlertUsers[al.account_id]);
                  const ra = al.risk_assessment;
                  return (
                    <div
                      key={al.account_id}
                      className="p-3.5 rounded-2xl bg-[#FBF8F3] border border-orange-200 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-bold text-gray-500">#{idx + 1}</span>
                            <button
                              onClick={() =>
                                setExpandedAlertUsers((prev) => ({
                                  ...prev,
                                  [al.account_id]: !expanded,
                                }))
                              }
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${riskBadgeStyle(
                                al.risk_category
                              )}`}
                            >
                              {al.risk_score}/100 • {al.risk_category}
                            </button>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-orange-200">
                              {al.status}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-gray-900">
                            {al.account_name} ({al.account_id})
                          </p>
                          <p className="text-[11px] text-gray-700 font-mono">
                            Txn: {al.transaction_id || '-'} • ₹
                            {al.amount_rupees.toLocaleString('en-IN')}
                          </p>
                          <p className="text-[11px] text-gray-600">{al.primary_reason}</p>
                          {al.last_activity_at && (
                            <p className="text-[10px] text-gray-400">
                              Last activity: {new Date(al.last_activity_at).toLocaleString()}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <div className="flex items-center gap-1">
                            {!al.is_frozen && (
                              <button
                                onClick={() => void handleFreeze(al.account_id)}
                                className="px-2.5 py-1.5 rounded-xl bg-[#DC2626] text-white text-[11px] font-bold"
                              >
                                Freeze
                              </button>
                            )}
                            <button
                              onClick={() =>
                                setExpandedAlertUsers((prev) => ({
                                  ...prev,
                                  [al.account_id]: !expanded,
                                }))
                              }
                              className="p-1.5 rounded-lg bg-white border border-orange-200 text-gray-700"
                              aria-label="Expand risk explanation"
                            >
                              {expanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {expanded && (
                        <div className="pt-2.5 border-t border-orange-200 space-y-2.5 text-[11px]">
                          <p className="font-bold text-gray-900">
                            Why has this transaction/account been flagged?
                          </p>

                          {/* 5-Factor Breakdown Table */}
                          <div className="bg-white rounded-xl border border-orange-100 overflow-hidden">
                            <table className="w-full text-left text-[10px]">
                              <thead className="bg-orange-50 text-gray-600">
                                <tr>
                                  <th className="p-2">Risk Factor</th>
                                  <th className="p-2">Score</th>
                                  <th className="p-2">Weight</th>
                                  <th className="p-2">Contribution</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-orange-50">
                                {ra.factors.map((f) => (
                                  <tr key={f.factor}>
                                    <td className="p-2 font-semibold">{f.factor}</td>
                                    <td className="p-2">{f.score}/100</td>
                                    <td className="p-2">{f.weight}%</td>
                                    <td className="p-2 font-bold text-[#DC2626]">
                                      {f.contribution}/{f.max_contribution}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="px-2 py-1.5 bg-orange-50/70 font-bold text-[11px] flex justify-between">
                              <span>Final Risk Score ({ra.model_version})</span>
                              <span className="text-[#DC2626]">
                                {ra.overall_score}/100 ({ra.risk_category})
                              </span>
                            </div>
                          </div>

                          {/* Supporting Observations */}
                          <div className="space-y-1">
                            <p className="font-semibold text-gray-700">Supporting Observations:</p>
                            <ul className="list-disc pl-4 space-y-0.5 text-gray-600">
                              {ra.observations.map((obs, i) => (
                                <li key={i}>{obs}</li>
                              ))}
                            </ul>
                          </div>

                          {/* Underlying Alert Events */}
                          <div className="space-y-1">
                            <p className="font-semibold text-gray-700">Flagged Transactions:</p>
                            {al.supporting_alerts.map((sa) => (
                              <div
                                key={sa.alert_id}
                                className="p-2 rounded-lg bg-white border border-orange-100 text-[10px]"
                              >
                                <span className="font-bold">{sa.rule_triggered}</span> • Txn:{' '}
                                {sa.transaction_id || '-'} — {sa.reason}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 border border-orange-100 space-y-3">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#DC2626]" /> Incoming User Freeze Requests
            </h2>
            <div className="space-y-2 max-h-[540px] overflow-y-auto">
              {freezeRequests.length === 0 ? (
                <p className="text-xs text-gray-500">No freeze requests yet.</p>
              ) : (
                freezeRequests.map((fr) => (
                  <div
                    key={fr.request_id}
                    className="p-3 rounded-2xl bg-red-50/50 border border-red-200 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-xs font-bold">
                        {fr.request_id} • {fr.account_id}
                      </p>
                      <p className="text-[11px] text-gray-600">
                        Status: {fr.status} • {fr.reason}
                      </p>
                    </div>
                    {fr.status === 'PENDING_REVIEW' && (
                      <button
                        onClick={() => void handleFreeze(fr.account_id)}
                        className="px-3 py-1.5 rounded-xl bg-[#DC2626] text-white text-[11px] font-bold shrink-0"
                      >
                        Freeze & Report
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
