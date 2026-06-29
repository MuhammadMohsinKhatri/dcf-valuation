"use client";
import { useState } from "react";

interface ExplainResult {
  summary: string;
  bullets: string[];
  confidence: number;
  confidenceReason: string;
}

interface Props {
  ticker: string;
  companyName: string;
  sector: string;
  assumptionKey: string;
  value: string;
  bearValue?: string;
  bullValue?: string;
  historicalAvg?: string;
  label: string;
}

function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-100 text-green-800 border-green-300"
    : score >= 60 ? "bg-yellow-100 text-yellow-800 border-yellow-300"
    : "bg-red-100 text-red-800 border-red-300";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${color}`}>
      AI Confidence: {score}%
    </span>
  );
}

export function ExplainButton({ ticker, companyName, sector, assumptionKey, value, bearValue, bullValue, historicalAvg, label }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [error, setError] = useState("");

  async function explain() {
    setOpen(true);
    if (result) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "explain_assumption", ticker, companyName, sector, assumptionKey, value, bearValue, bullValue, historicalAvg }),
      });
      const data = await res.json() as { result?: ExplainResult; error?: string };
      if (data.error) { setError(data.error); return; }
      setResult(data.result ?? null);
    } catch { setError("AI request failed"); }
    finally { setLoading(false); }
  }

  return (
    <>
      <button
        onClick={explain}
        title={`Explain ${label}`}
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
      >
        💡 Explain
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gray-900 px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-white font-bold text-sm">💡 {label}</p>
                <p className="text-gray-400 text-xs mt-0.5">{ticker} · {sector}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>

            {/* Value bar */}
            <div className="bg-blue-900 px-5 py-2.5 flex items-center gap-4 text-xs">
              <span className="text-blue-200">Base: <span className="text-white font-mono font-bold">{value}</span></span>
              {bearValue && <span className="text-red-300">Bear: <span className="text-white font-mono">{bearValue}</span></span>}
              {bullValue && <span className="text-green-300">Bull: <span className="text-white font-mono">{bullValue}</span></span>}
              {historicalAvg && <span className="text-yellow-300">Hist Avg: <span className="text-white font-mono">{historicalAvg}</span></span>}
            </div>

            {/* Body */}
            <div className="px-5 py-4 max-h-96 overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-3 text-sm text-gray-500">DeepSeek is analyzing…</span>
                </div>
              )}
              {error && <p className="text-red-600 text-sm">{error}</p>}
              {result && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-gray-900 border-l-4 border-blue-500 pl-3">{result.summary}</p>
                  <ul className="space-y-2">
                    {result.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-blue-500 mt-0.5 shrink-0">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <ConfidenceBadge score={result.confidence} />
                    <p className="text-xs text-gray-400 max-w-xs text-right">{result.confidenceReason}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 pb-4 flex justify-between items-center">
              <button onClick={() => { setResult(null); explain(); }} className="text-xs text-gray-400 hover:text-gray-600">
                ↻ Refresh
              </button>
              <button onClick={() => setOpen(false)} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
