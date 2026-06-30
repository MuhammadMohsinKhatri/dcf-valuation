"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { AssumptionsPanel } from "@/components/model/AssumptionsPanel";
import { DCFOutput } from "@/components/model/DCFOutput";
import { ScenarioSelector } from "@/components/model/ScenarioSelector";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import type { DCFModel, DCFAssumptions, AssumptionSource, Scenario } from "@/types/model";
import { ValuationComps } from "@/components/model/ValuationComps";
import { MDInterview } from "@/components/model/MDInterview";
import { InvestmentMemo } from "@/components/model/InvestmentMemo";
import { QCReview } from "@/components/model/QCReview";
import { FormulaTrace } from "@/components/model/FormulaTrace";
import { FinancialsTab } from "@/components/model/FinancialsTab";
import { AnalystCopilot } from "@/components/model/AnalystCopilot";
import { DCFExecutiveSummary } from "@/components/model/DCFExecutiveSummary";

export default function ModelPage() {
  const { id } = useParams<{ id: string }>();
  const [model, setModel] = useState<DCFModel | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<"output" | "assumptions" | "financials" | "comps" | "interview" | "memo" | "qc" | "trace">("output");

  useEffect(() => {
    fetch(`/api/model?id=${id}`).then((r) => r.json()).then((data) => {
      if (data.modelData) {
        const m = JSON.parse(data.modelData) as DCFModel;
        m.id = data.id;
        setModel(m);
      }
    });
  }, [id]);

  const handleAssumptionsUpdate = useCallback((a: DCFAssumptions, s: AssumptionSource[], narrative?: string) => {
    setModel((prev) => prev ? {
      ...prev,
      assumptions: a,
      assumptionSources: s,
      ...(narrative !== undefined ? { aiNarrative: narrative } : {}),
    } : prev);
  }, []);

  const handleScenarioChange = useCallback((s: Scenario) => {
    setModel((prev) => prev ? { ...prev, activeScenario: s } : prev);
  }, []);

  async function save() {
    if (!model) return;
    setSaving(true);
    await fetch("/api/model", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(model),
    });
    setSaving(false);
  }

  async function exportExcel() {
    if (!model) return;
    setExporting(true);
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(model),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${model.ticker}_DCF_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  if (!model) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading model...</div>
      </div>
    );
  }

  function calcIVPS(scenario: "bear" | "base" | "bull"): number | null {
    const a = model!.assumptions;
    const hist = model!.historicalPeriods;
    if (!hist.length) return null;
    const growthRates = scenario === "bear" ? a.revenueGrowthBear : scenario === "bull" ? a.revenueGrowthBull : a.revenueGrowthBase;
    const ebitMargin = scenario === "bear" ? a.ebitMarginBear : scenario === "bull" ? a.ebitMarginBull : a.ebitMarginBase;
    const wacc = scenario === "bear" ? a.waccBear : scenario === "bull" ? a.waccBull : a.waccBase;
    let rev = hist[0].revenue / 1e6;
    const fcfs: number[] = [];
    const pvFcfs: number[] = [];
    for (let yr = 1; yr <= a.projectionYears; yr++) {
      rev *= (1 + growthRates[yr - 1]);
      const nopat = rev * ebitMargin * (1 - a.taxRate);
      const fcf = nopat + rev * a.depreciationPct - rev * a.capexPct;
      fcfs.push(fcf);
      pvFcfs.push(fcf / Math.pow(1 + wacc, yr - 0.5));
    }
    if (wacc <= a.terminalGrowthRate) return null;
    const tv = (fcfs[a.projectionYears - 1] * (1 + a.terminalGrowthRate)) / (wacc - a.terminalGrowthRate);
    const pvTV = tv / Math.pow(1 + wacc, a.projectionYears);
    const ev = pvFcfs.reduce((s, v) => s + v, 0) + pvTV;
    return (ev - a.netDebt - a.minorityInterest) / a.sharesOutstanding;
  }

  const baseIVPS = calcIVPS("base");
  const bearIVPS = calcIVPS("bear");
  const bullIVPS = calcIVPS("bull");

  const currentPrice = model.currentPrice ?? 0;
  const upside = baseIVPS && currentPrice > 0 ? ((baseIVPS - currentPrice) / currentPrice) * 100 : null;
  const latestPeriod = model.historicalPeriods[0];
  const marketCap = currentPrice > 0 && model.assumptions.sharesOutstanding > 0
    ? (currentPrice * model.assumptions.sharesOutstanding) / 1000
    : null;
  const modelDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-[#0f2744] font-bold text-sm tracking-tight hover:text-[#1a3a5c] transition-colors">BOE DCF</Link>
          <span className="text-gray-200">›</span>
          <span className="font-mono font-bold text-gray-900 text-sm">{model.ticker}</span>
          <span className="text-gray-400 text-sm hidden sm:inline">{model.companyName}</span>
        </div>
        <div className="flex items-center gap-2">
          <ScenarioSelector value={model.activeScenario} onChange={handleScenarioChange} />
          <Button variant="secondary" size="sm" onClick={save} loading={saving}>Save</Button>
          <Button size="sm" onClick={exportExcel} loading={exporting}>Export Excel</Button>
        </div>
      </nav>

      {/* Company Header Strip */}
      <div className="bg-[#0f2744] text-white px-6 py-3 flex items-center justify-between flex-wrap gap-y-2">
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Ticker</p>
            <p className="text-base font-bold font-mono">{model.ticker}</p>
          </div>
          {model.sector && (
            <div className="border-l border-blue-700 pl-6">
              <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Sector</p>
              <p className="text-sm font-medium">{model.sector}</p>
            </div>
          )}
          {model.industry && (
            <div className="border-l border-blue-700 pl-6">
              <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Industry</p>
              <p className="text-sm font-medium">{model.industry}</p>
            </div>
          )}
          {currentPrice > 0 && (
            <div className="border-l border-blue-700 pl-6">
              <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Current Price</p>
              <p className="text-sm font-mono font-bold">${currentPrice.toFixed(2)}</p>
            </div>
          )}
          {marketCap && (
            <div className="border-l border-blue-700 pl-6">
              <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Mkt Cap</p>
              <p className="text-sm font-mono font-bold">${marketCap.toFixed(1)}B</p>
            </div>
          )}
          {baseIVPS && (
            <div className="border-l border-blue-700 pl-6">
              <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Base IVPS</p>
              <p className="text-sm font-mono font-bold">${baseIVPS.toFixed(2)}</p>
            </div>
          )}
          {upside !== null && (
            <div className="border-l border-blue-700 pl-6">
              <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Upside / (Downside)</p>
              <p className={`text-sm font-mono font-bold ${upside >= 0 ? "text-green-400" : "text-red-400"}`}>
                {upside >= 0 ? "+" : ""}{upside.toFixed(1)}%
              </p>
            </div>
          )}
          {latestPeriod && (
            <div className="border-l border-blue-700 pl-6">
              <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Base Year</p>
              <p className="text-sm font-mono">FY{latestPeriod.year}A</p>
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Model Date</p>
          <p className="text-xs text-blue-200 font-mono">{modelDate}</p>
          <p className="text-[10px] text-blue-400 mt-0.5">BOE Group — For Internal Use Only</p>
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-6 overflow-x-auto">
        <div className="flex min-w-max">
          {([
            { id: "output", label: "DCF Output" },
            { id: "assumptions", label: "Assumptions" },
            { id: "financials", label: "Financials" },
            { id: "comps", label: "Comps" },
            { id: "trace", label: "Formula Trace" },
            { id: "interview", label: "MD Interview" },
            { id: "memo", label: "Investment Memo" },
            { id: "qc", label: "QC Review" },
          ] as const).map(({ id: tab, label }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap uppercase tracking-wider ${
                activeTab === tab
                  ? "border-[#0f2744] text-[#0f2744]"
                  : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6">
        {activeTab === "output" && (
          <div className="space-y-6">
            {baseIVPS && bearIVPS && bullIVPS && (
              <DCFExecutiveSummary
                model={model}
                baseIVPS={baseIVPS}
                bearIVPS={bearIVPS}
                bullIVPS={bullIVPS}
              />
            )}
            <DCFOutput model={model} scenario={model.activeScenario} />
          </div>
        )}
        {activeTab === "assumptions" && (
          <AssumptionsPanel
            ticker={model.ticker}
            companyName={model.companyName}
            sector={model.sector ?? ""}
            industry={model.industry ?? ""}
            historicalPeriods={model.historicalPeriods}
            assumptions={model.assumptions}
            sources={model.assumptionSources}
            aiNarrative={model.aiNarrative}
            onUpdate={handleAssumptionsUpdate}
          />
        )}
        {activeTab === "financials" && (
          <FinancialsTab model={model} />
        )}
        {activeTab === "comps" && (
          <ValuationComps model={model} />
        )}
        {activeTab === "trace" && (
          <FormulaTrace model={model} />
        )}
        {activeTab === "interview" && (
          <MDInterview model={model} />
        )}
        {activeTab === "memo" && (
          <InvestmentMemo model={model} />
        )}
        {activeTab === "qc" && (
          <QCReview model={model} />
        )}
      </main>

      <AnalystCopilot
        model={model}
        baseIVPS={baseIVPS}
        bearIVPS={bearIVPS}
        bullIVPS={bullIVPS}
      />
    </div>
  );
}
