"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { fmtPct, fmt } from "@/lib/utils";
import type { DCFAssumptions, AssumptionSource, FinancialPeriod } from "@/types/model";
import { ExplainButton } from "./ExplainButton";

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
          <div className="w-1 h-6 bg-[#0f2744] rounded"></div>
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">Model Assumptions</h2>
        </div>
        <Button onClick={runAI} loading={loading} size="sm">
          AI Auto-Fill
        </Button>
      </div>

      {aiError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          AI Error: {aiError}
        </div>
      )}

      {/* Analyst Narrative — structured sections */}
      {narrative && (
        <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-[#0f2744] px-5 py-3 flex items-center justify-between">
            <p className="text-sm font-bold text-white uppercase tracking-wide">Analyst Narrative</p>
            <span className="text-xs text-blue-300 font-mono">BOE AI Engine</span>
          </div>
          <NarrativeSections text={narrative} />
        </div>
      )}

      {/* Revenue Growth Table */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-blue-600 rounded"></div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Revenue Growth (% YoY)</h3>
          <ExplainButton
            ticker={ticker} companyName={companyName} sector={sector}
            assumptionKey="Revenue Growth (CAGR)"
            value={`Base: ${(local.revenueGrowthBase[0] * 100).toFixed(1)}% → ${(local.revenueGrowthBase[local.revenueGrowthBase.length - 1] * 100).toFixed(1)}%`}
            bearValue={`${(local.revenueGrowthBear[0] * 100).toFixed(1)}% Yr1`}
            bullValue={`${(local.revenueGrowthBull[0] * 100).toFixed(1)}% Yr1`}
            label="Revenue Growth"
          />
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
              {(["Bear", "Base", "Bull"] as const).map((s, si) => {
                const key = `revenueGrowth${s}` as keyof DCFAssumptions;
                const arr = local[key] as number[];
                const labelColor = s === "Bear" ? "text-red-700" : s === "Bull" ? "text-green-700" : "text-[#1a3a5c]";
                const rowBg = si % 2 === 0 ? "bg-white" : "bg-gray-50";
                return (
                  <tr key={s} className={rowBg}>
                    <td className={`px-4 py-2 font-bold text-xs uppercase tracking-wide bg-gray-100 border-r border-gray-200 ${labelColor}`}>{s}</td>
                    {arr.map((v, i) => (
                      <td key={i} className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.1"
                          value={(v * 100).toFixed(1)}
                          onChange={(e) => updateGrowth(s, i, parseFloat(e.target.value))}
                          className="w-20 text-right border border-gray-200 rounded px-2 py-1 text-gray-900 font-mono text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-yellow-50"
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
                { label: "EBIT Margin", bearKey: "ebitMarginBear" as const, baseKey: "ebitMarginBase" as const, bullKey: "ebitMarginBull" as const, pct: true,
                  explainValue: `${(local.ebitMarginBase * 100).toFixed(1)}%`, explainBear: `${(local.ebitMarginBear * 100).toFixed(1)}%`, explainBull: `${(local.ebitMarginBull * 100).toFixed(1)}%` },
                { label: "WACC", bearKey: "waccBear" as const, baseKey: "waccBase" as const, bullKey: "waccBull" as const, pct: true,
                  explainValue: `${(local.waccBase * 100).toFixed(1)}%`, explainBear: `${(local.waccBear * 100).toFixed(1)}%`, explainBull: `${(local.waccBull * 100).toFixed(1)}%` },
              ].map(({ label, bearKey, baseKey, bullKey, pct, explainValue, explainBear, explainBull }, i) => (
                <tr key={label} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-4 py-2.5 font-medium text-gray-700">
                    <div className="flex items-center gap-2">
                      {label}
                      <ExplainButton ticker={ticker} companyName={companyName} sector={sector}
                        assumptionKey={label} value={explainValue} bearValue={explainBear} bullValue={explainBull} label={label} />
                    </div>
                  </td>
                  {[bearKey, baseKey, bullKey].map((key, j) => {
                    const val = local[key] as number;
                    const labelColor = j === 0 ? "text-red-700" : j === 2 ? "text-green-700" : "text-[#1a3a5c]";
                    return (
                      <td key={key} className="px-3 py-1.5 text-right">
                        <input
                          type="number" step="0.01"
                          value={pct ? (val * 100).toFixed(2) : val}
                          onChange={(e) => updateField(key, (pct ? parseFloat(e.target.value) / 100 : parseFloat(e.target.value)) as DCFAssumptions[typeof key])}
                          className={`w-24 text-right border border-gray-200 rounded px-2 py-1 font-mono text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-yellow-50 ${labelColor}`}
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-gray-500 uppercase tracking-wide">{label}</label>
                  {pct && (
                    <ExplainButton ticker={ticker} companyName={companyName} sector={sector}
                      assumptionKey={label} value={`${(val * 100).toFixed(1)}%`} label={label} />
                  )}
                </div>
                <input
                  type="number"
                  step={pct ? "0.01" : "1"}
                  value={pct ? (val * 100).toFixed(2) : val}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    updateField(key, (pct ? n / 100 : n) as DCFAssumptions[typeof key]);
                  }}
                  className="w-full text-right border border-gray-200 rounded px-2 py-1.5 text-gray-900 font-mono text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-yellow-50"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Working Capital Drivers */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-teal-600 rounded"></div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Working Capital Schedule</h3>
          <span className="text-xs text-gray-400 font-normal normal-case">Auto-derived from historical averages</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { key: "arDays" as const, label: "AR Days", unit: "days", tip: "Accounts Receivable / Revenue × 365" },
            { key: "apDays" as const, label: "AP Days", unit: "days", tip: "Accounts Payable / COGS × 365" },
            { key: "inventoryDays" as const, label: "Inventory Days", unit: "days", tip: "Inventory / COGS × 365" },
          ].map(({ key, label, unit, tip }) => {
            const val = local[key] as number;
            return (
              <div key={key} className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-gray-500 uppercase tracking-wide">{label}</label>
                  <ExplainButton ticker={ticker} companyName={companyName} sector={sector}
                    assumptionKey={label} value={`${val} ${unit}`} label={label} />
                </div>
                <p className="text-[10px] text-gray-400 mb-2">{tip}</p>
                <div className="flex items-center gap-1">
                  <input
                    type="number" step="1" min="0"
                    value={val}
                    onChange={(e) => updateField(key, parseFloat(e.target.value) as DCFAssumptions[typeof key])}
                    className="w-full text-right border border-gray-200 rounded px-2 py-1.5 text-gray-900 font-mono text-sm focus:ring-1 focus:ring-teal-500 focus:border-teal-500 bg-yellow-50"
                  />
                  <span className="text-xs text-gray-400 flex-shrink-0">{unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Debt & Capital Structure */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-orange-600 rounded"></div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Debt & Capital Structure</h3>
          <span className="text-xs text-gray-400 font-normal normal-case">Drives interest expense and debt schedule</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { key: "openingDebt" as const, label: "Opening Debt ($M)", pct: false, step: 10 },
            { key: "interestRate" as const, label: "Interest Rate", pct: true, step: 0.01 },
            { key: "debtRepaymentPct" as const, label: "Debt Repayment % / yr", pct: true, step: 0.01 },
            { key: "newDebtPct" as const, label: "New Debt % of CapEx", pct: true, step: 0.01 },
            { key: "openingPPE" as const, label: "Opening PP&E ($M)", pct: false, step: 10 },
          ].map(({ key, label, pct, step }) => {
            const val = local[key] as number;
            return (
              <div key={key} className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-gray-500 uppercase tracking-wide">{label}</label>
                  {pct && (
                    <ExplainButton ticker={ticker} companyName={companyName} sector={sector}
                      assumptionKey={label} value={`${(val * 100).toFixed(1)}%`} label={label} />
                  )}
                </div>
                <input
                  type="number" step={step} min="0"
                  value={pct ? (val * 100).toFixed(2) : val}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    updateField(key, (pct ? v / 100 : v) as DCFAssumptions[typeof key]);
                  }}
                  className="w-full text-right border border-gray-200 rounded px-2 py-1.5 text-gray-900 font-mono text-sm focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-yellow-50"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Financing & Capital Return */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-violet-600 rounded"></div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Financing & Capital Return</h3>
          <span className="text-xs text-gray-400 font-normal normal-case">Dividends and buybacks reduce cash available</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { key: "dividendPctNI" as const, label: "Dividends % of Net Income", pct: true },
            { key: "buybackPctNI" as const, label: "Buybacks % of Net Income", pct: true },
          ].map(({ key, label, pct }) => {
            const val = local[key] as number;
            return (
              <div key={key} className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-gray-500 uppercase tracking-wide">{label}</label>
                  <ExplainButton ticker={ticker} companyName={companyName} sector={sector}
                    assumptionKey={label} value={`${(val * 100).toFixed(1)}%`} label={label} />
                </div>
                <input
                  type="number" step="0.01" min="0" max={pct ? "100" : undefined}
                  value={(val * 100).toFixed(2)}
                  onChange={(e) => updateField(key, (parseFloat(e.target.value) / 100) as DCFAssumptions[typeof key])}
                  className="w-full text-right border border-gray-200 rounded px-2 py-1.5 text-gray-900 font-mono text-sm focus:ring-1 focus:ring-violet-500 focus:border-violet-500 bg-yellow-50"
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

const NARRATIVE_SECTIONS = [
  { key: "Business Overview", accent: "bg-slate-600" },
  { key: "Investment Thesis", accent: "bg-[#0f2744]" },
  { key: "Revenue Drivers", accent: "bg-blue-600" },
  { key: "Margin Outlook", accent: "bg-indigo-600" },
  { key: "Capital Allocation", accent: "bg-purple-600" },
  { key: "Key Risks", accent: "bg-red-600" },
  { key: "Valuation Summary", accent: "bg-green-700" },
  { key: "Why Bull Case", accent: "bg-emerald-600" },
  { key: "Why Bear Case", accent: "bg-rose-700" },
];

function NarrativeSections({ text }: { text: string }) {
  const sections = parseSections(text);

  if (sections.length === 0) {
    return (
      <div className="px-5 py-4 bg-blue-50 border-l-4 border-blue-500 text-sm text-gray-700 leading-relaxed whitespace-pre-line">
        {text}
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {sections.map(({ title, body }, i) => {
        const meta = NARRATIVE_SECTIONS.find((s) => s.key.toLowerCase() === title.toLowerCase());
        const accent = meta?.accent ?? "bg-gray-500";
        return (
          <div key={i} className="px-5 py-4 flex gap-4 hover:bg-gray-50 transition-colors">
            <div className={`w-0.5 rounded-full flex-shrink-0 mt-1 self-stretch ${accent}`}></div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{title}</p>
              <p className="text-sm text-gray-700 leading-relaxed">{body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function parseSections(text: string): { title: string; body: string }[] {
  const knownHeaders = NARRATIVE_SECTIONS.map((s) => s.key);
  const result: { title: string; body: string }[] = [];

  for (const header of knownHeaders) {
    const patterns = [
      new RegExp(`\\*\\*${header}\\*\\*[:\\s]*([\\s\\S]*?)(?=\\*\\*(?:${knownHeaders.join("|")})\\*\\*|$)`, "i"),
      new RegExp(`${header}[:\\n]+([\\s\\S]*?)(?=(?:${knownHeaders.join("|")})[:\\n]|$)`, "i"),
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m?.[1]?.trim()) {
        result.push({ title: header, body: m[1].trim().replace(/\n+/g, " ") });
        break;
      }
    }
  }

  return result;
}
