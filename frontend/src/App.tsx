import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Account,
  AppMode,
  AppNotification,
  BankerTab,
  CustomerTab,
  FraudAlert,
  FraudCase,
  FreezeRequest,
  SystemSummary,
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
import { BankerDashboard } from './components/banker/BankerDashboard';

export function App() {
  const [mode, setMode] = useState<AppMode>('CUSTOMER');
  const [customerTab, setCustomerTab] = useState<CustomerTab>('home');
  const [bankerTab, setBankerTab] = useState<BankerTab>('dashboard');

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

  // Notifications
  const [customerNotifs, setCustomerNotifs] = useState<AppNotification[]>([]);
  const [customerUnread, setCustomerUnread] = useState(0);
  const [bankerNotifs, setBankerNotifs] = useState<AppNotification[]>([]);
  const [bankerUnread, setBankerUnread] = useState(0);
  const seenNotifIds = useRef<Set<string>>(new Set());

  // Banker state
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [cases, setCases] = useState<FraudCase[]>([]);
  const [freezeRequests, setFreezeRequests] = useState<FreezeRequest[]>([]);

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);

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
      setAccounts(list);
      setActiveAccount((prev) => {
        if (!prev) return null;
        return list.find((a) => a.account_id === prev.account_id) || prev;
      });
    } catch (err) {
      setAccountsError(
        err instanceof Error ? err.message : 'Unable to load accounts'
      );
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const loadCustomerData = useCallback(async (accId: string) => {
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

      // Show toast for newly arrived unread security/fraud alerts
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
  }, [pushToast]);

  const loadBankerData = useCallback(async () => {
    try {
      const [sum, al, cs, fr, notifs] = await Promise.all([
        api.getSystemSummary(),
        api.listAlerts(),
        api.listCases(),
        api.listFreezeRequests(),
        api.listNotifications('BANKER'),
      ]);
      setSummary(sum);
      setAlerts(al);
      setCases(cs);
      setFreezeRequests(fr);
      setBankerNotifs(notifs.notifications);
      setBankerUnread(notifs.unread_count);
    } catch {
      // silent during background poll
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
    void loadBankerData();
  }, [loadAccounts, loadBankerData]);

  useEffect(() => {
    if (activeAccount) {
      void loadCustomerData(activeAccount.account_id);
    }
  }, [activeAccount?.account_id, loadCustomerData]);

  // Real-time polling every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      if (activeAccount) {
        void loadCustomerData(activeAccount.account_id);
      }
      void loadBankerData();
    }, 4000);
    return () => clearInterval(timer);
  }, [activeAccount, loadCustomerData, loadBankerData]);

  const refreshAll = () => {
    void loadAccounts();
    if (activeAccount) void loadCustomerData(activeAccount.account_id);
    void loadBankerData();
  };

  return (
    <div className="min-h-screen bg-[#F4F0FF] text-[#201A32]">
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      <Header
        mode={mode}
        onModeChange={(m) => setMode(m)}
        userName={activeAccount?.account_name}
        unreadCount={mode === 'CUSTOMER' ? customerUnread : bankerUnread}
        onBellClick={() => {
          if (mode === 'CUSTOMER') setCustomerTab('notifications');
          else setBankerTab('notifications');
        }}
        onProfileClick={
          activeAccount ? () => setCustomerTab('profile') : undefined
        }
      />

      {mode === 'BANKER' ? (
        <BankerDashboard
          activeTab={bankerTab}
          onTabChange={setBankerTab}
          summary={summary}
          alerts={alerts}
          cases={cases}
          freezeRequests={freezeRequests}
          notifications={bankerNotifs}
          unreadCount={bankerUnread}
          onRefreshAll={refreshAll}
          onNotify={(type, title, msg) => pushToast(type, title, msg)}
        />
      ) : !activeAccount ? (
        <DemoLoginScreen
          accounts={accounts}
          loading={accountsLoading}
          error={accountsError}
          onRefresh={() => void loadAccounts()}
          onSelectAccount={(acc) => {
            seenNotifIds.current.clear();
            setActiveAccount(acc);
            setCustomerTab('home');
          }}
        />
      ) : (
        <>
          {customerTab === 'home' && (
            <HomeScreen
              account={activeAccount}
              allAccounts={accounts}
              transactions={transactions}
              onNavigate={(tab) => {
                setSelectedRecipient(null);
                setCustomerTab(tab);
              }}
              onSelectRecipient={(acc) => {
                setSelectedRecipient(acc);
                setCustomerTab('send');
              }}
              onBalanceUpdated={refreshAll}
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

          {customerTab === 'receipt' && paymentResult && (
            <PaymentResultScreen
              success={paymentResult.success}
              transaction={paymentResult.transaction}
              recipientName={paymentResult.recipientName}
              errorMessage={paymentResult.errorMessage}
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
              onTriggerDemoComplete={refreshAll}
              onNotify={(type, title, msg) => pushToast(type, title, msg)}
              onLogout={() => {
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
