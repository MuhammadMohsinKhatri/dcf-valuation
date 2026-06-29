"use client";
import { useState } from "react";
import type { DCFModel } from "@/types/model";

interface ScenarioDiffResult {
  bear: { headline: string; drivers: string[] };
  base: { headline: string; drivers: string[] };
  bull: { headline: string; drivers: string[] };
  keySwing: string;
}

interface Props {
  model: DCFModel;
  bearIVPS: number;
  baseIVPS: number;
  bullIVPS: number;
}

export function ScenarioDiff({ model, bearIVPS, baseIVPS, bullIVPS }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScenarioDiffResult | null>(null);
  const [error, setError] = useState("");

  async function explain() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "scenario_diff",
          ticker: model.ticker,
          companyName: model.companyName,
          assumptions: model.assumptions,
          bearIVPS, baseIVPS, bullIVPS,
        }),
      });
      const data = await res.json() as { result?: ScenarioDiffResult; error?: string };
      if (data.error) { setError(data.error); return; }
      setResult(data.result ?? null);
    } catch { setError("AI request failed"); }
    finally { setLoading(false); }
  }

  const a = model.assumptions;
  const currentPrice = model.currentPrice ?? 0;

  const scenarios = [
    {
      key: "bear" as const,
      label: "Bear Case",
      ivps: bearIVPS,
      wacc: a.waccBear,
      margin: a.ebitMarginBear,
      growth: (a.revenueGrowthBear as number[])[0],
      borderColor: "border-red-400",
      headerBg: "bg-red-700",
      bodyBg: "bg-red-50",
      textColor: "text-red-900",
      driverColor: "text-red-800",
    },
    {
      key: "base" as const,
      label: "Base Case",
      ivps: baseIVPS,
      wacc: a.waccBase,
      margin: a.ebitMarginBase,
      growth: (a.revenueGrowthBase as number[])[0],
      borderColor: "border-blue-500",
      headerBg: "bg-blue-800",
      bodyBg: "bg-blue-50",
      textColor: "text-blue-900",
      driverColor: "text-blue-800",
    },
    {
      key: "bull" as const,
      label: "Bull Case",
      ivps: bullIVPS,
      wacc: a.waccBull,
      margin: a.ebitMarginBull,
      growth: (a.revenueGrowthBull as number[])[0],
      borderColor: "border-green-500",
      headerBg: "bg-green-700",
      bodyBg: "bg-green-50",
      textColor: "text-green-900",
      driverColor: "text-green-800",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-indigo-600 rounded" />
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">Scenario Drivers</h2>
        </div>
        <button onClick={explain} disabled={loading}
          className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 disabled:opacity-40 transition-colors">
          {loading ? "Analyzing…" : result ? "↻ Re-explain" : "💡 Explain Differences"}
        </button>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* Key assumption table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="text-sm w-full border-collapse">
          <thead>
            <tr className="bg-gray-900 text-white">
              <th className="text-left px-4 py-2.5 font-semibold">Assumption</th>
              <th className="px-4 py-2.5 text-right font-semibold text-red-300">Bear</th>
              <th className="px-4 py-2.5 text-right font-semibold text-blue-300">Base</th>
              <th className="px-4 py-2.5 text-right font-semibold text-green-300">Bull</th>
              <th className="px-4 py-2.5 text-right font-semibold text-yellow-300">Δ Range</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Rev Growth Yr 1", bear: a.revenueGrowthBear[0], base: a.revenueGrowthBase[0], bull: a.revenueGrowthBull[0], pct: true },
              { label: "EBIT Margin", bear: a.ebitMarginBear, base: a.ebitMarginBase, bull: a.ebitMarginBull, pct: true },
              { label: "WACC", bear: a.waccBear, base: a.waccBase, bull: a.waccBull, pct: true },
              { label: "Terminal Growth", bear: a.terminalGrowthRate, base: a.terminalGrowthRate, bull: a.terminalGrowthRate, pct: true },
              { label: "Intrinsic Value / Share", bear: bearIVPS, base: baseIVPS, bull: bullIVPS, pct: false },
            ].map(({ label, bear, base, bull, pct }, i) => {
              const fmt = (v: number) => pct ? `${(v * 100).toFixed(1)}%` : `$${v.toFixed(2)}`;
              const range = pct
                ? `${((bull - bear) * 100).toFixed(1)}pp`
                : `$${(bull - bear).toFixed(2)}`;
              return (
                <tr key={label} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-4 py-2 font-medium text-gray-700 text-xs">{label}</td>
                  <td className="px-4 py-2 text-right font-mono text-red-700 text-xs">{fmt(bear as number)}</td>
                  <td className="px-4 py-2 text-right font-mono text-blue-700 text-xs font-semibold bg-blue-50">{fmt(base as number)}</td>
                  <td className="px-4 py-2 text-right font-mono text-green-700 text-xs">{fmt(bull as number)}</td>
                  <td className="px-4 py-2 text-right font-mono text-yellow-700 text-xs font-semibold">{range}</td>
                </tr>
              );
            })}
            {currentPrice > 0 && (
              <tr className="bg-gray-900">
                <td className="px-4 py-2 font-semibold text-gray-300 text-xs">Upside / (Downside)</td>
                <td className={`px-4 py-2 text-right font-mono text-xs ${bearIVPS >= currentPrice ? "text-green-400" : "text-red-400"}`}>
                  {((bearIVPS - currentPrice) / currentPrice * 100).toFixed(1)}%
                </td>
                <td className={`px-4 py-2 text-right font-mono text-xs font-semibold ${baseIVPS >= currentPrice ? "text-green-300" : "text-red-300"}`}>
                  {((baseIVPS - currentPrice) / currentPrice * 100).toFixed(1)}%
                </td>
                <td className={`px-4 py-2 text-right font-mono text-xs ${bullIVPS >= currentPrice ? "text-green-400" : "text-red-400"}`}>
                  {((bullIVPS - currentPrice) / currentPrice * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-2 text-right text-gray-400 text-xs">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* AI explanation cards */}
      {result && (
        <>
          {result.keySwing && (
            <div className="bg-indigo-900 text-white rounded-xl px-5 py-4">
              <p className="text-xs text-indigo-300 uppercase tracking-wide mb-1">Key Swing Factor</p>
              <p className="text-sm font-medium">{result.keySwing}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scenarios.map(({ key, label, ivps, borderColor, headerBg, bodyBg, driverColor }) => {
              const d = result[key];
              return (
                <div key={key} className={`rounded-xl border-2 ${borderColor} overflow-hidden`}>
                  <div className={`${headerBg} px-4 py-3 flex items-center justify-between`}>
                    <span className="text-white font-bold text-sm">{label}</span>
                    <span className="text-white font-mono font-bold">${ivps.toFixed(2)}</span>
                  </div>
                  <div className={`${bodyBg} px-4 py-3`}>
                    <p className={`text-xs font-semibold ${driverColor} mb-2`}>{d.headline}</p>
                    <ul className="space-y-1.5">
                      {d.drivers.map((dr, i) => (
                        <li key={i} className={`text-xs ${driverColor} flex items-start gap-1.5`}>
                          <span className="shrink-0 mt-0.5">•</span>{dr}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
