import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Account,
  AppMode,
  AppNotification,
  CustomerTab,
  Transaction,
} from './types';
import { api } from './services/api';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { ToastContainer, type ToastItem } from './components/Toast';
import { DemoLoginScreen } from './components/customer/DemoLoginScreen';
import { HomeScreen } from './components/customer/HomeScreen';
import { ScanPayScreen } from './components/customer/ScanPayScreen';
import { SendMoneyScreen } from './components/customer/SendMoneyScreen';
import { PaymentResultScreen } from './components/customer/PaymentResultScreen';
import { ReceiveMoneyScreen } from './components/customer/ReceiveMoneyScreen';
import { HistoryScreen } from './components/customer/HistoryScreen';
import { NotificationsScreen } from './components/customer/NotificationsScreen';
import { ReportFraudScreen } from './components/customer/ReportFraudScreen';
import { ProfileScreen } from './components/customer/ProfileScreen';
import { FraudsterApp } from './components/fraudster/FraudsterApp';
import { BankerApp } from './components/banker/BankerApp';
import { CyberCellApp } from './components/cybercell/CyberCellApp';
import { AiModelApp } from './components/ai/AiModelApp';
import { DbViewerApp } from './components/db/DbViewerApp';

const PATH_ROLES: Record<string, AppMode> = {
  '/customer': 'USER',
  '/user': 'USER',
  '/fraudster': 'FRAUDSTER',
  '/banker': 'BANKER',
  '/cybercell': 'CYBERCELL',
  '/ai-model': 'AI_MODEL',
  '/database': 'DB_VIEWER',
  '/db': 'DB_VIEWER',
};

function resolveAppMode(): AppMode {
  const params = new URLSearchParams(window.location.search);
  const qRole = params.get('role')?.toUpperCase();
  if (qRole === 'FRAUDSTER' || qRole === 'BANKER' || qRole === 'CYBERCELL' || qRole === 'AI_MODEL' || qRole === 'DB_VIEWER' || qRole === 'USER') {
    return qRole;
  }

  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase() || '/';
  const pathRole = PATH_ROLES[path];
  if (pathRole) return pathRole;

  const envRole = (import.meta.env.VITE_APP_ROLE || '').toUpperCase();
  if (envRole) return envRole as AppMode;

  const port = window.location.port;
  if (port === '5174') return 'FRAUDSTER';
  if (port === '5175') return 'BANKER';
  if (port === '5176') return 'CYBERCELL';
  if (port === '5177') return 'AI_MODEL';
  if (port === '5178') return 'DB_VIEWER';
  return 'USER';
}

export function App() {
  const mode = resolveAppMode();

  if (mode === 'FRAUDSTER') return <FraudsterApp />;
  if (mode === 'BANKER') return <BankerApp />;
  if (mode === 'CYBERCELL') return <CyberCellApp />;
  if (mode === 'AI_MODEL') return <AiModelApp />;
  if (mode === 'DB_VIEWER') return <DbViewerApp />;

  return <UserUPayApp />;
}

function UserUPayApp() {
  const [customerTab, setCustomerTab] = useState<CustomerTab>(
    () => (localStorage.getItem('ft_user_tab') as CustomerTab) || 'home'
  );
  const [savedAccountId, setSavedAccountId] = useState<string | null>(
    () => localStorage.getItem('ft_user_account_id')
  );

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<Account | null>(null);
  const [reportTargetTxn, setReportTargetTxn] = useState<Transaction | null>(null);
  const [paymentResult, setPaymentResult] = useState<{
    success: boolean;
    transaction?: Transaction | null;
    recipientName?: string;
    errorMessage?: string | null;
  } | null>(null);

  const [customerNotifs, setCustomerNotifs] = useState<AppNotification[]>([]);
  const [customerUnread, setCustomerUnread] = useState(0);
  const seenNotifIds = useRef<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    localStorage.setItem('ft_user_tab', customerTab);
  }, [customerTab]);

  useEffect(() => {
    if (savedAccountId) localStorage.setItem('ft_user_account_id', savedAccountId);
    else localStorage.removeItem('ft_user_account_id');
  }, [savedAccountId]);

  const pushToast = useCallback(
    (type: ToastItem['type'], title: string, message: string) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, type, title, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 6000);
    },
    []
  );

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const list = await api.listAccounts();
      const userVisible = list.filter((a) => a.account_type !== 'FRAUDSTER_PARTNER');
      setAccounts(userVisible);
      if (savedAccountId) {
        const match = userVisible.find((a) => a.account_id === savedAccountId);
        if (match) setActiveAccount(match);
      }
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : 'Unable to load accounts');
    } finally {
      setAccountsLoading(false);
    }
  }, [savedAccountId]);

  const loadCustomerData = useCallback(
    async (accId: string) => {
      try {
        const [acc, hist, notifs] = await Promise.all([
          api.getAccount(accId),
          api.getPaymentHistory(accId),
          api.listNotifications('CUSTOMER', accId),
        ]);
        setActiveAccount(acc);
        setTransactions(hist.transactions);
        setCustomerNotifs(notifs.notifications);
        setCustomerUnread(notifs.unread_count);

        for (const n of notifs.notifications) {
          if (!n.is_read && !seenNotifIds.current.has(n.notification_id)) {
            seenNotifIds.current.add(n.notification_id);
            if (n.category === 'FRAUD_ALERT' || n.category === 'SECURITY') {
              pushToast(
                n.severity === 'HIGH' || n.severity === 'CRITICAL' ? 'error' : 'warning',
                n.title,
                n.message
              );
            }
          } else {
            seenNotifIds.current.add(n.notification_id);
          }
        }
      } catch {
        // silent during background poll
      }
    },
    [pushToast]
  );

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (activeAccount) {
      void loadCustomerData(activeAccount.account_id);
    }
  }, [activeAccount?.account_id, loadCustomerData]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (activeAccount) {
        void loadCustomerData(activeAccount.account_id);
      }
    }, 3500);
    return () => clearInterval(timer);
  }, [activeAccount, loadCustomerData]);

  const refreshAll = () => {
    void loadAccounts();
    if (activeAccount) void loadCustomerData(activeAccount.account_id);
  };

  const handleUserFreezeRequest = async () => {
    if (!activeAccount) return;
    try {
      const latestTxn = transactions[0];
      if (!latestTxn) {
        pushToast('warning', 'No Transaction', 'No recent transaction found to attach freeze.');
        return;
      }
      const c = await api.reportFraud({
        reporting_account_id: activeAccount.account_id,
        transaction_id: latestTxn.transaction_id,
        fraud_category: 'UNAUTHORIZED_DEBIT',
        description: 'User clicked Freeze Account after Red Alert',
      });
      await api.createFreezeRequest({
        case_id: c.case_id,
        account_id: activeAccount.account_id,
        reason: 'Urgent user freeze request triggered from Red Alert',
      });
      pushToast(
        'success',
        'Freeze Request Sent to Banker',
        `Case ${c.case_id} & freeze request dispatched to Banker Desk.`
      );
      refreshAll();
    } catch (err) {
      pushToast('error', 'Freeze Request Failed', err instanceof Error ? err.message : 'Error');
    }
  };

  const handleReportToCyberCell = async (n: AppNotification) => {
    if (!activeAccount) return;
    try {
      const res = await api.submitToCyberCell({
        account_id: activeAccount.account_id,
        case_id: n.case_id || undefined,
        submitted_by: activeAccount.account_name,
        fraud_type: 'UNAUTHORIZED_ACCESS',
        summary: n.message,
      });
      await api.markNotificationRead(n.notification_id);
      pushToast(
        'success',
        'Reported to Cyber Cell',
        `Report ${res.report_id} forwarded to Cyber Cell Portal.`
      );
      refreshAll();
    } catch (err) {
      pushToast('error', 'Cyber Cell Error', err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF8F3] text-gray-900">
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      <Header
        mode="USER"
        userName={activeAccount?.account_name}
        unreadCount={customerUnread}
        onBellClick={() => setCustomerTab('notifications')}
        onProfileClick={activeAccount ? () => setCustomerTab('profile') : undefined}
      />

      {!activeAccount ? (
        <DemoLoginScreen
          accounts={accounts}
          loading={accountsLoading}
          error={accountsError}
          onRefresh={() => void loadAccounts()}
          onSelectAccount={(acc) => {
            seenNotifIds.current.clear();
            setSavedAccountId(acc.account_id);
            setActiveAccount(acc);
            setCustomerTab('home');
            void api.recordLoginEvent(acc.account_id).catch(() => undefined);
          }}
        />
      ) : (
        <>
          {customerTab === 'home' && (
            <HomeScreen
              account={activeAccount}
              allAccounts={accounts}
              transactions={transactions}
              notifications={customerNotifs}
              onNavigate={(tab) => {
                setSelectedRecipient(null);
                setCustomerTab(tab);
              }}
              onSelectRecipient={(acc) => {
                setSelectedRecipient(acc);
                setCustomerTab('send');
              }}
              onBalanceUpdated={refreshAll}
              onFreezeAccount={() => void handleUserFreezeRequest()}
              onNotify={(type, title, msg) => pushToast(type, title, msg)}
            />
          )}

          {customerTab === 'scan' && (
            <ScanPayScreen
              senderAccount={activeAccount}
              allAccounts={accounts}
              onBack={() => setCustomerTab('home')}
              onSuccess={(txn, recipientName) => {
                setPaymentResult({ success: true, transaction: txn, recipientName });
                setCustomerTab('receipt');
                refreshAll();
              }}
              onFailure={(errorMessage) => {
                setPaymentResult({ success: false, errorMessage });
                setCustomerTab('receipt');
              }}
            />
          )}

          {customerTab === 'send' && (
            <SendMoneyScreen
              senderAccount={activeAccount}
              allAccounts={accounts}
              initialRecipient={selectedRecipient}
              onBack={() => setCustomerTab('home')}
              onSuccess={(txn, recipientName) => {
                setPaymentResult({ success: true, transaction: txn, recipientName });
                setCustomerTab('receipt');
                refreshAll();
              }}
              onFailure={(errorMessage) => {
                setPaymentResult({ success: false, errorMessage });
                setCustomerTab('receipt');
              }}
            />
          )}

          {customerTab === 'receipt' && (
            <PaymentResultScreen
              success={Boolean(paymentResult?.success)}
              transaction={paymentResult?.transaction}
              recipientName={paymentResult?.recipientName}
              errorMessage={paymentResult?.errorMessage}
              onDone={() => setCustomerTab('home')}
              onRetry={() => setCustomerTab('send')}
            />
          )}

          {customerTab === 'receive' && (
            <ReceiveMoneyScreen
              account={activeAccount}
              onBack={() => setCustomerTab('home')}
              onNotify={(type, title, msg) => pushToast(type, title, msg)}
            />
          )}

          {customerTab === 'history' && (
            <HistoryScreen
              account={activeAccount}
              allAccounts={accounts}
              transactions={transactions}
              onReportTransaction={(txn) => {
                setReportTargetTxn(txn);
                setCustomerTab('report');
              }}
            />
          )}

          {customerTab === 'notifications' && (
            <NotificationsScreen
              notifications={customerNotifs}
              onMarkRead={(id) => {
                void api.markNotificationRead(id).then(() => refreshAll());
              }}
              onMarkAllRead={() => {
                void api
                  .markAllNotificationsRead('CUSTOMER', activeAccount.account_id)
                  .then(() => refreshAll());
              }}
              onInspectTransaction={(txnId) => {
                const match = transactions.find((t) => t.transaction_id === txnId) || null;
                setReportTargetTxn(match);
                setCustomerTab('report');
              }}
              onReportToCyberCell={(n) => void handleReportToCyberCell(n)}
            />
          )}

          {customerTab === 'report' && (
            <ReportFraudScreen
              account={activeAccount}
              transactions={transactions}
              initialTransaction={reportTargetTxn}
              onBack={() => setCustomerTab('home')}
              onCaseCreated={refreshAll}
            />
          )}

          {customerTab === 'profile' && (
            <ProfileScreen
              account={activeAccount}
              onProfileUpdated={refreshAll}
              onNotify={(type, title, msg) => pushToast(type, title, msg)}
              onLogout={() => {
                setSavedAccountId(null);
                setActiveAccount(null);
                setTransactions([]);
                setCustomerNotifs([]);
              }}
            />
          )}

          <BottomNav
            activeTab={customerTab}
            onSelect={(tab) => setCustomerTab(tab)}
            unreadCount={customerUnread}
          />
        </>
      )}
    </div>
  );
}

export default App;
