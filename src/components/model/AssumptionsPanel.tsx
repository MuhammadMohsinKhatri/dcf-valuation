"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
  onUpdate: (a: DCFAssumptions, s: AssumptionSource[]) => void;
}

export function AssumptionsPanel({
  ticker, companyName, sector, industry, historicalPeriods,
  assumptions, sources, onUpdate,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [narrative, setNarrative] = useState("");
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
        onUpdate(data.assumptions, data.sources ?? []);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Model Assumptions</h2>
        <Button onClick={runAI} loading={loading} size="sm">
          ✨ AI Auto-Fill
        </Button>
      </div>

      {aiError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          AI Error: {aiError}
        </div>
      )}

      {narrative && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900 whitespace-pre-line">
          <p className="font-semibold mb-1">Analyst Narrative</p>
          {narrative}
        </div>
      )}

      {/* Revenue Growth */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Revenue Growth (% YoY)</h3>
        <div className="overflow-x-auto">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2 font-medium text-gray-600">Scenario</th>
                {Array.from({ length: 5 }, (_, i) => (
                  <th key={i} className="px-3 py-2 font-medium text-gray-600">Yr {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["Bear", "Base", "Bull"] as const).map((s) => {
                const key = `revenueGrowth${s}` as keyof DCFAssumptions;
                const arr = local[key] as number[];
                return (
                  <tr key={s} className={s === "Bear" ? "bg-red-50" : s === "Bull" ? "bg-green-50" : "bg-yellow-50"}>
                    <td className="px-3 py-1.5 font-medium">{s}</td>
                    {arr.map((v, i) => (
                      <td key={i} className="px-2 py-1">
                        <input
                          type="number"
                          step="0.1"
                          value={(v * 100).toFixed(1)}
                          onChange={(e) => updateGrowth(s, i, parseFloat(e.target.value))}
                          className="w-20 text-right border border-gray-300 rounded px-2 py-1 text-blue-700 font-mono text-sm focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Key metrics */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Key Assumptions</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { key: "ebitMarginBear" as const, label: "EBIT Margin — Bear", pct: true },
            { key: "ebitMarginBase" as const, label: "EBIT Margin — Base", pct: true },
            { key: "ebitMarginBull" as const, label: "EBIT Margin — Bull", pct: true },
            { key: "waccBear" as const, label: "WACC — Bear", pct: true },
            { key: "waccBase" as const, label: "WACC — Base", pct: true },
            { key: "waccBull" as const, label: "WACC — Bull", pct: true },
            { key: "taxRate" as const, label: "Tax Rate", pct: true },
            { key: "terminalGrowthRate" as const, label: "Terminal Growth Rate", pct: true },
            { key: "depreciationPct" as const, label: "D&A % Revenue", pct: true },
            { key: "capexPct" as const, label: "Capex % Revenue", pct: true },
            { key: "sharesOutstanding" as const, label: "Shares Out (M)", pct: false },
            { key: "netDebt" as const, label: "Net Debt ($M)", pct: false },
          ].map(({ key, label, pct }) => {
            const val = local[key] as number;
            return (
              <div key={key}>
                <label className="text-xs text-gray-500 block mb-1">{label}</label>
                <input
                  type="number"
                  step={pct ? "0.1" : "1"}
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
      </section>

      {/* Sources */}
      {sources.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Assumption Sources</h3>
          <div className="space-y-1">
            {sources.map((s, i) => (
              <div key={i} className="text-xs text-gray-600 border-l-2 border-blue-300 pl-3 py-0.5">
                <span className="font-medium text-gray-800">{s.field}:</span> {s.source} — {s.rationale}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
