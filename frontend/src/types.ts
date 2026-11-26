export type AppMode = 'USER' | 'FRAUDSTER' | 'BANKER' | 'CYBERCELL' | 'AI_MODEL' | 'DB_VIEWER';

export type CustomerTab =
  | 'home'
  | 'history'
  | 'scan'
  | 'notifications'
  | 'profile'
  | 'send'
  | 'receive'
  | 'receipt'
  | 'report';

export type BankerTab =
  | 'dashboard'
  | 'alerts'
  | 'investigations'
  | 'freeze'
  | 'notifications';

export interface Account {
  account_id: string;
  user_id: string;
  account_name: string;
  balance_rupees: number;
  is_active: boolean;
  is_frozen?: boolean;
  account_type: string;
  created_at?: string;
}

export interface Transaction {
  transaction_id: string;
  trace_id?: string | null;
  sender_account_id: string;
  receiver_account_id: string;
  amount_rupees: number;
  status: string;
  description?: string;
  created_at?: string;
  allocations_used?: Array<{
    source_allocation_id: string;
    destination_allocation_id: string;
    amount_rupees: number;
    amount_paise: number;
  }>;
}

export interface FraudAlert {
  alert_id: string;
  account_id: string;
  transaction_id?: string;
  rule_triggered: string;
  reason: string;
  risk_score: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
  status: 'NEW' | 'REVIEWED' | 'DISMISSED' | 'ESCALATED' | string;
  created_at?: string;
}

export interface AlertDetail extends FraudAlert {
  transaction?: Transaction | null;
  account_risk_score?: number | null;
  account_risk_category?: string | null;
  related_case_id?: string | null;
}

export interface FraudCase {
  case_id: string;
  reporting_account_id: string;
  reported_transaction_id: string;
  fraud_category: 'PAYMENT_FRAUD' | 'UNAUTHORIZED_DEBIT' | string;
  reported_amount_rupees: number;
  description?: string;
  status: string;
  trace_id?: string | null;
  created_at?: string;
}

export interface FreezeRequest {
  request_id: string;
  case_id: string;
  account_id: string;
  trace_id?: string | null;
  suggested_amount_rupees: number;
  available_balance_rupees: number;
  traceable_balance_rupees: number;
  reason?: string;
  status: string;
  reviewer?: string | null;
  review_notes?: string | null;
  created_at?: string;
  reviewed_at?: string | null;
}

export interface AppNotification {
  notification_id: string;
  recipient_role: 'CUSTOMER' | 'BANKER';
  account_id?: string | null;
  category: 'PAYMENT' | 'SECURITY' | 'FRAUD_ALERT' | 'ACCOUNT' | string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
  title: string;
  message: string;
  transaction_id?: string | null;
  alert_id?: string | null;
  case_id?: string | null;
  is_read: boolean;
  created_at?: string;
}

export interface SystemSummary {
  app: string;
  version: string;
  total_accounts: number;
  total_transactions: number;
  fraud_cases: number;
  fraud_alerts: number;
  open_alerts: number;
  suspicious_transactions: number;
  cases_under_investigation: number;
  accounts_requiring_review: number;
  pending_freeze_requests: number;
  allocation_policy: string;
}

export interface ParsedQR {
  scheme: string;
  recipient_account_id: string;
  display_name?: string;
}
