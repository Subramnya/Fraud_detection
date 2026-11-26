import React, { useCallback, useEffect, useState } from 'react';
import { Database, Terminal } from 'lucide-react';
import { api } from '../../services/api';

export const DbViewerApp: React.FC = () => {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getDbLive>> | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const loadDb = useCallback(async () => {
    try {
      const res = await api.getDbLive();
      setData(res);
      setConnectionError(null);
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Unable to load database status');
    }
  }, []);

  useEffect(() => {
    void loadDb();
    const timer = setInterval(() => void loadDb(), 2500);
    return () => clearInterval(timer);
  }, [loadDb]);

  return (
    <div className="min-h-screen bg-[#0D1117] text-gray-100 font-mono p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Database className="w-6 h-6 text-green-400" />
            <div>
              <h1 className="text-base font-bold">FRAUDTRACE // LIVE SQLITE DATABASE & CLI</h1>
              <p className="text-[11px] text-gray-400">Real-time auto-refresh every 2.5s</p>
            </div>
          </div>
          {data && (
            <div className="flex gap-3 text-xs">
              {Object.entries(data.counts).map(([k, v]) => (
                <span key={k} className="px-2.5 py-1 rounded-lg bg-gray-800 text-green-400">
                  {k}: {v}
                </span>
              ))}
            </div>
          )}
        </div>

        {connectionError && (
          <div className="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            Backend/database connection failed: {connectionError}
            <span className="block pt-1 text-xs text-red-200/80">
              Confirm the backend is running and the frontend proxy points to it.
            </span>
          </div>
        )}

        {/* Live CLI Stream */}
        <div className="bg-black border border-gray-800 rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-green-400 font-bold mb-2">
            <Terminal className="w-4 h-4" /> $ fraudtrace-db --tail -f
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1 text-[11px] text-green-300">
            {data?.cli_logs.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>

        {/* Live Tables */}
        <div className="grid md:grid-cols-2 gap-4 text-[11px]">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h2 className="font-bold text-orange-400 mb-2">RECENT TRANSACTIONS</h2>
            <div className="max-h-64 overflow-auto space-y-1">
              {data?.transactions.map((t, i) => (
                <div key={i} className="p-2 rounded bg-black/50 border border-gray-800">
                  {String(t.transaction_id)} | {String(t.sender_account_id)} →{' '}
                  {String(t.receiver_account_id)} | ₹{String(t.amount_rupees)} |{' '}
                  {String(t.trace_id || '')}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h2 className="font-bold text-red-400 mb-2">FRAUD ALERTS</h2>
            <div className="max-h-64 overflow-auto space-y-1">
              {data?.alerts.map((a, i) => (
                <div key={i} className="p-2 rounded bg-black/50 border border-gray-800">
                  {String(a.alert_id)} | {String(a.account_id)} | {String(a.rule_triggered)} (
                  {String(a.severity)}) | {String(a.status)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
