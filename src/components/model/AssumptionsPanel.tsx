"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { fmtPct, fmt } from "@/lib/utils";
import type { DCFAssumptions, AssumptionSource, FinancialPeriod } from "@/types/model";

interface Props {
  ticker: string;
  companyName: string;
  sector: string;
  industry: string;
  historicalPeriods: FinancialPeriod[];
  assumptions: DCFAssumptions;
  sources: AssumptionSource[];
  aiNarrative?: string;
  onUpdate: (a: DCFAssumptions, s: AssumptionSource[], narrative?: string) => void;
}

export function AssumptionsPanel({
  ticker, companyName, sector, industry, historicalPeriods,
  assumptions, sources, aiNarrative, onUpdate,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [narrative, setNarrative] = useState(aiNarrative ?? "");
  const [aiError, setAiError] = useState("");
  const [local, setLocal] = useState<DCFAssumptions>(assumptions);

  async function runAI() {
    setLoading(true);
    setAiError("");
    try {
      const res = await fetch("/api/assumptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, companyName, sector, industry, historicalPeriods }),
      });
      const text = await res.text();
      if (!text) { setAiError("Empty response from AI service"); return; }
      const data = JSON.parse(text);
      if (data.error) { setAiError(data.error); return; }
      if (data.assumptions) {
        setLocal(data.assumptions);
        setNarrative(data.narrative ?? "");
        onUpdate(data.assumptions, data.sources ?? [], data.narrative ?? "");
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setLoading(false);
    }
  }

  function updateField<K extends keyof DCFAssumptions>(key: K, value: DCFAssumptions[K]) {
    const updated = { ...local, [key]: value };
    setLocal(updated);
    onUpdate(updated, sources);
  }

  function updateGrowth(scenario: "Base" | "Bear" | "Bull", yr: number, val: number) {
    const key = `revenueGrowth${scenario}` as keyof DCFAssumptions;
    const arr = [...(local[key] as number[])];
    arr[yr] = val / 100;
    updateField(key as keyof DCFAssumptions, arr as DCFAssumptions[typeof key]);
  }

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-gray-800 rounded"></div>
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">Model Assumptions</h2>
        </div>
        <Button onClick={runAI} loading={loading} size="sm">
          ✨ AI Auto-Fill
        </Button>
      </div>

      {aiError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          AI Error: {aiError}
        </div>
      )}

      {/* Analyst Narrative */}
      {narrative && (
        <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-900 px-5 py-3 flex items-center gap-2">
            <span className="text-yellow-400 text-sm">✦</span>
            <p className="text-sm font-bold text-white uppercase tracking-wide">Analyst Narrative</p>
            <span className="ml-auto text-xs text-gray-400 font-mono">AI Generated — DeepSeek</span>
          </div>
          <div className="bg-blue-50 px-5 py-4 text-sm text-gray-700 leading-relaxed whitespace-pre-line border-l-4 border-blue-500">
            {narrative}
          </div>
        </div>
      )}

      {/* Revenue Growth Table */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-blue-600 rounded"></div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Revenue Growth (% YoY)</h3>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="text-left px-4 py-3 w-32 font-semibold tracking-wide">Scenario</th>
                {Array.from({ length: 5 }, (_, i) => (
                  <th key={i} className="px-4 py-3 font-semibold tracking-wide text-right">Yr {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["Bear", "Base", "Bull"] as const).map((s) => {
                const key = `revenueGrowth${s}` as keyof DCFAssumptions;
                const arr = local[key] as number[];
                const headerBg = s === "Bear" ? "bg-red-800" : s === "Bull" ? "bg-green-800" : "bg-yellow-700";
                const rowBg = s === "Bear" ? "bg-red-50" : s === "Bull" ? "bg-green-50" : "bg-yellow-50";
                return (
                  <tr key={s} className={rowBg}>
                    <td className={`px-4 py-2 font-bold text-white text-xs uppercase tracking-wide ${headerBg}`}>{s}</td>
                    {arr.map((v, i) => (
                      <td key={i} className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.1"
                          value={(v * 100).toFixed(1)}
                          onChange={(e) => updateGrowth(s, i, parseFloat(e.target.value))}
                          className="w-20 text-right border border-gray-300 rounded px-2 py-1 text-blue-700 font-mono text-sm focus:ring-1 focus:ring-blue-400 bg-white"
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Key Assumptions */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-blue-600 rounded"></div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Key Assumptions</h3>
        </div>
        <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="text-left px-4 py-3 font-semibold tracking-wide">Parameter</th>
                <th className="text-right px-4 py-3 font-semibold tracking-wide w-36">Bear</th>
                <th className="text-right px-4 py-3 font-semibold tracking-wide w-36">Base</th>
                <th className="text-right px-4 py-3 font-semibold tracking-wide w-36">Bull</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "EBIT Margin", bearKey: "ebitMarginBear" as const, baseKey: "ebitMarginBase" as const, bullKey: "ebitMarginBull" as const, pct: true },
                { label: "WACC", bearKey: "waccBear" as const, baseKey: "waccBase" as const, bullKey: "waccBull" as const, pct: true },
              ].map(({ label, bearKey, baseKey, bullKey, pct }, i) => (
                <tr key={label} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-4 py-2.5 font-medium text-gray-700">{label}</td>
                  {[bearKey, baseKey, bullKey].map((key, j) => {
                    const val = local[key] as number;
                    const color = j === 0 ? "text-red-700" : j === 2 ? "text-green-700" : "text-yellow-700";
                    return (
                      <td key={key} className="px-3 py-1.5 text-right">
                        <input
                          type="number" step="0.01"
                          value={pct ? (val * 100).toFixed(2) : val}
                          onChange={(e) => updateField(key, (pct ? parseFloat(e.target.value) / 100 : parseFloat(e.target.value)) as DCFAssumptions[typeof key])}
                          className={`w-24 text-right border border-gray-300 rounded px-2 py-1 font-mono text-sm focus:ring-1 focus:ring-blue-400 ${color}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Single value assumptions */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { key: "taxRate" as const, label: "Tax Rate", pct: true },
            { key: "terminalGrowthRate" as const, label: "Terminal Growth Rate", pct: true },
            { key: "depreciationPct" as const, label: "D&A % Revenue", pct: true },
            { key: "capexPct" as const, label: "CapEx % Revenue", pct: true },
            { key: "sharesOutstanding" as const, label: "Shares Out (M)", pct: false },
            { key: "netDebt" as const, label: "Net Debt ($M)", pct: false },
          ].map(({ key, label, pct }) => {
            const val = local[key] as number;
            return (
              <div key={key} className="bg-white border border-gray-200 rounded-lg p-3">
                <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">{label}</label>
                <input
                  type="number"
                  step={pct ? "0.01" : "1"}
                  value={pct ? (val * 100).toFixed(2) : val}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    updateField(key, (pct ? n / 100 : n) as DCFAssumptions[typeof key]);
                  }}
                  className="w-full text-right border border-gray-300 rounded px-2 py-1.5 text-blue-700 font-mono text-sm focus:ring-1 focus:ring-blue-400"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Assumption Sources */}
      {sources.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-1 h-6 bg-gray-600 rounded"></div>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Assumption Sources</h3>
          </div>
          <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="text-sm w-full border-collapse">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="text-left px-4 py-3 font-semibold tracking-wide w-48">Parameter</th>
                  <th className="text-left px-4 py-3 font-semibold tracking-wide w-48">Source</th>
                  <th className="text-left px-4 py-3 font-semibold tracking-wide">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-700">{s.field}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{s.source}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{s.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
