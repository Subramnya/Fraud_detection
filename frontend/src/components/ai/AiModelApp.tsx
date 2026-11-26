import React, { useCallback, useEffect, useState } from 'react';
import { Cpu, ShieldAlert, GitBranch, Lock } from 'lucide-react';
import { api } from '../../services/api';
import { AiFraudGraph, type AiGraphEdge, type AiGraphNode } from '../shared/AiFraudGraph';

export const AiModelApp: React.FC = () => {
  const [feed, setFeed] = useState<Awaited<ReturnType<typeof api.getAiLiveFeed>> | null>(null);

  const loadFeed = useCallback(async () => {
    try {
      const data = await api.getAiLiveFeed();
      setFeed(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void loadFeed();
    const timer = setInterval(() => void loadFeed(), 2000);
    return () => clearInterval(timer);
  }, [loadFeed]);

  if (!feed || !feed.fraud_detected) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#FBF8F3] border border-orange-100 flex items-center justify-center text-gray-400 mb-3">
          <Cpu className="w-6 h-6" />
        </div>
        <p className="text-sm font-semibold text-gray-700">
          AI Model Active — Monitoring Transactions
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Scikit-learn (RandomForest + IsolationForest) & NetworkX • Standby until fraud is detected
        </p>
      </div>
    );
  }

  const nodes = (feed.graph.nodes || []) as AiGraphNode[];
  const edges = (feed.graph.edges || []) as AiGraphEdge[];

  return (
    <div className="min-h-screen bg-[#0F172A] text-white p-5 space-y-5">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="bg-red-950/60 border border-red-500 rounded-3xl p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-red-400 animate-pulse" />
            <div>
              <h1 className="text-lg font-bold text-red-300">
                FRAUD DETECTED — AI REAL-TIME 2D TREE GRAPH
              </h1>
              <p className="text-xs text-red-200/80">{feed.model_info}</p>
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-xl bg-red-500 text-white text-xs font-bold">
            {feed.alerts.length} ACTIVE ALERT(S)
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-green-400 flex items-center gap-2">
              <GitBranch className="w-4 h-4" /> NetworkX 2D XY-Plane Tree (Click Nodes or Edges for Details)
            </h2>
            <span className="text-xs text-slate-400">
              {nodes.length} Nodes • {edges.length} Directed Edges
            </span>
          </div>

          <AiFraudGraph nodes={nodes} edges={edges} />
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-orange-400">Detected Processors & Accounts</h2>
          <div className="grid md:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
            {feed.alerts.map((a) => (
              <div
                key={a.alert_id}
                className="p-3 rounded-2xl bg-slate-800 border border-slate-700 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-red-400">
                    {a.rule_triggered} ({a.severity})
                  </span>
                  {a.is_frozen ? (
                    <span className="px-2 py-0.5 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center gap-1">
                      <Lock className="w-3 h-3" /> FROZEN
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
                      TRACKING LIVE
                    </span>
                  )}
                </div>
                <p className="text-xs">
                  Account: <span className="font-mono">{a.account_name} ({a.account_id})</span>
                </p>
                <p className="text-[11px] text-slate-300">{a.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
