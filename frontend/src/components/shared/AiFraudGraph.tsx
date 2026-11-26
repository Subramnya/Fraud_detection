import React, { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, X } from 'lucide-react';

export type AiGraphNode = {
  id: string;
  x?: number;
  y?: number;
  label?: string;
  balance_rupees?: number;
  account_type?: string;
  is_frozen?: boolean;
  is_alerted?: boolean;
};

export type AiGraphEdge = {
  source: string;
  target: string;
  transaction_id?: string;
  trace_id?: string;
  amount_rupees?: number;
  timestamp?: string;
  is_flagged?: boolean;
  rules_triggered?: string[];
  alert_reasons?: string[];
};

interface AiFraudGraphProps {
  nodes: AiGraphNode[];
  edges: AiGraphEdge[];
  svgRef?: React.RefObject<SVGSVGElement | null>;
  heightClass?: string;
}

export const AiFraudGraph: React.FC<AiFraudGraphProps> = ({
  nodes,
  edges,
  svgRef,
  heightClass = 'h-[460px]',
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<AiGraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<AiGraphEdge | null>(null);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const maxX = Math.max(1000, ...nodes.map((n) => (n.x ?? 0) + 140));
  const maxY = Math.max(520, ...nodes.map((n) => (n.y ?? 0) + 110));

  const vw = maxX / zoom;
  const vh = maxY / zoom;
  const vx = (maxX - vw) / 2 - pan.x;
  const vy = (maxY - vh) / 2 - pan.y;

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setZoom((z) => Math.max(0.4, Math.min(5, +(z + delta).toFixed(2))));
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const dx = ((e.clientX - dragStart.x) * (maxX / 900)) / zoom;
    const dy = ((e.clientY - dragStart.y) * (maxY / 460)) / zoom;
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setDragging(false);

  const selectedNodeTxns = selectedNode
    ? edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
    : [];

  // Stagger edge label positions along the link so parallel/nearby labels never overlap
  const tFactors = [0.35, 0.5, 0.65];

  return (
    <div className="space-y-3">
      {/* Toolbar + Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-3 text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#6366F1] inline-block border border-white" />
            Normal Account
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#DC2626] inline-block border border-white" />
            Suspicious / Flagged
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#16A34A] inline-block border border-white" />
            Frozen Account
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#F97316] inline-block" />
            Flagged Txn
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#38BDF8] inline-block" />
            Normal Flow
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 font-mono mr-1">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(5, +(z + 0.35).toFixed(2)))}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.35).toFixed(2)))}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
            title="Reset view"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive 2D XY-Plane Graph */}
      <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden select-none">
        <svg
          ref={svgRef}
          viewBox={`${vx} ${vy} ${vw} ${vh}`}
          className={`w-full ${heightClass} ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <defs>
            <marker
              id="ai-arrow-normal"
              viewBox="0 0 10 10"
              refX="22"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38BDF8" />
            </marker>
            <marker
              id="ai-arrow-flagged"
              viewBox="0 0 10 10"
              refX="22"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#F97316" />
            </marker>
          </defs>

          <line x1="20" y1={maxY - 25} x2={maxX - 20} y2={maxY - 25} stroke="#1E293B" strokeWidth="1" />
          <line x1="20" y1="20" x2="20" y2={maxY - 25} stroke="#1E293B" strokeWidth="1" />

          {edges.map((e, idx) => {
            const s = nodeMap.get(e.source);
            const t = nodeMap.get(e.target);
            if (!s || !t || s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) {
              return null;
            }
            const tf = tFactors[idx % tFactors.length];
            const mx = s.x + (t.x - s.x) * tf;
            const my = s.y + (t.y - s.y) * tf;
            const shortTime = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '';
            const strokeColor = e.is_flagged ? '#F97316' : '#38BDF8';
            const isSelected = selectedEdge?.transaction_id === e.transaction_id;

            return (
              <g
                key={`${e.transaction_id || idx}`}
                className="cursor-pointer"
                onClick={(ev) => {
                  ev.stopPropagation();
                  setSelectedNode(null);
                  setSelectedEdge(e);
                }}
              >
                <line
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? '3.5' : '2'}
                  strokeOpacity="0.85"
                  markerEnd={e.is_flagged ? 'url(#ai-arrow-flagged)' : 'url(#ai-arrow-normal)'}
                />
                {/* Show compact badge at 1x, full details when zoomed in (>1.2x) or selected */}
                {zoom >= 1.2 || isSelected || edges.length <= 8 ? (
                  <>
                    <rect
                      x={mx - 68}
                      y={my - 13}
                      width="136"
                      height="26"
                      rx="5"
                      fill="#0F172A"
                      stroke={isSelected ? '#FDE047' : e.is_flagged ? '#F97316' : '#334155'}
                    />
                    <text
                      x={mx}
                      y={my - 2}
                      textAnchor="middle"
                      fill="#FDE047"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      {e.transaction_id} • ₹{e.amount_rupees}
                    </text>
                    <text
                      x={mx}
                      y={my + 8}
                      textAnchor="middle"
                      fill="#94A3B8"
                      fontSize="7"
                      fontFamily="monospace"
                    >
                      {e.trace_id || 'TRC'} | {shortTime}
                    </text>
                  </>
                ) : (
                  <>
                    <rect
                      x={mx - 26}
                      y={my - 8}
                      width="52"
                      height="15"
                      rx="4"
                      fill="#0F172A"
                      stroke={e.is_flagged ? '#F97316' : '#334155'}
                    />
                    <text
                      x={mx}
                      y={my + 2}
                      textAnchor="middle"
                      fill="#FDE047"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      ₹{e.amount_rupees}
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {nodes.map((n) => {
            const fill = n.is_frozen
              ? '#16A34A'
              : n.is_alerted
              ? '#DC2626'
              : '#6366F1';
            const isSelected = selectedNode?.id === n.id;

            return (
              <g
                key={n.id}
                className="cursor-pointer"
                onClick={(ev) => {
                  ev.stopPropagation();
                  setSelectedEdge(null);
                  setSelectedNode(n);
                }}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={isSelected ? '21' : '18'}
                  fill={fill}
                  stroke={isSelected ? '#FDE047' : '#FFFFFF'}
                  strokeWidth={isSelected ? '3' : '2'}
                />
                <text
                  x={n.x}
                  y={(n.y || 0) + 31}
                  textAnchor="middle"
                  fill="#E2E8F0"
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {n.label || n.id}
                </text>
                {zoom >= 1.1 && (
                  <text
                    x={n.x}
                    y={(n.y || 0) + 42}
                    textAnchor="middle"
                    fill="#94A3B8"
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {n.id}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Edge Selection Detail */}
      {selectedEdge && (
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-700 text-slate-100 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-300 font-mono">
              Transaction {selectedEdge.transaction_id}
            </span>
            <button onClick={() => setSelectedEdge(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p>
            From <span className="font-mono">{selectedEdge.source}</span> → To{' '}
            <span className="font-mono">{selectedEdge.target}</span> •{' '}
            <strong>₹{selectedEdge.amount_rupees?.toLocaleString('en-IN')}</strong>
          </p>
          <p className="text-[11px] text-slate-400">
            Trace ID: {selectedEdge.trace_id || '-'} • Timestamp:{' '}
            {selectedEdge.timestamp ? new Date(selectedEdge.timestamp).toLocaleString() : '-'}
          </p>
          {selectedEdge.is_flagged && (
            <p className="text-[11px] text-orange-400 font-semibold">
              Flagged: {(selectedEdge.rules_triggered || []).join(', ')} —{' '}
              {(selectedEdge.alert_reasons || []).join('; ')}
            </p>
          )}
        </div>
      )}

      {/* Node Selection Detail */}
      {selectedNode && (
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-700 text-slate-100 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-green-400">
              Account: {selectedNode.label || selectedNode.id} ({selectedNode.id})
            </span>
            <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-300">
            Balance: ₹{(selectedNode.balance_rupees ?? 0).toLocaleString('en-IN')} • Status:{' '}
            {selectedNode.is_frozen
              ? 'FROZEN'
              : selectedNode.is_alerted
              ? 'SUSPICIOUS / ALERTED'
              : 'NORMAL'}
          </p>
          <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-[10px] text-slate-300">
            {selectedNodeTxns.map((t, i) => (
              <div key={i} className="p-1.5 rounded bg-slate-950">
                {t.transaction_id}: {t.source} → {t.target} (₹{t.amount_rupees})
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
