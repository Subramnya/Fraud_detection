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

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const DEFAULT_TIMEOUT_MS = 10000;

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

  // Format 1: FRAUDTRACE:PAY:ACC_XXXXX
  if (trimmed.startsWith('FRAUDTRACE:PAY:')) {
    const accountId = trimmed.replace('FRAUDTRACE:PAY:', '').trim();
    if (!accountId) return null;
    return { scheme: 'FRAUDTRACE', recipient_account_id: accountId };
  }

  // Format 2: JSON payload
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
  // System
  getHealth: () => request<{ status: string; warning?: string }>('/health'),
  getSystemSummary: () => request<SystemSummary>('/api/system/summary'),

  // Accounts
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
  }) =>
    request<Account>('/api/accounts/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  topupVirtualMoney: (accountId: string, amount_rupees: number) =>
    request<{ account_id: string; added_rupees: number; balance_rupees: number; simulated: boolean }>(
      `/api/accounts/${accountId}/topup`,
      {
        method: 'POST',
        body: JSON.stringify({ amount_rupees }),
      }
    ),

  // Payments
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

  // Fraud & Cases
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

  // Freeze Requests
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

  // Notifications
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

  // Demo Simulation
  triggerSuspiciousDemo: (accountId: string) =>
    request<{
      simulated: boolean;
      transaction_id: string;
      sender_account_id: string;
      receiver_account_id: string;
      amount_rupees: number;
      alerts_triggered: Array<{
        alert_id: string;
        rule_triggered: string;
        severity: string;
        reason: string;
      }>;
    }>('/api/demo/trigger-suspicious', {
      method: 'POST',
      body: JSON.stringify({ account_id: accountId }),
    }),
};
