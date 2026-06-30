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
    const fcf = rev * ebitMargin * (1 - a.taxRate) + rev * a.depreciationPct - rev * a.capexPct;
    fcfs.push(fcf);
    pvFcfs.push(fcf / Math.pow(1 + wacc, yr - 0.5));
  }
  if (wacc <= a.terminalGrowthRate) return 0;
  const tv = (fcfs[a.projectionYears - 1] * (1 + a.terminalGrowthRate)) / (wacc - a.terminalGrowthRate);
  const pvTV = tv / Math.pow(1 + wacc, a.projectionYears);
  const ev = pvFcfs.reduce((s, v) => s + v, 0) + pvTV;
  return (ev - a.netDebt - a.minorityInterest) / a.sharesOutstanding;
}

type CheckStatus = "pass" | "warn" | "fail" | "info";

interface Check {
  id: string;
  category: string;
  label: string;
  status: CheckStatus;
  value: string;
  detail: string;
}

function runChecks(model: DCFModel, baseIVPS: number, bearIVPS: number, bullIVPS: number): Check[] {
  const a = model.assumptions;
  const hist = model.historicalPeriods;
  const latest = hist[0];
  const checks: Check[] = [];

  const avgBaseGrowth = a.revenueGrowthBase.reduce((s, v) => s + v, 0) / a.revenueGrowthBase.length;
  const historicalEBIT = latest ? (latest.ebit / latest.revenue) * 100 : 0;

  // ── Valuation ──────────────────────────────────────────────────────────────
  checks.push({
    id: "wacc_range",
    category: "Valuation",
    label: "WACC within reasonable range",
    status: a.waccBase >= 0.06 && a.waccBase <= 0.14 ? "pass" : a.waccBase < 0.05 || a.waccBase > 0.16 ? "fail" : "warn",
    value: `${(a.waccBase * 100).toFixed(1)}%`,
    detail: a.waccBase >= 0.06 && a.waccBase <= 0.14 ? "WACC is within typical 6–14% range." : `WACC of ${(a.waccBase * 100).toFixed(1)}% is ${a.waccBase < 0.06 ? "unusually low — check cost of equity and capital structure." : "unusually high — verify beta and risk premium inputs."}`,
  });

  checks.push({
    id: "wacc_tgr_spread",
    category: "Valuation",
    label: "WACC > Terminal Growth Rate",
    status: a.waccBase > a.terminalGrowthRate + 0.01 ? "pass" : a.waccBase <= a.terminalGrowthRate ? "fail" : "warn",
    value: `${(a.waccBase * 100).toFixed(1)}% vs ${(a.terminalGrowthRate * 100).toFixed(1)}%`,
    detail: a.waccBase > a.terminalGrowthRate ? `Spread of ${((a.waccBase - a.terminalGrowthRate) * 100).toFixed(1)}pp — mathematically valid.` : "WACC must exceed TGR for Gordon Growth to produce a finite value. This model is mathematically invalid.",
  });

  const tvPct = (() => {
    let rev = latest ? latest.revenue / 1e6 : 0;
    const fcfs: number[] = [];
    const pvFcfs: number[] = [];
    for (let yr = 1; yr <= a.projectionYears; yr++) {
      rev *= (1 + a.revenueGrowthBase[yr - 1]);
      const fcf = rev * a.ebitMarginBase * (1 - a.taxRate) + rev * a.depreciationPct - rev * a.capexPct;
      fcfs.push(fcf);
      pvFcfs.push(fcf / Math.pow(1 + a.waccBase, yr - 0.5));
    }
    if (a.waccBase <= a.terminalGrowthRate) return 0;
    const tv = (fcfs[a.projectionYears - 1] * (1 + a.terminalGrowthRate)) / (a.waccBase - a.terminalGrowthRate);
    const pvTV = tv / Math.pow(1 + a.waccBase, a.projectionYears);
    const ev = pvFcfs.reduce((s, v) => s + v, 0) + pvTV;
    return ev > 0 ? (pvTV / ev) * 100 : 0;
  })();

  checks.push({
    id: "tv_pct",
    category: "Valuation",
    label: "Terminal Value % of EV",
    status: tvPct >= 50 && tvPct <= 85 ? "pass" : tvPct < 40 || tvPct > 92 ? "fail" : "warn",
    value: `${tvPct.toFixed(1)}%`,
    detail: tvPct >= 50 && tvPct <= 85 ? "TV as % of EV is within the typical 50–85% range for mature companies." : tvPct > 85 ? `TV is ${tvPct.toFixed(0)}% of EV — very back-loaded. Model is highly sensitive to terminal assumptions.` : `TV is only ${tvPct.toFixed(0)}% of EV — unusually low. Verify projection period FCFs are realistic.`,
  });

  checks.push({
    id: "tgr_range",
    category: "Valuation",
    label: "Terminal Growth Rate realistic",
    status: a.terminalGrowthRate >= 0.01 && a.terminalGrowthRate <= 0.04 ? "pass" : a.terminalGrowthRate <= 0 || a.terminalGrowthRate >= 0.05 ? "fail" : "warn",
    value: `${(a.terminalGrowthRate * 100).toFixed(1)}%`,
    detail: a.terminalGrowthRate >= 0.01 && a.terminalGrowthRate <= 0.04 ? "TGR is within typical 1–4% range (long-run GDP growth)." : a.terminalGrowthRate >= 0.05 ? `TGR of ${(a.terminalGrowthRate * 100).toFixed(1)}% exceeds long-run GDP — implies the company grows faster than the economy in perpetuity.` : `TGR of ${(a.terminalGrowthRate * 100).toFixed(1)}% implies eventual contraction or stagnation.`,
  });

  checks.push({
    id: "scenario_spread",
    category: "Valuation",
    label: "Bear / Base / Bull spread is meaningful",
    status: bullIVPS > bearIVPS * 1.2 ? "pass" : "warn",
    value: `$${bearIVPS.toFixed(0)} / $${baseIVPS.toFixed(0)} / $${bullIVPS.toFixed(0)}`,
    detail: bullIVPS > bearIVPS * 1.2 ? `${((bullIVPS / bearIVPS - 1) * 100).toFixed(0)}% spread between bear and bull — scenarios are differentiated.` : "Bear and Bull IVPS are very close. Consider widening scenario assumptions to capture full range of outcomes.",
  });

  // ── Assumptions ──────────────────────────────────────────────────────────
  checks.push({
    id: "ebit_margin_realistic",
    category: "Assumptions",
    label: "EBIT margin assumptions reasonable",
    status: a.ebitMarginBase >= 0.03 && a.ebitMarginBase <= 0.45 ? "pass" : "warn",
    value: `Bear ${(a.ebitMarginBear * 100).toFixed(1)}% / Base ${(a.ebitMarginBase * 100).toFixed(1)}% / Bull ${(a.ebitMarginBull * 100).toFixed(1)}%`,
    detail: a.ebitMarginBase >= 0.03 && a.ebitMarginBase <= 0.45 ? `Base EBIT margin of ${(a.ebitMarginBase * 100).toFixed(1)}% vs historical ${historicalEBIT.toFixed(1)}%.` : `EBIT margin of ${(a.ebitMarginBase * 100).toFixed(1)}% is outside typical range. Verify against sector benchmarks.`,
  });

  checks.push({
    id: "bear_lt_bull",
    category: "Assumptions",
    label: "Bear < Base < Bull ordering",
    status: a.ebitMarginBear < a.ebitMarginBase && a.ebitMarginBase < a.ebitMarginBull && a.waccBear > a.waccBase && a.waccBase > a.waccBull ? "pass" : "fail",
    value: `EBIT: ${(a.ebitMarginBear * 100).toFixed(1)}% / ${(a.ebitMarginBase * 100).toFixed(1)}% / ${(a.ebitMarginBull * 100).toFixed(1)}%`,
    detail: a.ebitMarginBear < a.ebitMarginBase && a.ebitMarginBase < a.ebitMarginBull ? "Bear/Base/Bull EBIT margins and WACCs are correctly ordered." : "Scenario ordering error: Bear should have lower margins and higher WACC than Bull.",
  });

  checks.push({
    id: "tax_rate",
    category: "Assumptions",
    label: "Tax rate is plausible",
    status: a.taxRate >= 0.15 && a.taxRate <= 0.30 ? "pass" : a.taxRate < 0.10 || a.taxRate > 0.40 ? "fail" : "warn",
    value: `${(a.taxRate * 100).toFixed(1)}%`,
    detail: a.taxRate >= 0.15 && a.taxRate <= 0.30 ? "Tax rate is within typical corporate range (15–30%)." : `Tax rate of ${(a.taxRate * 100).toFixed(1)}% is ${a.taxRate < 0.15 ? "unusually low — verify effective tax rate vs statutory rate." : "unusually high — confirm this is correct for the jurisdiction."}`,
  });

  checks.push({
    id: "capex_da",
    category: "Assumptions",
    label: "CapEx and D&A are consistent",
    status: Math.abs(a.capexPct - a.depreciationPct) < 0.08 ? "pass" : "warn",
    value: `CapEx ${(a.capexPct * 100).toFixed(1)}% / D&A ${(a.depreciationPct * 100).toFixed(1)}%`,
    detail: Math.abs(a.capexPct - a.depreciationPct) < 0.08 ? "CapEx and D&A are within 8pp of each other — reasonable for steady-state." : `CapEx-D&A gap of ${Math.abs((a.capexPct - a.depreciationPct) * 100).toFixed(1)}pp. ${a.capexPct > a.depreciationPct ? "CapEx > D&A implies expansion capex — confirm with management guidance." : "D&A > CapEx implies underinvestment or asset wind-down."}`,
  });

  // ── Data Integrity ────────────────────────────────────────────────────────
  checks.push({
    id: "shares_positive",
    category: "Data Integrity",
    label: "Shares outstanding is populated",
    status: a.sharesOutstanding > 0 ? "pass" : "fail",
    value: a.sharesOutstanding > 0 ? `${a.sharesOutstanding.toFixed(1)}M` : "0",
    detail: a.sharesOutstanding > 0 ? `${a.sharesOutstanding.toFixed(1)}M shares — per share metrics are valid.` : "Shares outstanding is zero. Per share values (IVPS, EPS) cannot be computed.",
  });

  checks.push({
    id: "historical_data",
    category: "Data Integrity",
    label: "Historical data is loaded",
    status: hist.length >= 3 ? "pass" : hist.length >= 1 ? "warn" : "fail",
    value: `${hist.length} year${hist.length !== 1 ? "s" : ""}`,
    detail: hist.length >= 3 ? `${hist.length} years of historical data available — sufficient for trend analysis.` : hist.length >= 1 ? "Only 1–2 years of history. More historical data improves assumption calibration." : "No historical data loaded. Run AI Auto-Fill or manually load financials.",
  });

  checks.push({
    id: "revenue_positive",
    category: "Data Integrity",
    label: "Latest revenue is positive",
    status: latest && latest.revenue > 0 ? "pass" : "fail",
    value: latest ? `$${(latest.revenue / 1e6).toFixed(0)}M` : "—",
    detail: latest && latest.revenue > 0 ? `FY${latest.year} revenue: $${(latest.revenue / 1e6).toFixed(0)}M — base for projections.` : "Revenue data missing. Cannot build revenue-based projections.",
  });

  checks.push({
    id: "growth_deceleration",
    category: "Data Integrity",
    label: "Revenue growth decelerates over time",
    status: a.revenueGrowthBase[0] >= a.revenueGrowthBase[a.revenueGrowthBase.length - 1] ? "pass" : "warn",
    value: `Yr1: ${(a.revenueGrowthBase[0] * 100).toFixed(1)}% → Yr${a.revenueGrowthBase.length}: ${(a.revenueGrowthBase[a.revenueGrowthBase.length - 1] * 100).toFixed(1)}%`,
    detail: a.revenueGrowthBase[0] >= a.revenueGrowthBase[a.revenueGrowthBase.length - 1] ? "Growth decelerates as expected for a maturing business." : "Growth accelerates over the projection period — requires strong justification (new product cycle, market expansion).",
  });

  checks.push({
    id: "avg_growth_reasonable",
    category: "Data Integrity",
    label: "Average revenue growth is realistic",
    status: avgBaseGrowth <= 0.25 ? "pass" : avgBaseGrowth <= 0.35 ? "warn" : "fail",
    value: `${(avgBaseGrowth * 100).toFixed(1)}% CAGR`,
    detail: avgBaseGrowth <= 0.25 ? `${(avgBaseGrowth * 100).toFixed(1)}% average growth is achievable for the base case.` : `${(avgBaseGrowth * 100).toFixed(1)}% average growth is aggressive. Ensure it is supported by specific catalysts and precedent.`,
  });

  return checks;
}

const STATUS_CONFIG: Record<CheckStatus, { icon: string; bg: string; text: string; border: string; dot: string }> = {
  pass:  { icon: "✓", bg: "bg-green-50",  text: "text-green-800",  border: "border-green-100", dot: "bg-green-500" },
  warn:  { icon: "!", bg: "bg-amber-50",  text: "text-amber-800",  border: "border-amber-100", dot: "bg-amber-500" },
  fail:  { icon: "✕", bg: "bg-red-50",    text: "text-red-800",    border: "border-red-100",   dot: "bg-red-600" },
  info:  { icon: "i", bg: "bg-blue-50",   text: "text-blue-800",   border: "border-blue-100",  dot: "bg-blue-400" },
};

export function QCReview({ model }: { model: DCFModel }) {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRecs, setAiRecs] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  const { bearIVPS, baseIVPS, bullIVPS } = useMemo(() => ({
    bearIVPS: calcIVPS(model, "bear"),
    baseIVPS: calcIVPS(model, "base"),
    bullIVPS: calcIVPS(model, "bull"),
  }), [model]);

  const checks = useMemo(() => runChecks(model, baseIVPS, bearIVPS, bullIVPS), [model, baseIVPS, bearIVPS, bullIVPS]);

  const passCount  = checks.filter((c) => c.status === "pass").length;
  const warnCount  = checks.filter((c) => c.status === "warn").length;
  const failCount  = checks.filter((c) => c.status === "fail").length;
  const score = Math.round((passCount / checks.length) * 100 - failCount * 8 - warnCount * 2);
  const clampedScore = Math.max(0, Math.min(100, score));
  const grade = clampedScore >= 90 ? "A" : clampedScore >= 78 ? "B" : clampedScore >= 65 ? "C" : clampedScore >= 50 ? "D" : "F";
  const gradeColor = { A: "text-green-700", B: "text-blue-700", C: "text-amber-600", D: "text-orange-600", F: "text-red-700" }[grade];

  const categories = [...new Set(checks.map((c) => c.category))];

  async function getAIRecommendations() {
    setAiLoading(true);
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
          checkResults: checks.filter((c) => c.status !== "pass").map((c) => ({ label: c.label, status: c.status, detail: c.detail })),
        }),
      });
      const data = await res.json() as { result?: { recommendations: string[] }; error?: string };
      if (data.error) { setError(data.error); return; }
      setAiRecs(data.result?.recommendations ?? []);
    } catch { setError("AI request failed"); }
    finally { setAiLoading(false); }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#0f2744] rounded-xl px-6 py-5 flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-sm uppercase tracking-widest">Model Quality Review</h2>
          <p className="text-blue-300 text-xs mt-1">{model.ticker} · {checks.length} automated checks across {categories.length} categories</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className={`text-4xl font-bold ${gradeColor} bg-white rounded-lg w-14 h-14 flex items-center justify-center`}>{grade}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-white font-mono">{clampedScore}<span className="text-lg text-blue-300">/100</span></p>
            <p className="text-xs text-blue-300 mt-0.5">
              <span className="text-green-400 font-semibold">{passCount} pass</span>
              {" · "}
              <span className="text-amber-400 font-semibold">{warnCount} warn</span>
              {" · "}
              <span className="text-red-400 font-semibold">{failCount} fail</span>
            </p>
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3">
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-gray-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${clampedScore >= 80 ? "bg-green-500" : clampedScore >= 60 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${clampedScore}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 font-mono flex-shrink-0">{clampedScore}/100</span>
        </div>
      </div>

      {/* Checks by category */}
      {categories.map((cat) => {
        const catChecks = checks.filter((c) => c.category === cat);
        const catFail = catChecks.filter((c) => c.status === "fail").length;
        const catWarn = catChecks.filter((c) => c.status === "warn").length;
        return (
          <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
              <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">{cat}</p>
              <div className="flex items-center gap-2 text-xs">
                {catFail > 0 && <span className="text-red-600 font-semibold">{catFail} fail</span>}
                {catWarn > 0 && <span className="text-amber-600 font-semibold">{catWarn} warn</span>}
                {catFail === 0 && catWarn === 0 && <span className="text-green-600 font-semibold">All pass</span>}
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {catChecks.map((check) => {
                const cfg = STATUS_CONFIG[check.status];
                return (
                  <div key={check.id} className={`px-5 py-3.5 flex items-start gap-4 ${cfg.bg}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.dot}`}>
                      <span className="text-white text-[10px] font-bold">{cfg.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className={`text-sm font-semibold ${cfg.text}`}>{check.label}</p>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${cfg.text} ${cfg.border} bg-white`}>
                          {check.value}
                        </span>
                      </div>
                      <p className={`text-xs mt-1 leading-relaxed ${cfg.text} opacity-80`}>{check.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* AI Recommendations */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">AI Analyst Recommendations</p>
          <button
            onClick={getAIRecommendations}
            disabled={aiLoading}
            className="text-xs font-semibold px-3 py-1.5 bg-[#0f2744] text-white rounded-lg hover:bg-[#1a3a5c] disabled:opacity-50 transition-colors"
          >
            {aiLoading ? "Analyzing…" : aiRecs ? "Refresh" : "Get AI Analysis"}
          </button>
        </div>

        {error && <p className="px-5 py-3 text-sm text-red-600">{error}</p>}

        {aiLoading && (
          <div className="px-5 py-6 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-[#0f2744] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">BOE AI Engine reviewing {warnCount + failCount} flagged check{warnCount + failCount !== 1 ? "s" : ""}…</p>
          </div>
        )}

        {aiRecs && !aiLoading && (
          <ul className="divide-y divide-gray-100">
            {aiRecs.map((r, i) => (
              <li key={i} className="px-5 py-3 flex items-start gap-3">
                <span className="text-xs font-bold text-[#1a3a5c] mt-0.5 flex-shrink-0">{i + 1}.</span>
                <p className="text-sm text-gray-700">{r}</p>
              </li>
            ))}
          </ul>
        )}

        {!aiRecs && !aiLoading && (
          <p className="px-5 py-4 text-sm text-gray-400">
            Click <strong>Get AI Analysis</strong> to receive BOE AI Engine recommendations based on the {warnCount + failCount} flagged checks above.
          </p>
        )}
      </div>
    </div>
  );
}
