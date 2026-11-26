import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, FileText, RefreshCw, Download, GitBranch } from 'lucide-react';
import { api } from '../../services/api';
import { AiFraudGraph, type AiGraphEdge, type AiGraphNode } from '../shared/AiFraudGraph';

type RiskFactor = {
  factor: string;
  score: number;
  weight: number;
  contribution: number;
  max_contribution: number;
};

type RiskAssessmentSnapshot = {
  assessment_id: string;
  overall_score: number;
  risk_category: string;
  factors: RiskFactor[];
  observations: string[];
  explanation: string;
  model_version: string;
  created_at?: string | null;
};

type CyberReport = {
  report_id: string;
  case_id?: string;
  account_id: string;
  submitted_by: string;
  fraud_type: string;
  summary: string;
  report_payload?: {
    text_report?: string;
    risk_assessment?: RiskAssessmentSnapshot;
    supporting_evidence?: Array<{
      alert_id: string;
      transaction_id?: string;
      rule_triggered: string;
      severity: string;
      reason: string;
      created_at?: string;
    }>;
  } | null;
  status: string;
  created_at: string;
};

export const CyberCellApp: React.FC = () => {
  const [reports, setReports] = useState<CyberReport[]>([]);
  const [tab, setTab] = useState<'PENDING' | 'INVESTIGATING' | 'RESOLVED'>(
    () =>
      (localStorage.getItem('ft_cyber_tab') as 'PENDING' | 'INVESTIGATING' | 'RESOLVED') ||
      'PENDING'
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    () => localStorage.getItem('ft_cyber_selected_id')
  );
  const [caseGraph, setCaseGraph] = useState<{
    available: boolean;
    nodes: AiGraphNode[];
    edges: AiGraphEdge[];
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    localStorage.setItem('ft_cyber_tab', tab);
  }, [tab]);

  useEffect(() => {
    if (selectedId) localStorage.setItem('ft_cyber_selected_id', selectedId);
    else localStorage.removeItem('ft_cyber_selected_id');
  }, [selectedId]);

  const loadReports = useCallback(async () => {
    try {
      const list = (await api.listCyberCellReports()) as unknown as CyberReport[];
      setReports(list);
    } catch {
      // silent
    }
  }, []);

  const loadSelectedGraph = useCallback(async (reportId: string | null) => {
    if (!reportId) {
      setCaseGraph(null);
      return;
    }
    try {
      const g = await api.getCyberCellReportGraph(reportId);
      setCaseGraph({
        available: Boolean(g.available && g.nodes.length > 0),
        nodes: (g.nodes || []) as AiGraphNode[],
        edges: (g.edges || []) as AiGraphEdge[],
      });
    } catch {
      setCaseGraph({ available: false, nodes: [], edges: [] });
    }
  }, []);

  useEffect(() => {
    void loadReports();
    const timer = setInterval(() => void loadReports(), 4000);
    return () => clearInterval(timer);
  }, [loadReports]);

  useEffect(() => {
    void loadSelectedGraph(selectedId);
    if (!selectedId) return;
    const timer = setInterval(() => void loadSelectedGraph(selectedId), 4000);
    return () => clearInterval(timer);
  }, [selectedId, loadSelectedGraph]);

  const filtered = reports.filter((r) => r.status === tab);
  const selected = reports.find((r) => r.report_id === selectedId) || null;

  const handleStatus = async (id: string, status: 'PENDING' | 'INVESTIGATING' | 'RESOLVED') => {
    await api.updateCyberCellStatus(id, status);
    void loadReports();
  };

  const downloadTextReport = (r: CyberReport) => {
    const content =
      r.report_payload?.text_report ||
      `FRAUDTRACE CYBER CELL REPORT\nReport ID: ${r.report_id}\nAccount: ${r.account_id}\nType: ${r.fraud_type}\nSummary: ${r.summary}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${r.report_id}_report.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadGraphImage = (r: CyberReport) => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${r.report_id}_ai_graph.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#FBF8F3] text-gray-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="bg-white rounded-3xl p-5 border border-orange-100 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#1E293B] text-white flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Cyber Cell Fraud Reporting Portal</h1>
              <p className="text-xs text-gray-500">
                Text Investigation Reports (.txt) & Live AI Fraud Transaction Graph
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              void loadReports();
              void loadSelectedGraph(selectedId);
            }}
            className="p-2 rounded-xl bg-[#FBF8F3] border border-orange-100"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2">
          {(['PENDING', 'INVESTIGATING', 'RESOLVED'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-xs font-bold ${tab === t ? 'bg-[#1E293B] text-white' : 'bg-white text-gray-600 border border-orange-100'
                }`}
            >
              {t} ({reports.filter((r) => r.status === t).length})
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-5 gap-4">
          <div className="md:col-span-2 space-y-3">
            {filtered.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center text-xs text-gray-500 border border-orange-100">
                No {tab.toLowerCase()} reports.
              </div>
            ) : (
              filtered.map((r) => (
                <div
                  key={r.report_id}
                  onClick={() => setSelectedId(r.report_id)}
                  className={`bg-white rounded-2xl p-4 border cursor-pointer space-y-2 ${selected?.report_id === r.report_id ? 'border-[#F97316]' : 'border-orange-100'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm">{r.report_id}</span>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${r.status === 'PENDING'
                          ? 'bg-red-100 text-[#DC2626]'
                          : r.status === 'INVESTIGATING'
                            ? 'bg-orange-100 text-[#F97316]'
                            : 'bg-green-100 text-[#16A34A]'
                        }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="text-xs font-semibold">
                    Account: {r.account_id} • {r.fraud_type}
                  </p>
                  <p className="text-xs text-gray-600">{r.summary}</p>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleStatus(r.report_id, 'INVESTIGATING');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-orange-50 text-[#F97316] text-[11px] font-semibold"
                    >
                      Investigate
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleStatus(r.report_id, 'RESOLVED');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-green-50 text-[#16A34A] text-[11px] font-semibold"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="md:col-span-3 bg-white rounded-3xl p-5 border border-orange-100 space-y-4">
            {selected ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#F97316]" /> Investigation Report ({selected.report_id})
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => downloadTextReport(selected)}
                      className="px-3 py-1.5 rounded-xl bg-[#1E293B] text-white text-xs font-semibold flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" /> Download .TXT
                    </button>
                    {caseGraph?.available && (
                      <button
                        onClick={() => downloadGraphImage(selected)}
                        className="px-3 py-1.5 rounded-xl bg-[#16A34A] text-white text-xs font-semibold flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" /> Download Graph Image
                      </button>
                    )}
                  </div>
                </div>

                <pre className="text-[11px] font-mono bg-[#FBF8F3] border border-orange-100 p-4 rounded-2xl overflow-auto max-h-48 whitespace-pre-wrap">
                  {selected.report_payload?.text_report ||
                    `Report ID: ${selected.report_id}\nAccount: ${selected.account_id}\nType: ${selected.fraud_type}\nSummary: ${selected.summary}`}
                </pre>

                {/* AI-Generated Risk Assessment Subsection (Exact Snapshot from Banker) */}
                {selected.report_payload?.risk_assessment && (
                  <div className="p-4 rounded-2xl bg-[#FBF8F3] border border-orange-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-bold text-gray-900">
                          AI-Generated Risk Assessment
                        </h3>
                        <p className="text-[10px] text-gray-500">
                          Assessment ID: {selected.report_payload.risk_assessment.assessment_id} •{' '}
                          {selected.report_payload.risk_assessment.model_version}
                        </p>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-[#DC2626] text-white text-xs font-bold">
                        {selected.report_payload.risk_assessment.overall_score}/100 •{' '}
                        {selected.report_payload.risk_assessment.risk_category}
                      </span>
                    </div>

                    <div className="bg-white rounded-xl border border-orange-100 overflow-hidden">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-orange-50 text-gray-600">
                          <tr>
                            <th className="p-2">Factor</th>
                            <th className="p-2">Score</th>
                            <th className="p-2">Weight</th>
                            <th className="p-2">Contribution</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-orange-50">
                          {selected.report_payload.risk_assessment.factors.map((f) => (
                            <tr key={f.factor}>
                              <td className="p-2 font-semibold">{f.factor}</td>
                              <td className="p-2">{f.score}</td>
                              <td className="p-2">{f.weight}%</td>
                              <td className="p-2 font-bold text-[#DC2626]">
                                {f.contribution}/{f.max_contribution}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {selected.report_payload.risk_assessment.observations?.length > 0 && (
                      <ul className="list-disc pl-4 text-[11px] text-gray-700 space-y-0.5">
                        {selected.report_payload.risk_assessment.observations.map((o, i) => (
                          <li key={i}>{o}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="space-y-2 bg-[#0F172A] p-4 rounded-2xl">
                  <p className="text-xs font-bold flex items-center gap-1.5 text-green-400">
                    <GitBranch className="w-4 h-4" /> AI-Generated Fraud Transaction Graph (Case:{' '}
                    {selected.case_id || selected.account_id})
                  </p>
                  {caseGraph?.available ? (
                    <AiFraudGraph
                      nodes={caseGraph.nodes}
                      edges={caseGraph.edges}
                      svgRef={svgRef}
                      heightClass="h-[360px]"
                    />
                  ) : (
                    <p className="text-xs text-slate-400 py-6 text-center">
                      No AI transaction graph data is available for this case yet.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500">
                Select a Cyber Cell report to view the formatted text report and live AI fraud transaction graph.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
