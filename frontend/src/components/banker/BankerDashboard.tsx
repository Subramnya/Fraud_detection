import React, { useState } from 'react';
import {
  LayoutDashboard,
  ShieldAlert,
  FolderSearch,
  Lock,
  Bell,
  Search,
  CheckCircle2,
  XCircle,
  ExternalLink,
  X,
  RefreshCw,
} from 'lucide-react';
import type {
  AlertDetail,
  AppNotification,
  BankerTab,
  FraudAlert,
  FraudCase,
  FreezeRequest,
  SystemSummary,
} from '../../types';
import { api } from '../../services/api';
import { ConfirmDialog } from '../ConfirmDialog';

interface BankerDashboardProps {
  activeTab: BankerTab;
  onTabChange: (tab: BankerTab) => void;
  summary: SystemSummary | null;
  alerts: FraudAlert[];
  cases: FraudCase[];
  freezeRequests: FreezeRequest[];
  notifications: AppNotification[];
  unreadCount: number;
  onRefreshAll: () => void;
  onNotify: (type: 'success' | 'warning' | 'error' | 'info', title: string, msg: string) => void;
}

export const BankerDashboard: React.FC<BankerDashboardProps> = ({
  activeTab,
  onTabChange,
  summary,
  alerts,
  cases,
  freezeRequests,
  notifications,
  unreadCount,
  onRefreshAll,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');

  const [selectedAlert, setSelectedAlert] = useState<AlertDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [caseGraphInfo, setCaseGraphInfo] = useState<{
    caseId: string;
    nodes: number;
    edges: number;
  } | null>(null);

  const [freezeConfirm, setFreezeConfirm] = useState<{
    request: FreezeRequest;
    action: 'APPROVED_SIMULATED' | 'PARTIALLY_APPROVED_SIMULATED' | 'REJECTED';
    partialAmount?: number;
  } | null>(null);
  const [freezeLoading, setFreezeLoading] = useState(false);

  const severityOrder: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
  };

  const sortedAlerts = [...alerts]
    .filter((a) => {
      if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false;
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      if (dateFilter && a.created_at) {
        if (new Date(a.created_at).toISOString().slice(0, 10) !== dateFilter) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          a.alert_id.toLowerCase().includes(q) ||
          a.account_id.toLowerCase().includes(q) ||
          (a.transaction_id || '').toLowerCase().includes(q) ||
          a.reason.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      // Unresolved NEW alerts first, then by severity
      if (a.status === 'NEW' && b.status !== 'NEW') return -1;
      if (a.status !== 'NEW' && b.status === 'NEW') return 1;
      return (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
    });

  const openAlertDetail = async (alertId: string) => {
    setLoadingDetail(true);
    try {
      const detail = await api.getAlertDetail(alertId);
      setSelectedAlert(detail);
    } catch (err) {
      onNotify('error', 'Failed to load alert', err instanceof Error ? err.message : 'Error');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleReviewAlert = async (
    alertId: string,
    status: 'REVIEWED' | 'ESCALATED' | 'DISMISSED'
  ) => {
    try {
      await api.reviewAlert(alertId, { status, reviewer: 'Banker_Admin' });
      onNotify('success', 'Alert Updated', `Alert ${alertId} marked as ${status}.`);
      setSelectedAlert(null);
      onRefreshAll();
    } catch (err) {
      onNotify('error', 'Update Failed', err instanceof Error ? err.message : 'Error');
    }
  };

  const handleOpenInvestigation = async (detail: AlertDetail) => {
    if (!detail.transaction) return;
    try {
      const c = await api.reportFraud({
        reporting_account_id: detail.account_id,
        transaction_id: detail.transaction.transaction_id,
        fraud_category: 'PAYMENT_FRAUD',
        description: `Escalated by Banker from Alert ${detail.alert_id}: ${detail.reason}`,
      });
      await api.reviewAlert(detail.alert_id, {
        status: 'ESCALATED',
        reviewer: 'Banker_Admin',
        notes: `Opened case ${c.case_id}`,
      });
      onNotify('success', 'Investigation Opened', `Created Case ${c.case_id} with Trace ${c.trace_id}.`);
      setSelectedAlert(null);
      onRefreshAll();
      onTabChange('investigations');
    } catch (err) {
      onNotify('error', 'Failed to open case', err instanceof Error ? err.message : 'Error');
    }
  };

  const handleInspectGraph = async (caseId: string) => {
    try {
      const g = await api.getCaseGraph(caseId);
      setCaseGraphInfo({
        caseId,
        nodes: g.nodes.length,
        edges: g.edges.length,
      });
    } catch (err) {
      onNotify('error', 'Graph Error', err instanceof Error ? err.message : 'Error');
    }
  };

  const handleCreateFreeze = async (c: FraudCase) => {
    try {
      const fr = await api.createFreezeRequest({
        case_id: c.case_id,
        account_id: c.reporting_account_id,
        reason: `Simulated freeze review for case ${c.case_id}`,
      });
      onNotify(
        'info',
        'Simulated Freeze Request Created',
        `Request ${fr.request_id} (${fr.status})`
      );
      onRefreshAll();
      onTabChange('freeze');
    } catch (err) {
      onNotify('error', 'Freeze Request Failed', err instanceof Error ? err.message : 'Error');
    }
  };

  const executeFreezeReview = async () => {
    if (!freezeConfirm) return;
    setFreezeLoading(true);
    try {
      await api.reviewFreezeRequest(freezeConfirm.request.request_id, {
        status: freezeConfirm.action,
        reviewer: 'Banker_Admin',
        review_notes: `Decision (${freezeConfirm.action}) via Banker Desk`,
        approved_amount_rupees: freezeConfirm.partialAmount,
      });
      onNotify(
        'success',
        'Freeze Request Updated (Simulated)',
        `Request ${freezeConfirm.request.request_id} → ${freezeConfirm.action}`
      );
      setFreezeConfirm(null);
      onRefreshAll();
    } catch (err) {
      onNotify('error', 'Review Failed', err instanceof Error ? err.message : 'Error');
    } finally {
      setFreezeLoading(false);
    }
  };

  const severityBadge = (sev: string) => {
    if (sev === 'CRITICAL' || sev === 'HIGH') return 'bg-red-50 text-[#DC2626] border-red-200';
    if (sev === 'MEDIUM') return 'bg-orange-50 text-orange-700 border-orange-200';
    return 'bg-amber-50 text-amber-800 border-amber-200';
  };

  const navItems: Array<{ key: BankerTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      key: 'alerts',
      label: 'Live Alerts',
      icon: <ShieldAlert className="w-4 h-4" />,
      badge: summary?.open_alerts,
    },
    { key: 'investigations', label: 'Investigations', icon: <FolderSearch className="w-4 h-4" /> },
    {
      key: 'freeze',
      label: 'Freeze Requests',
      icon: <Lock className="w-4 h-4" />,
      badge: summary?.pending_freeze_requests,
    },
    {
      key: 'notifications',
      label: 'Notifications',
      icon: <Bell className="w-4 h-4" />,
      badge: unreadCount,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-5 space-y-5">
      {/* Banker Navigation Bar */}
      <div className="bg-white rounded-2xl p-2 border border-purple-100 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                activeTab === item.key
                  ? 'bg-[#351080] text-white'
                  : 'text-[#777184] hover:bg-[#F4F0FF] hover:text-[#201A32]'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-[#DC2626] text-white text-[10px] font-bold">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={onRefreshAll}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F4F0FF] text-[#5B2EFF] text-xs font-semibold hover:bg-purple-100"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* TAB 1: DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Transactions Monitored', value: summary?.total_transactions ?? 0, color: 'text-[#351080]' },
              { label: 'Suspicious Transactions', value: summary?.suspicious_transactions ?? 0, color: 'text-[#DC2626]' },
              { label: 'Open Fraud Alerts', value: summary?.open_alerts ?? 0, color: 'text-[#DC2626]' },
              { label: 'Cases Under Investigation', value: summary?.cases_under_investigation ?? 0, color: 'text-[#F59E0B]' },
              { label: 'Accounts Requiring Review', value: summary?.accounts_requiring_review ?? 0, color: 'text-[#5B2EFF]' },
              { label: 'Pending Freeze Requests', value: summary?.pending_freeze_requests ?? 0, color: 'text-[#351080]' },
            ].map((card) => (
              <div
                key={card.label}
                className="bg-white rounded-2xl p-4 border border-purple-100 shadow-xs"
              >
                <p className="text-[11px] font-medium text-[#777184]">{card.label}</p>
                <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-3xl p-5 border border-purple-100 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[#201A32]">Priority Live Fraud Alerts</h3>
              <button
                onClick={() => onTabChange('alerts')}
                className="text-xs font-semibold text-[#5B2EFF] hover:underline"
              >
                View All Alerts →
              </button>
            </div>
            {sortedAlerts.length === 0 ? (
              <p className="text-xs text-[#777184] py-6 text-center">
                No fraud alerts recorded yet.
              </p>
            ) : (
              <div className="space-y-2">
                {sortedAlerts.slice(0, 5).map((a) => (
                  <div
                    key={a.alert_id}
                    onClick={() => void openAlertDetail(a.alert_id)}
                    className="p-3 rounded-2xl border border-purple-100 hover:border-[#5B2EFF] cursor-pointer flex flex-wrap items-center justify-between gap-2 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${severityBadge(
                          a.severity
                        )}`}
                      >
                        {a.severity}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#201A32]">
                          {a.alert_id} • {a.account_id} ({a.rule_triggered})
                        </p>
                        <p className="text-[11px] text-[#777184] truncate">{a.reason}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#F4F0FF] text-[#351080]">
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: LIVE ALERTS */}
      {activeTab === 'alerts' && (
        <div className="bg-white rounded-3xl p-5 border border-purple-100 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-[#201A32]">Live Fraud Alerts</h3>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#777184] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search alert, account, txn..."
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-purple-200 text-xs"
                />
              </div>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-purple-200 text-xs"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-purple-200 text-xs"
              >
                <option value="ALL">All Statuses</option>
                <option value="NEW">NEW</option>
                <option value="REVIEWED">REVIEWED</option>
                <option value="ESCALATED">ESCALATED</option>
                <option value="DISMISSED">DISMISSED</option>
              </select>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-purple-200 text-xs"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-purple-100 text-[#777184]">
                  <th className="py-2.5 pr-3">Alert ID</th>
                  <th className="py-2.5 pr-3">Account</th>
                  <th className="py-2.5 pr-3">Transaction</th>
                  <th className="py-2.5 pr-3">Severity</th>
                  <th className="py-2.5 pr-3">Reason</th>
                  <th className="py-2.5 pr-3">Status</th>
                  <th className="py-2.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-50">
                {sortedAlerts.map((a) => (
                  <tr key={a.alert_id} className="hover:bg-[#F4F0FF]/40">
                    <td className="py-3 pr-3 font-mono font-semibold">{a.alert_id}</td>
                    <td className="py-3 pr-3 font-mono">{a.account_id}</td>
                    <td className="py-3 pr-3 font-mono">{a.transaction_id || '-'}</td>
                    <td className="py-3 pr-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${severityBadge(
                          a.severity
                        )}`}
                      >
                        {a.severity}
                      </span>
                    </td>
                    <td className="py-3 pr-3 max-w-xs truncate">{a.reason}</td>
                    <td className="py-3 pr-3 font-semibold">{a.status}</td>
                    <td className="py-3">
                      <button
                        onClick={() => void openAlertDetail(a.alert_id)}
                        className="text-[#5B2EFF] font-semibold hover:underline"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedAlerts.length === 0 && (
              <p className="text-center text-xs text-[#777184] py-8">
                No alerts match the current filters.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: INVESTIGATIONS */}
      {activeTab === 'investigations' && (
        <div className="bg-white rounded-3xl p-5 border border-purple-100 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-[#201A32]">Fraud Cases & Investigations</h3>
          {caseGraphInfo && (
            <div className="p-3.5 rounded-2xl bg-[#F4F0FF] border border-purple-200 flex items-center justify-between text-xs">
              <span>
                Graph for <strong>{caseGraphInfo.caseId}</strong>: {caseGraphInfo.nodes} connected
                account(s), {caseGraphInfo.edges} transaction edge(s) reconstructed from SQLite.
              </span>
              <button
                onClick={() => setCaseGraphInfo(null)}
                className="text-[#5B2EFF] font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}
          <div className="space-y-3">
            {cases.length === 0 ? (
              <p className="text-xs text-[#777184] py-6 text-center">No fraud cases open.</p>
            ) : (
              cases.map((c) => (
                <div
                  key={c.case_id}
                  className="p-4 rounded-2xl border border-purple-100 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-[#351080]">
                        {c.case_id}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">
                        {c.status}
                      </span>
                      {c.trace_id && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#F4F0FF] text-[#5B2EFF]">
                          {c.trace_id}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#777184]">
                      Account: <span className="font-mono">{c.reporting_account_id}</span> • Txn:{' '}
                      <span className="font-mono">{c.reported_transaction_id}</span> •{' '}
                      <strong>₹{c.reported_amount_rupees.toLocaleString('en-IN')}</strong> (
                      {c.fraud_category})
                    </p>
                    {c.description && <p className="text-xs text-[#201A32]">{c.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void handleInspectGraph(c.case_id)}
                      className="px-3 py-2 rounded-xl bg-[#F4F0FF] text-[#5B2EFF] text-xs font-semibold flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Graph Summary
                    </button>
                    <button
                      onClick={() => void handleCreateFreeze(c)}
                      className="px-3 py-2 rounded-xl bg-[#351080] text-white text-xs font-semibold"
                    >
                      Request Freeze (Sim)
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: FREEZE REQUESTS */}
      {activeTab === 'freeze' && (
        <div className="bg-white rounded-3xl p-5 border border-purple-100 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#201A32]">
                Simulated Freeze Requests
              </h3>
              <p className="text-xs text-[#777184]">
                All freeze actions are SIMULATED for prototype review — no real bank accounts are
                frozen.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {freezeRequests.length === 0 ? (
              <p className="text-xs text-[#777184] py-6 text-center">No freeze requests found.</p>
            ) : (
              freezeRequests.map((fr) => (
                <div
                  key={fr.request_id}
                  className="p-4 rounded-2xl border border-purple-100 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-[#351080]">
                        {fr.request_id}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F4F0FF] text-[#5B2EFF]">
                        {fr.status}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-[#777184]">
                        SIMULATED
                      </span>
                    </div>
                    <p className="text-xs text-[#777184]">
                      Case: <span className="font-mono">{fr.case_id}</span> • Account:{' '}
                      <span className="font-mono">{fr.account_id}</span>
                    </p>
                    <p className="text-xs text-[#201A32]">
                      Suggested: <strong>₹{fr.suggested_amount_rupees.toLocaleString('en-IN')}</strong>{' '}
                      • Traceable: ₹{fr.traceable_balance_rupees.toLocaleString('en-IN')} •
                      Available: ₹{fr.available_balance_rupees.toLocaleString('en-IN')}
                    </p>
                  </div>

                  {fr.status === 'PENDING_REVIEW' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setFreezeConfirm({ request: fr, action: 'APPROVED_SIMULATED' })
                        }
                        className="px-3 py-2 rounded-xl bg-[#16A34A] text-white text-xs font-semibold flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve (Sim)
                      </button>
                      <button
                        onClick={() =>
                          setFreezeConfirm({
                            request: fr,
                            action: 'PARTIALLY_APPROVED_SIMULATED',
                            partialAmount: Math.max(1, Math.round(fr.suggested_amount_rupees / 2)),
                          })
                        }
                        className="px-3 py-2 rounded-xl bg-[#F59E0B] text-white text-xs font-semibold"
                      >
                        Partial (Sim)
                      </button>
                      <button
                        onClick={() => setFreezeConfirm({ request: fr, action: 'REJECTED' })}
                        className="px-3 py-2 rounded-xl bg-red-50 text-[#DC2626] text-xs font-semibold flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: BANKER NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className="bg-white rounded-3xl p-5 border border-purple-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#201A32]">Banker Alert Notifications</h3>
            <button
              onClick={async () => {
                await api.markAllNotificationsRead('BANKER');
                onRefreshAll();
              }}
              className="text-xs font-semibold text-[#5B2EFF] hover:underline"
            >
              Mark all read
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="text-xs text-[#777184] py-6 text-center">No banker notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.notification_id}
                className="p-3.5 rounded-2xl border border-purple-100 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${severityBadge(
                        n.severity
                      )}`}
                    >
                      {n.severity}
                    </span>
                    <span className="text-xs font-bold text-[#201A32]">{n.title}</span>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-[#5B2EFF]" />}
                  </div>
                  <p className="text-xs text-[#777184] mt-1">{n.message}</p>
                </div>
                {n.alert_id && (
                  <button
                    onClick={() => void openAlertDetail(n.alert_id!)}
                    className="px-3 py-1.5 rounded-xl bg-[#F4F0FF] text-[#5B2EFF] text-xs font-semibold shrink-0"
                  >
                    View Alert
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ALERT DETAIL MODAL */}
      {(selectedAlert || loadingDetail) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#201A32]">
                {loadingDetail ? 'Loading Alert...' : `Alert ${selectedAlert?.alert_id}`}
              </h3>
              <button
                onClick={() => setSelectedAlert(null)}
                className="text-[#777184] hover:text-[#201A32]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedAlert && (
              <>
                <div className="bg-[#F4F0FF]/70 rounded-2xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#777184]">Account</span>
                    <span className="font-mono font-semibold">{selectedAlert.account_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#777184]">Triggered Rule</span>
                    <span className="font-semibold">{selectedAlert.rule_triggered}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#777184]">Severity / Risk Score</span>
                    <span className="font-bold text-[#DC2626]">
                      {selectedAlert.severity} ({selectedAlert.risk_score.toFixed(2)})
                    </span>
                  </div>
                  <div>
                    <span className="text-[#777184]">Detection Reason:</span>
                    <p className="text-[#201A32] mt-0.5">{selectedAlert.reason}</p>
                  </div>
                  {selectedAlert.transaction && (
                    <div className="pt-2 border-t border-purple-200 space-y-1">
                      <p className="font-bold text-[#351080]">Related Transaction</p>
                      <p>
                        ID: <span className="font-mono">{selectedAlert.transaction.transaction_id}</span>
                      </p>
                      <p>
                        {selectedAlert.transaction.sender_account_id} →{' '}
                        {selectedAlert.transaction.receiver_account_id} (
                        <strong>
                          ₹{selectedAlert.transaction.amount_rupees.toLocaleString('en-IN')}
                        </strong>
                        )
                      </p>
                    </div>
                  )}
                  {selectedAlert.related_case_id && (
                    <p className="text-[#5B2EFF] font-semibold">
                      Linked Case: {selectedAlert.related_case_id}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void handleReviewAlert(selectedAlert.alert_id, 'REVIEWED')}
                    className="flex-1 py-2.5 rounded-xl bg-[#5B2EFF] text-white text-xs font-semibold"
                  >
                    Mark as Reviewed
                  </button>
                  {!selectedAlert.related_case_id && selectedAlert.transaction && (
                    <button
                      onClick={() => void handleOpenInvestigation(selectedAlert)}
                      className="flex-1 py-2.5 rounded-xl bg-[#DC2626] text-white text-xs font-semibold"
                    >
                      Open Investigation
                    </button>
                  )}
                  <button
                    onClick={() => void handleReviewAlert(selectedAlert.alert_id, 'DISMISSED')}
                    className="px-4 py-2.5 rounded-xl bg-gray-100 text-[#777184] text-xs font-semibold"
                  >
                    Dismiss
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* FREEZE CONFIRMATION DIALOG */}
      <ConfirmDialog
        open={Boolean(freezeConfirm)}
        title={`Confirm ${freezeConfirm?.action || ''} (SIMULATED)`}
        description={`Are you sure you want to mark simulated freeze request ${
          freezeConfirm?.request.request_id || ''
        } for account ${freezeConfirm?.request.account_id || ''} as ${
          freezeConfirm?.action || ''
        }? No real bank account will be affected.`}
        confirmLabel="Confirm Decision"
        variant={freezeConfirm?.action === 'REJECTED' ? 'danger' : 'purple'}
        loading={freezeLoading}
        onConfirm={() => void executeFreezeReview()}
        onCancel={() => setFreezeConfirm(null)}
      />
    </div>
  );
};
