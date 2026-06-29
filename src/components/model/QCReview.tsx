"use client";
import { useState, useMemo } from "react";
import type { DCFModel } from "@/types/model";

function calcIVPS(model: DCFModel, scenario: "bear" | "base" | "bull"): number {
  const a = model.assumptions;
  const hist = model.historicalPeriods;
  if (!hist.length) return 0;
  const growthKey = `revenueGrowth${scenario.charAt(0).toUpperCase() + scenario.slice(1)}` as keyof typeof a;
  const ebitMargin = scenario === "bear" ? a.ebitMarginBear : scenario === "bull" ? a.ebitMarginBull : a.ebitMarginBase;
  const wacc = scenario === "bear" ? a.waccBear : scenario === "bull" ? a.waccBull : a.waccBase;
  const growthRates = a[growthKey] as number[];
  let rev = hist[0].revenue / 1e6;
  const fcfs: number[] = [];
  const pvFcfs: number[] = [];
  for (let yr = 1; yr <= a.projectionYears; yr++) {
    rev *= (1 + growthRates[yr - 1]);
    const ebit = rev * ebitMargin;
    const nopat = ebit * (1 - a.taxRate);
    const fcf = nopat + rev * a.depreciationPct - rev * a.capexPct;
    fcfs.push(fcf);
    pvFcfs.push(fcf / Math.pow(1 + wacc, yr - 0.5));
  }
  if (wacc <= a.terminalGrowthRate) return 0;
  const tv = (fcfs[a.projectionYears - 1] * (1 + a.terminalGrowthRate)) / (wacc - a.terminalGrowthRate);
  const pvTV = tv / Math.pow(1 + wacc, a.projectionYears);
  const ev = pvFcfs.reduce((s, v) => s + v, 0) + pvTV;
  return (ev - a.netDebt - a.minorityInterest) / a.sharesOutstanding;
}

interface QCResult {
  score: number;
  grade: string;
  critical: Array<{ issue: string; detail: string }>;
  warnings: Array<{ issue: string; detail: string }>;
  passed: string[];
  recommendations: string[];
}

const GRADE_COLOR: Record<string, { bg: string; text: string; bar: string }> = {
  A: { bg: "bg-green-50", text: "text-green-800", bar: "bg-green-500" },
  B: { bg: "bg-blue-50", text: "text-blue-800", bar: "bg-blue-500" },
  C: { bg: "bg-yellow-50", text: "text-yellow-800", bar: "bg-yellow-500" },
  D: { bg: "bg-orange-50", text: "text-orange-800", bar: "bg-orange-500" },
  F: { bg: "bg-red-50", text: "text-red-800", bar: "bg-red-500" },
};

export function QCReview({ model }: { model: DCFModel }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QCResult | null>(null);
  const [error, setError] = useState("");

  const { bearIVPS, baseIVPS, bullIVPS } = useMemo(() => ({
    bearIVPS: calcIVPS(model, "bear"),
    baseIVPS: calcIVPS(model, "base"),
    bullIVPS: calcIVPS(model, "bull"),
  }), [model]);

  async function runQC() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "qc",
          ticker: model.ticker,
          companyName: model.companyName,
          assumptions: model.assumptions,
          historicalPeriods: model.historicalPeriods,
          bearIVPS, baseIVPS, bullIVPS,
          currentPrice: model.currentPrice,
        }),
      });
      const data = await res.json() as { result?: QCResult; error?: string };
      if (data.error) { setError(data.error); return; }
      setResult(data.result ?? null);
    } catch { setError("AI request failed"); }
    finally { setLoading(false); }
  }

  const colors = result ? (GRADE_COLOR[result.grade] ?? GRADE_COLOR["C"]) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
        <div className="bg-gray-900 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base uppercase tracking-wide">AI Model Quality Review</h2>
            <p className="text-gray-400 text-sm mt-1">
              Automated audit — checks assumptions, internal consistency, and best practices
            </p>
          </div>
          <button onClick={runQC} disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 transition-colors">
            {loading ? "Reviewing…" : result ? "↻ Re-run QC" : "Run QC Review"}
          </button>
        </div>
      </div>

      {error && <div className="text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">{error}</div>}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500">Auditing model assumptions and outputs…</p>
          </div>
        </div>
      )}

      {result && colors && !loading && (
        <div className="space-y-5">
          {/* Health Score */}
          <div className={`rounded-2xl border ${colors.bg} px-6 py-5`}>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className={`text-6xl font-bold ${colors.text}`}>{result.grade}</div>
                <div className={`text-sm font-semibold ${colors.text}`}>Model Grade</div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-semibold ${colors.text}`}>Health Score</span>
                  <span className={`text-2xl font-bold ${colors.text}`}>{result.score}/100</span>
                </div>
                <div className="w-full bg-white rounded-full h-3 border border-gray-200">
                  <div className={`h-3 rounded-full transition-all ${colors.bar}`} style={{ width: `${result.score}%` }} />
                </div>
                <p className={`text-xs mt-2 ${colors.text} opacity-80`}>
                  {result.critical.length} critical · {result.warnings.length} warnings · {result.passed.length} passed
                </p>
              </div>
            </div>
          </div>

          {/* Critical issues */}
          {result.critical.length > 0 && (
            <div className="rounded-xl border border-red-300 overflow-hidden">
              <div className="bg-red-700 px-4 py-2.5 flex items-center gap-2">
                <span className="text-white text-sm">🚨</span>
                <span className="text-white text-xs font-bold uppercase tracking-wide">Critical Issues ({result.critical.length})</span>
              </div>
              <div className="divide-y divide-red-100">
                {result.critical.map((c, i) => (
                  <div key={i} className="px-4 py-3 bg-red-50">
                    <p className="text-sm font-semibold text-red-900">{c.issue}</p>
                    <p className="text-xs text-red-700 mt-1">{c.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="rounded-xl border border-yellow-300 overflow-hidden">
              <div className="bg-yellow-600 px-4 py-2.5 flex items-center gap-2">
                <span className="text-white text-sm">⚠️</span>
                <span className="text-white text-xs font-bold uppercase tracking-wide">Warnings ({result.warnings.length})</span>
              </div>
              <div className="divide-y divide-yellow-100">
                {result.warnings.map((w, i) => (
                  <div key={i} className="px-4 py-3 bg-yellow-50">
                    <p className="text-sm font-semibold text-yellow-900">{w.issue}</p>
                    <p className="text-xs text-yellow-700 mt-1">{w.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Passed checks */}
          {result.passed.length > 0 && (
            <div className="rounded-xl border border-green-200 overflow-hidden">
              <div className="bg-green-700 px-4 py-2.5 flex items-center gap-2">
                <span className="text-white text-sm">✅</span>
                <span className="text-white text-xs font-bold uppercase tracking-wide">Passed Checks ({result.passed.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-3 bg-green-50">
                {result.passed.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="text-green-500 shrink-0 text-sm">✓</span>
                    <span className="text-sm text-green-900">{p}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div className="rounded-xl border border-blue-200 overflow-hidden">
              <div className="bg-blue-700 px-4 py-2.5 flex items-center gap-2">
                <span className="text-white text-sm">💡</span>
                <span className="text-white text-xs font-bold uppercase tracking-wide">Recommendations</span>
              </div>
              <ul className="divide-y divide-blue-100">
                {result.recommendations.map((r, i) => (
                  <li key={i} className="px-4 py-3 bg-blue-50 text-sm text-blue-900 flex items-start gap-2">
                    <span className="text-blue-400 shrink-0 mt-0.5">{i + 1}.</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!result && !loading && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm">Click "Run QC Review" to audit your model</p>
          <p className="text-xs mt-1">AI will check assumptions, flag outliers, and verify internal consistency</p>
        </div>
      )}
    </div>
  );
}
