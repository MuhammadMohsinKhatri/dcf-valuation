"use client";
import { useState } from "react";
import { fmt } from "@/lib/utils";
import type { DCFModel } from "@/types/model";

interface Props {
  model: DCFModel;
  baseIVPS: number;
  bearIVPS: number;
  bullIVPS: number;
}

export function DCFExecutiveSummary({ model, baseIVPS, bearIVPS, bullIVPS }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    investmentView: string;
    recommendation: "BUY" | "SELL" | "HOLD";
    conviction: "High" | "Medium" | "Low";
    keyDrivers: string[];
    keyRisks: string[];
  } | null>(null);
  const [generated, setGenerated] = useState(false);

  const a = model.assumptions;
  const currentPrice = model.currentPrice ?? 0;
  const upside = currentPrice > 0 ? ((baseIVPS - currentPrice) / currentPrice) * 100 : null;
  const rec = baseIVPS > currentPrice * 1.1 ? "BUY" : baseIVPS < currentPrice * 0.9 ? "SELL" : "HOLD";
  const recColors = { BUY: "bg-green-700", SELL: "bg-red-700", HOLD: "bg-amber-600" };
  const recBorder = { BUY: "border-green-700 text-green-700", SELL: "border-red-700 text-red-700", HOLD: "border-amber-600 text-amber-600" };
  const baseRevGrowth = a.revenueGrowthBase.reduce((s, v) => s + v, 0) / a.revenueGrowthBase.length;
  const hist = model.historicalPeriods;
  const latest = hist[0];

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "executive_summary",
          ticker: model.ticker,
          companyName: model.companyName,
          sector: model.sector ?? "",
          industry: model.industry ?? "",
          currentPrice,
          baseIVPS, bearIVPS, bullIVPS,
          upside,
          recommendation: rec,
          wacc: a.waccBase,
          terminalGrowthRate: a.terminalGrowthRate,
          ebitMarginBase: a.ebitMarginBase,
          revenueGrowthAvg: baseRevGrowth,
          latestRevenue: latest ? latest.revenue / 1e6 : 0,
          latestEBITMargin: latest ? (latest.ebit / latest.revenue) * 100 : 0,
          projectionYears: a.projectionYears,
        }),
      });
      const json = await res.json() as { result?: typeof data; error?: string };
      if (json.result) { setData(json.result); setGenerated(true); }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-0 shadow-sm">
      {/* Research note header */}
      <div className="bg-white px-6 pt-5 pb-4 border-b border-gray-200">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">BOE Group — Equity Research</p>
            <h2 className="text-lg font-bold text-gray-900">{model.companyName} ({model.ticker})</h2>
            <p className="text-sm text-gray-500 mt-0.5">{model.sector}{model.industry ? ` · ${model.industry}` : ""}</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className={`${recColors[rec as keyof typeof recColors]} text-white font-bold text-base px-5 py-2 rounded-lg`}>
              {rec}
            </span>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest">Target (Base)</p>
              <p className="text-xl font-bold text-gray-900 font-mono">${fmt(baseIVPS, 2)}</p>
            </div>
            {currentPrice > 0 && (
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest">Current</p>
                <p className="text-xl font-bold text-gray-900 font-mono">${fmt(currentPrice, 2)}</p>
              </div>
            )}
            {upside !== null && (
              <div className={`text-right border-l pl-3 ${upside >= 0 ? "border-green-200" : "border-red-200"}`}>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest">Upside</p>
                <p className={`text-xl font-bold font-mono ${upside >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {upside >= 0 ? "+" : ""}{fmt(upside, 1)}%
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Quick stats row */}
        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100 flex-wrap">
          {[
            { label: "Bear IVPS", value: `$${fmt(bearIVPS, 2)}`, color: "text-red-700" },
            { label: "Base IVPS", value: `$${fmt(baseIVPS, 2)}`, color: "text-[#1a3a5c]" },
            { label: "Bull IVPS", value: `$${fmt(bullIVPS, 2)}`, color: "text-green-700" },
            { label: "Base WACC", value: `${fmt(a.waccBase * 100, 1)}%`, color: "text-gray-700" },
            { label: "TGR", value: `${fmt(a.terminalGrowthRate * 100, 1)}%`, color: "text-gray-700" },
            { label: "EBIT Margin", value: `${fmt(a.ebitMarginBase * 100, 1)}%`, color: "text-gray-700" },
            { label: "Rev. Growth (Avg)", value: `${fmt(baseRevGrowth * 100, 1)}%`, color: "text-gray-700" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
              <p className={`text-sm font-bold font-mono ${color}`}>{value}</p>
            </div>
          ))}
          <div className="ml-auto">
            <button
              onClick={generate}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#0f2744] text-white rounded-lg hover:bg-[#1a3a5c] disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></span>
                  Generating…
                </>
              ) : generated ? "Regenerate View" : "Generate Investment View"}
            </button>
          </div>
        </div>
      </div>

      {/* AI-generated investment view */}
      {data && (
        <div className="bg-gray-50 px-6 py-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Investment view text */}
            <div className="lg:col-span-2 space-y-4">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Investment View</p>
                <p className="text-sm text-gray-800 leading-relaxed border-l-4 border-[#0f2744] pl-4">
                  {data.investmentView}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Key Drivers</p>
                  <ul className="space-y-1">
                    {data.keyDrivers.map((d, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-green-600 mt-1 shrink-0 text-xs">▸</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Key Risks</p>
                  <ul className="space-y-1">
                    {data.keyRisks.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-red-500 mt-1 shrink-0 text-xs">▸</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Recommendation panel */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col items-center justify-center gap-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Recommendation</p>
              <span className={`${recColors[data.recommendation]} text-white font-bold text-2xl px-8 py-3 rounded-xl`}>
                {data.recommendation}
              </span>
              <div className="w-full space-y-2 mt-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Target Price</span>
                  <span className="font-mono font-bold text-gray-900">${fmt(baseIVPS, 2)}</span>
                </div>
                {currentPrice > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Current Price</span>
                    <span className="font-mono font-bold text-gray-900">${fmt(currentPrice, 2)}</span>
                  </div>
                )}
                {upside !== null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Implied Upside</span>
                    <span className={`font-mono font-bold ${upside >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {upside >= 0 ? "+" : ""}{fmt(upside, 1)}%
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-xs pt-2 border-t border-gray-100">
                  <span className="text-gray-500">Conviction</span>
                  <span className={`font-bold text-xs px-2 py-0.5 rounded ${
                    data.conviction === "High" ? "bg-green-100 text-green-700" :
                    data.conviction === "Medium" ? "bg-amber-100 text-amber-700" :
                    "bg-red-100 text-red-700"
                  }`}>{data.conviction}</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 text-center mt-1">BOE AI Engine · Internal use only</p>
            </div>
          </div>
        </div>
      )}

      {!data && !loading && (
        <div className="bg-gray-50 px-6 py-4 text-center">
          <p className="text-sm text-gray-400">Click <strong>Generate Investment View</strong> to produce an AI-powered research note summary for {model.ticker}.</p>
        </div>
      )}

      {loading && (
        <div className="bg-gray-50 px-6 py-6 flex items-center justify-center gap-3">
          <div className="w-4 h-4 border-2 border-[#0f2744] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">BOE AI Engine generating investment view for {model.ticker}…</p>
        </div>
      )}
    </div>
  );
}
