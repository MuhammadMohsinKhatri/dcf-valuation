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
  section: "income_statement" | "balance_sheet" | "cash_flow" | "dcf" | "per_share";
  keyMetrics: Record<string, string | number>;
}

const SECTION_LABELS: Record<string, string> = {
  income_statement: "Income Statement",
  balance_sheet: "Balance Sheet",
  cash_flow: "Cash Flow Statement",
  dcf: "DCF Valuation",
  per_share: "Per Share Summary",
};

export function SectionExplain({ ticker, companyName, sector, section, keyMetrics }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [error, setError] = useState("");

  async function explain() {
    if (open && result) { setOpen(false); return; }
    setOpen(true);
    if (result) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "explain_statement", ticker, companyName, sector, section, keyMetrics }),
      });
      const data = await res.json() as { result?: ExplainResult; error?: string };
      if (data.error) { setError(data.error); return; }
      setResult(data.result ?? null);
    } catch { setError("AI request failed"); }
    finally { setLoading(false); }
  }

  const confidenceColor = result
    ? result.confidence >= 80 ? "text-green-700 bg-green-50 border-green-200"
    : result.confidence >= 60 ? "text-yellow-700 bg-yellow-50 border-yellow-200"
    : "text-red-700 bg-red-50 border-red-200"
    : "";

  return (
    <div className="w-full">
      <button
        onClick={explain}
        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-[#1a3a5c] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block"></span>
        {open && result ? "Hide AI Analysis" : "AI Explain"}
      </button>

      {open && (
        <div className="mt-3 border border-blue-200 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-[#0f2744] px-4 py-2.5 flex items-center justify-between">
            <div>
              <p className="text-white text-xs font-bold uppercase tracking-wide">{SECTION_LABELS[section]} — AI Analysis</p>
              <p className="text-blue-300 text-[10px] mt-0.5">{ticker} · {sector} · BOE AI Engine</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-blue-300 hover:text-white text-lg leading-none">×</button>
          </div>

          <div className="bg-white px-4 py-4">
            {loading && (
              <div className="flex items-center gap-3 py-4">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                <p className="text-sm text-gray-500">BOE AI Engine is analyzing {SECTION_LABELS[section].toLowerCase()}…</p>
              </div>
            )}

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
            )}

            {result && !loading && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-900 border-l-4 border-[#1a3a5c] pl-3 leading-relaxed">
                  {result.summary}
                </p>
                <ul className="space-y-1.5">
                  {result.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-[#1a3a5c] mt-1 shrink-0 text-xs">▸</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${confidenceColor}`}>
                    AI Confidence: {result.confidence}%
                  </span>
                  <p className="text-[10px] text-gray-400 max-w-xs text-right">{result.confidenceReason}</p>
                </div>
                <button
                  onClick={() => { setResult(null); explain(); }}
                  className="text-[10px] text-gray-400 hover:text-gray-600"
                >
                  Refresh analysis
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
