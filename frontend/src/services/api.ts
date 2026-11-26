import type {
  Account,
  AlertDetail,
  AppNotification,
  FraudAlert,
  FraudCase,
  FreezeRequest,
  ParsedQR,
  SystemSummary,
  Transaction,
} from '../types';

// Use Vite's same-origin proxy by default so public port forwarding works.
// Set VITE_API_BASE_URL only when the browser should call a separately hosted API.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

const DEFAULT_TIMEOUT_MS = 25000;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retries = 1
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      let detail = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        detail = body.detail || detail;
      } catch {
        // ignore JSON parse failure
      }
      throw new ApiError(detail, res.status);
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (retries > 0 && (!options.method || options.method === 'GET')) {
      return request<T>(path, options, retries - 1);
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request timed out. Please check if the FraudTrace backend is running.', 408);
    }
    throw new ApiError(
      'Unable to reach FraudTrace backend. Please verify the server is running.',
      503
    );
  } finally {
    clearTimeout(timer);
  }
}

export function parseFraudTraceQR(raw: string): ParsedQR | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('FRAUDTRACE:PAY:')) {
    const accountId = trimmed.replace('FRAUDTRACE:PAY:', '').trim();
    if (!accountId) return null;
    return { scheme: 'FRAUDTRACE', recipient_account_id: accountId };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (
      parsed &&
      parsed.payment_scheme === 'FRAUDTRACE' &&
      typeof parsed.recipient_account_id === 'string'
    ) {
      return {
        scheme: 'FRAUDTRACE',
        recipient_account_id: parsed.recipient_account_id.trim(),
        display_name: parsed.display_name,
      };
    }
  } catch {
    // not JSON
  }

  return null;
}

export const api = {
  getHealth: () => request<{ status: string; warning?: string }>('/health'),
  getSystemSummary: () => request<SystemSummary>('/api/system/summary'),

  listAccounts: () => request<Account[]>('/api/accounts'),
  getAccount: (accountId: string) => request<Account>(`/api/accounts/${accountId}`),
  getBalance: (accountId: string) =>
    request<{ account_id: string; balance_rupees: number; balance_paise: number }>(
      `/api/accounts/${accountId}/balance`
    ),
  registerAccount: (payload: {
    name: string;
    email: string;
    phone?: string;
    initial_balance_rupees: number;
    account_type?: 'NORMAL' | 'FRAUDSTER';
  }) =>
    request<Account>('/api/accounts/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAccountRole: (accountId: string, account_type: 'NORMAL' | 'FRAUDSTER') =>
    request<{ account_id: string; account_type: string }>(`/api/accounts/${accountId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ account_type }),
    }),
  deleteAccount: (accountId: string) =>
    request<{ deleted: boolean; account_id: string }>(`/api/accounts/${accountId}`, {
      method: 'DELETE',
    }),
  checkAccountFraudWarning: (accountId: string) =>
    request<{
      account_id: string;
      detected_earlier: boolean;
      alert_count: number;
      case_count: number;
    }>(`/api/accounts/${accountId}/fraud-warning`),
  topupVirtualMoney: (accountId: string, amount_rupees: number) =>
    request<{ account_id: string; added_rupees: number; balance_rupees: number; simulated: boolean }>(
      `/api/accounts/${accountId}/topup`,
      {
        method: 'POST',
        body: JSON.stringify({ amount_rupees }),
      }
    ),

  sendPayment: (payload: {
    sender_account_id: string;
    receiver_account_id: string;
    amount_rupees: number;
    description?: string;
  }) =>
    request<Transaction>('/api/payments/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getPaymentHistory: (accountId?: string) =>
    request<{ account_id?: string; transactions: Transaction[]; total_count: number }>(
      accountId
        ? `/api/payments/history?account_id=${encodeURIComponent(accountId)}`
        : '/api/payments/history'
    ),

  reportFraud: (payload: {
    reporting_account_id: string;
    transaction_id: string;
    fraud_category: 'PAYMENT_FRAUD' | 'UNAUTHORIZED_DEBIT';
    description?: string;
    device_info?: string;
  }) =>
    request<FraudCase>('/api/fraud/report', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listCases: () => request<FraudCase[]>('/api/fraud/cases'),
  listAlerts: (accountId?: string, severity?: string) => {
    const params = new URLSearchParams();
    if (accountId) params.set('account_id', accountId);
    if (severity) params.set('severity', severity);
    const qs = params.toString();
    return request<FraudAlert[]>(`/api/fraud/alerts${qs ? `?${qs}` : ''}`);
  },
  getAlertDetail: (alertId: string) =>
    request<AlertDetail>(`/api/fraud/alerts/${alertId}`),
  reviewAlert: (
    alertId: string,
    payload: { status: 'REVIEWED' | 'ESCALATED' | 'DISMISSED'; reviewer: string; notes?: string }
  ) =>
    request<{ alert_id: string; status: string; reviewer: string }>(
      `/api/fraud/alerts/${alertId}/review`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  getCaseGraph: (caseId: string) =>
    request<{ nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> }>(
      `/api/graph/case/${caseId}`
    ),

  listFreezeRequests: (caseId?: string) =>
    request<FreezeRequest[]>(
      caseId
        ? `/api/freeze/requests?case_id=${encodeURIComponent(caseId)}`
        : '/api/freeze/requests'
    ),
  createFreezeRequest: (payload: {
    case_id: string;
    account_id: string;
    reason?: string;
  }) =>
    request<FreezeRequest>('/api/freeze/request', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  reviewFreezeRequest: (
    requestId: string,
    payload: {
      status: 'APPROVED_SIMULATED' | 'PARTIALLY_APPROVED_SIMULATED' | 'REJECTED';
      reviewer: string;
      review_notes?: string;
      approved_amount_rupees?: number;
    }
  ) =>
    request<FreezeRequest>(`/api/freeze/requests/${requestId}/review`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listNotifications: (role: 'CUSTOMER' | 'BANKER', accountId?: string) => {
    const params = new URLSearchParams({ role });
    if (role === 'CUSTOMER' && accountId) params.set('account_id', accountId);
    return request<{ notifications: AppNotification[]; unread_count: number }>(
      `/api/notifications?${params.toString()}`
    );
  },
  markNotificationRead: (notificationId: string) =>
    request<{ notification_id: string; is_read: boolean }>(
      `/api/notifications/${notificationId}/read`,
      { method: 'POST' }
    ),
  markAllNotificationsRead: (role: 'CUSTOMER' | 'BANKER', accountId?: string) => {
    const params = new URLSearchParams({ role });
    if (role === 'CUSTOMER' && accountId) params.set('account_id', accountId);
    return request<{ marked_read: number }>(
      `/api/notifications/read-all?${params.toString()}`,
      { method: 'POST' }
    );
  },

  getSamSimulationAccount: () =>
    request<{
      account_id: string;
      user_id: string;
      username: string;
      display_name: string;
      account_name: string;
      account_type: string;
      label: string;
      balance_rupees: number;
      is_active: boolean;
    }>('/api/simulation/sam'),

  runSamScenario: (
    scenario:
      | 'FAN_IN'
      | 'FAN_OUT'
      | 'HIGH_VELOCITY'
      | 'TRANSACTION_SPLITTING'
      | 'RAPID_PASSTHROUGH'
  ) =>
    request<{
      scenario: string;
      label: string;
      sam_account_id: string;
      sam_balance_rupees: number;
      transactions: Transaction[];
      alerts_detected: Array<{
        alert_id: string;
        account_id: string;
        transaction_id: string;
        rule_triggered: string;
        severity: string;
        risk_score: number;
        reason: string;
      }>;
      detection_note?: string | null;
    }>('/api/simulation/sam/scenario', {
      method: 'POST',
      body: JSON.stringify({ scenario }),
    }),

  listFraudsterPartners: () =>
    request<Array<{ account_id: string; name: string; balance_rupees: number; is_frozen: boolean }>>(
      '/api/fraudster/partners'
    ),
  getFraudsterIncoming: () =>
    request<
      Array<{
        transaction_id: string;
        sender_account_id: string;
        sender_name: string;
        receiver_account_id: string;
        receiver_name: string;
        amount_rupees: number;
        created_at: string;
      }>
    >('/api/fraudster/incoming'),
  executeFraudAttack: (payload: {
    target_account_id: string;
    fraud_type: string;
    amount_rupees: number;
  }) =>
    request<{
      fraud_type: string;
      target_account_id: string;
      transactions: Transaction[];
      alerts_triggered: Array<{
        alert_id: string;
        rule_triggered: string;
        severity: string;
        risk_score: number;
        reason: string;
      }>;
      graph: {
        nodes: Array<Record<string, unknown>>;
        edges: Array<Record<string, unknown>>;
        final_destination_accounts?: string[];
      };
    }>('/api/fraudster/attack', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getBankerAccounts: () =>
    request<
      Array<{
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
      }>
    >('/api/banker/accounts'),
  adjustBankerAccount: (accountId: string, action: 'ADD' | 'DEDUCT', amount_rupees: number) =>
    request<{ account_id: string; balance_rupees: number }>(
      `/api/banker/accounts/${accountId}/adjust`,
      {
        method: 'POST',
        body: JSON.stringify({ action, amount_rupees }),
      }
    ),
  freezeBankerAccount: (accountId: string, reason?: string) =>
    request<{ account_id: string; is_frozen: boolean; case_id?: string; report?: unknown }>(
      `/api/banker/accounts/${accountId}/freeze`,
      {
        method: 'POST',
        body: JSON.stringify({ reason: reason || 'Frozen by Banker due to suspicious activity' }),
      }
    ),
  getBankerPrioritizedAlerts: () =>
    request<
      Array<{
        account_id: string;
        account_name: string;
        is_frozen: boolean;
        alert_id: string;
        transaction_id?: string | null;
        amount_rupees: number;
        risk_score: number;
        risk_category: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | string;
        primary_reason: string;
        status: string;
        last_activity_at?: string | null;
        risk_assessment: {
          assessment_id: string;
          overall_score: number;
          risk_category: string;
          factors: Array<{
            factor: string;
            score: number;
            weight: number;
            contribution: number;
            max_contribution: number;
          }>;
          observations: string[];
          explanation: string;
          model_version: string;
          created_at?: string | null;
        };
        supporting_alerts: Array<{
          alert_id: string;
          transaction_id?: string | null;
          rule_triggered: string;
          severity: string;
          reason: string;
          created_at?: string | null;
        }>;
      }>
    >('/api/banker/alerts/prioritized'),

  submitToCyberCell: (payload: {
    account_id: string;
    case_id?: string;
    submitted_by: string;
    fraud_type: string;
    summary: string;
  }) =>
    request<{ report_id: string; status: string }>('/api/cybercell/report', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listCyberCellReports: () =>
    request<
      Array<{
        report_id: string;
        case_id?: string;
        account_id: string;
        submitted_by: string;
        fraud_type: string;
        summary: string;
        report_payload?: Record<string, unknown> | null;
        status: string;
        created_at: string;
      }>
    >('/api/cybercell/reports'),
  updateCyberCellStatus: (reportId: string, status: 'PENDING' | 'INVESTIGATING' | 'RESOLVED') =>
    request<{ report_id: string; status: string }>(`/api/cybercell/reports/${reportId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  getCyberCellReportGraph: (reportId: string) =>
    request<{
      available?: boolean;
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
      final_destination_accounts?: string[];
    }>(`/api/cybercell/reports/${reportId}/graph`),

  getAiLiveFeed: () =>
    request<{
      fraud_detected: boolean;
      alerts: Array<{
        alert_id: string;
        account_id: string;
        account_name: string;
        is_frozen: boolean;
        transaction_id: string;
        rule_triggered: string;
        severity: string;
        risk_score: number;
        reason: string;
        status: string;
        created_at: string;
      }>;
      tracked_transactions: Array<{
        transaction_id: string;
        trace_id?: string;
        sender_account_id: string;
        receiver_account_id: string;
        amount_rupees: number;
        created_at: string;
      }>;
      graph: {
        nodes: Array<Record<string, unknown>>;
        edges: Array<Record<string, unknown>>;
        final_destination_accounts?: string[];
      };
      model_info: string;
    }>('/api/ai/live'),

  getDbLive: () =>
    request<{
      counts: Record<string, number>;
      accounts: Array<Record<string, unknown>>;
      transactions: Array<Record<string, unknown>>;
      alerts: Array<Record<string, unknown>>;
      cli_logs: string[];
      cybercell_reports: Array<Record<string, unknown>>;
    }>('/api/db/live'),

  // Realistic Banking Profile APIs
  getUserProfile: (accountId: string) =>
    request<{
      personal: {
        user_id: string;
        full_name: string;
        email: string;
        phone: string;
        date_of_birth: string;
        address: string;
      };
      bank_account: {
        account_id: string;
        masked_account_number: string;
        account_holder_name: string;
        account_type: string;
        bank_name: string;
        branch_name: string;
        ifsc_code: string;
        opened_at: string;
        status: string;
      };
      kyc: {
        overall_status: string;
        mobile_verified: boolean;
        email_verified: boolean;
        verified_at: string;
      };
      security: {
        password_configured: boolean;
        two_factor_enabled: boolean;
        two_factor_status: string;
        last_successful_login: string;
        recent_logins: Array<{
          activity_id: string;
          status: string;
          device_info: string;
          ip_address: string;
          timestamp: string;
        }>;
      };
      notification_preferences: {
        txn_success: boolean;
        txn_failed: boolean;
        suspicious_txn: boolean;
        fraud_updates: boolean;
        login_alerts: boolean;
        email_notifications: boolean;
        sms_notifications: boolean;
      };
      privacy: {
        privacy_consent: boolean;
        data_sharing_opt_in: boolean;
      };
    }>(`/api/profile/${accountId}`),

  updatePersonalProfile: (
    accountId: string,
    payload: { full_name: string; phone?: string; date_of_birth?: string; address?: string }
  ) =>
    request<{ updated: boolean; full_name: string }>(`/api/profile/${accountId}/personal`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  verifyKyc: (accountId: string, payload: { verify_mobile?: boolean; verify_email?: boolean }) =>
    request<{ kyc_status: string; mobile_verified: boolean; email_verified: boolean }>(
      `/api/profile/${accountId}/kyc/verify`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  changePassword: (
    accountId: string,
    payload: { current_password?: string; new_password: string }
  ) =>
    request<{ updated: boolean }>(`/api/profile/${accountId}/password`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  recordLoginEvent: (accountId: string) =>
    request<{ recorded: boolean; activity_id: string }>(`/api/profile/${accountId}/login-event`, {
      method: 'POST',
    }),

  updateNotificationPreferences: (
    accountId: string,
    payload: {
      txn_success: boolean;
      txn_failed: boolean;
      suspicious_txn: boolean;
      fraud_updates: boolean;
      login_alerts: boolean;
      email_notifications: boolean;
      sms_notifications: boolean;
    }
  ) =>
    request<Record<string, boolean>>(`/api/profile/${accountId}/preferences`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  updatePrivacySettings: (
    accountId: string,
    payload: { privacy_consent: boolean; data_sharing_opt_in: boolean }
  ) =>
    request<{ privacy_consent: boolean; data_sharing_opt_in: boolean }>(
      `/api/profile/${accountId}/privacy`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),

  submitSupportTicket: (accountId: string, payload: { subject: string; message: string }) =>
    request<{ ticket_id: string; status: string }>(`/api/profile/${accountId}/support`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
