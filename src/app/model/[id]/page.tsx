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

export default function ModelPage() {
  const { id } = useParams<{ id: string }>();
  const [model, setModel] = useState<DCFModel | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<"output" | "assumptions" | "financials" | "comps">("output");

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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-blue-700 font-bold text-lg">BOE DCF</Link>
          <span className="text-gray-300">|</span>
          <span className="font-mono font-bold text-gray-800">{model.ticker}</span>
          <span className="text-gray-600 text-sm">{model.companyName}</span>
        </div>
        <div className="flex items-center gap-3">
          <ScenarioSelector value={model.activeScenario} onChange={handleScenarioChange} />
          <Button variant="secondary" size="sm" onClick={save} loading={saving}>Save</Button>
          <Button size="sm" onClick={exportExcel} loading={exporting}>Export Excel</Button>
        </div>
      </nav>

      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex">
          {(["output", "assumptions", "financials", "comps"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {activeTab === "output" && (
          <DCFOutput model={model} scenario={model.activeScenario} />
        )}
        {activeTab === "assumptions" && (
          <AssumptionsPanel
            ticker={model.ticker}
            companyName={model.companyName}
            sector=""
            industry=""
            historicalPeriods={model.historicalPeriods}
            assumptions={model.assumptions}
            sources={model.assumptionSources}
            aiNarrative={model.aiNarrative}
            onUpdate={handleAssumptionsUpdate}
          />
        )}
        {activeTab === "financials" && (() => {
          const a = model.assumptions;
          const hist = model.historicalPeriods;
          const sh = a.sharesOutstanding;
          const growthRates = a.revenueGrowthBase;
          const projYears = a.projectionYears ?? 5;

          // Build projected periods from base case assumptions
          const projected = [];
          let rev = hist[0].revenue / 1e6;
          for (let yr = 0; yr < projYears; yr++) {
            rev = rev * (1 + growthRates[yr]);
            const ebit = rev * a.ebitMarginBase;
            const da = rev * a.depreciationPct;
            const capex = rev * a.capexPct;
            const ebitda = ebit + da;
            const nopat = ebit * (1 - a.taxRate);
            const fcf = nopat + da - capex;
            const netIncome = nopat;
            const grossProfit = rev * (hist[0].grossProfit / (hist[0].revenue / 1e6));
            projected.push({
              year: hist[0].year + yr + 1,
              revenue: rev * 1e6,
              grossProfit: grossProfit * 1e6,
              ebitda: ebitda * 1e6,
              ebit: ebit * 1e6,
              da: da * 1e6,
              capex: capex * 1e6,
              netIncome: netIncome * 1e6,
              fcf: fcf * 1e6,
              operatingCashFlow: (nopat + da) * 1e6,
              isProjected: true,
            });
          }

          type ColData = {
            year: number; isProjected?: boolean;
            revenue: number; grossProfit: number; ebit: number; netIncome: number;
            ebitda?: number; da?: number;
            depreciationAmortization?: number; freeCashFlow?: number; capex?: number;
            operatingCashFlow?: number; fcf?: number;
            interestExpense?: number; taxExpense?: number;
            equity?: number; cash?: number; accountsReceivable?: number; inventory?: number;
            totalCurrentAssets?: number; ppe?: number; totalAssets?: number;
            accountsPayable?: number; shortTermDebt?: number; totalCurrentLiabilities?: number;
            longTermDebt?: number; totalLiabilities?: number;
          };

          const allCols: ColData[] = [...[...hist].reverse(), ...projected];

          const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
          const pct = (v: number) => `${v >= 0 ? "" : ""}${v.toFixed(1)}%`;

          return (
          <div className="space-y-10 overflow-x-auto">

            {/* Per Share Summary — all historical + projected */}
            {sh > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-1 h-6 bg-blue-700 rounded"></div>
                  <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">Per Share Summary ($)</h2>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                  <table className="text-sm w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-900 text-white">
                        <th className="text-left px-4 py-3 w-48 font-semibold tracking-wide">Metric</th>
                        {allCols.map((c) => (
                          <th key={c.year} className={`px-4 py-3 text-right font-semibold tracking-wide ${c.isProjected ? "text-blue-300" : ""}`}>
                            FY{c.year}{c.isProjected ? "E" : "A"}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "Revenue / Share", fn: (c: typeof allCols[0]) => c.revenue / 1e6 / sh },
                        { label: "Gross Profit / Share", fn: (c: typeof allCols[0]) => c.grossProfit / 1e6 / sh },
                        { label: "EBIT / Share", fn: (c: typeof allCols[0]) => c.ebit / 1e6 / sh },
                        { label: "EPS (Net Income / Share)", fn: (c: typeof allCols[0]) => c.netIncome / 1e6 / sh },
                        { label: "FCF / Share", fn: (c: typeof allCols[0]) => (c.fcf ?? c.freeCashFlow ?? 0) / 1e6 / sh },
                        { label: "Book Value / Share", fn: (c: typeof allCols[0]) => (c.equity ?? 0) / 1e6 / sh },
                        { label: "Cash / Share", fn: (c: typeof allCols[0]) => (c.cash ?? 0) / 1e6 / sh },
                      ].map(({ label, fn }, i) => (
                        <tr key={label} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          <td className="px-4 py-2.5 font-medium text-gray-700">{label}</td>
                          {allCols.map((c) => {
                            const val = fn(c);
                            return (
                              <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-semibold ${c.isProjected ? "text-blue-700" : "text-gray-800"}`}>
                                ${val.toFixed(2)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400 mt-2">Blue columns = projected (Base Case). Historical = actual reported figures.</p>
              </div>
            )}

            {/* Income Statement */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-1 h-6 bg-blue-600 rounded"></div>
                <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">Income Statement <span className="text-gray-400 font-normal normal-case text-sm">($M)</span></h2>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                <table className="text-sm w-full border-collapse bg-white">
                  <thead>
                    <tr className="bg-gray-900 text-white">
                      <th className="text-left px-4 py-3 w-64 font-semibold tracking-wide">Line Item</th>
                      {allCols.map((c) => (
                        <th key={c.year} className={`px-4 py-3 text-right font-semibold tracking-wide ${c.isProjected ? "text-blue-300" : ""}`}>
                          FY{c.year}{c.isProjected ? "E" : "A"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-blue-50 border-t-2 border-blue-200">
                      <td className="px-4 py-2.5 font-bold text-gray-900">Revenue</td>
                      {allCols.map((c) => <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-bold ${c.isProjected ? "text-blue-700" : "text-gray-900"}`}>{n(c.revenue / 1e6)}</td>)}
                    </tr>
                    <tr className="bg-blue-50">
                      <td className="px-4 py-1.5 text-xs text-blue-600 pl-8">YoY Growth %</td>
                      {allCols.map((c, i) => {
                        const prev = allCols[i - 1];
                        const g = prev ? ((c.revenue - prev.revenue) / prev.revenue) * 100 : null;
                        return <td key={c.year} className={`px-4 py-1.5 text-right text-xs font-mono ${c.isProjected ? "text-blue-500" : "text-blue-600"}`}>{g !== null ? `${g >= 0 ? "+" : ""}${g.toFixed(1)}%` : "—"}</td>;
                      })}
                    </tr>
                    <tr className="bg-white">
                      <td className="px-4 py-2 text-gray-600 pl-8">Cost of Revenue (COGS)</td>
                      {allCols.map((c) => <td key={c.year} className={`px-4 py-2 text-right font-mono ${c.isProjected ? "text-blue-600" : "text-gray-600"}`}>({n((c.revenue - c.grossProfit) / 1e6)})</td>)}
                    </tr>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td className="px-4 py-2.5 font-semibold text-gray-800">Gross Profit</td>
                      {allCols.map((c) => <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-semibold ${c.isProjected ? "text-blue-700" : "text-gray-800"}`}>{n(c.grossProfit / 1e6)}</td>)}
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-1.5 text-xs text-gray-500 pl-8">Gross Margin %</td>
                      {allCols.map((c) => <td key={c.year} className="px-4 py-1.5 text-right text-xs font-mono text-gray-500">{pct((c.grossProfit / c.revenue) * 100)}</td>)}
                    </tr>
                    <tr className="bg-white border-t border-gray-200">
                      <td className="px-4 py-2.5 font-semibold text-gray-800">EBITDA</td>
                      {allCols.map((c) => {
                        const ebitda = c.isProjected ? (c.ebitda ?? 0) : (c.ebit + (c.depreciationAmortization ?? 0));
                        return <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-semibold ${c.isProjected ? "text-blue-700" : "text-gray-800"}`}>{n(ebitda / 1e6)}</td>;
                      })}
                    </tr>
                    <tr className="bg-white">
                      <td className="px-4 py-1.5 text-xs text-gray-500 pl-8">EBITDA Margin %</td>
                      {allCols.map((c) => {
                        const ebitda = c.isProjected ? (c.ebitda ?? 0) : (c.ebit + (c.depreciationAmortization ?? 0));
                        return <td key={c.year} className="px-4 py-1.5 text-right text-xs font-mono text-gray-500">{pct((ebitda / c.revenue) * 100)}</td>;
                      })}
                    </tr>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td className="px-4 py-2.5 font-semibold text-gray-800">EBIT (Operating Income)</td>
                      {allCols.map((c) => <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-semibold ${c.isProjected ? "text-blue-700" : "text-gray-800"}`}>{n(c.ebit / 1e6)}</td>)}
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-1.5 text-xs text-gray-500 pl-8">EBIT Margin %</td>
                      {allCols.map((c) => <td key={c.year} className="px-4 py-1.5 text-right text-xs font-mono text-gray-500">{pct((c.ebit / c.revenue) * 100)}</td>)}
                    </tr>
                    <tr className="bg-white">
                      <td className="px-4 py-2 text-gray-600 pl-8">Interest Expense</td>
                      {allCols.map((c) => <td key={c.year} className={`px-4 py-2 text-right font-mono ${c.isProjected ? "text-blue-500" : "text-gray-600"}`}>{c.isProjected ? "—" : `(${n((c.interestExpense ?? 0) / 1e6)})`}</td>)}
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-2 text-gray-600 pl-8">Income Tax Expense</td>
                      {allCols.map((c) => {
                        const tax = c.isProjected ? c.ebit * a.taxRate : (c.taxExpense ?? 0);
                        return <td key={c.year} className={`px-4 py-2 text-right font-mono ${c.isProjected ? "text-blue-500" : "text-gray-600"}`}>({n(tax / 1e6)})</td>;
                      })}
                    </tr>
                    <tr className="bg-blue-900 text-white border-t-2 border-blue-700">
                      <td className="px-4 py-2.5 font-bold">Net Income</td>
                      {allCols.map((c) => <td key={c.year} className="px-4 py-2.5 text-right font-mono font-bold">{n(c.netIncome / 1e6)}</td>)}
                    </tr>
                    <tr className="bg-blue-800 text-blue-200">
                      <td className="px-4 py-1.5 text-xs pl-8">Net Margin %</td>
                      {allCols.map((c) => <td key={c.year} className="px-4 py-1.5 text-right text-xs font-mono">{pct((c.netIncome / c.revenue) * 100)}</td>)}
                    </tr>
                    {sh > 0 && (
                      <tr className="bg-blue-800 text-blue-200">
                        <td className="px-4 py-1.5 text-xs pl-8">EPS ($)</td>
                        {allCols.map((c) => <td key={c.year} className="px-4 py-1.5 text-right text-xs font-mono">${(c.netIncome / 1e6 / sh).toFixed(2)}</td>)}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Balance Sheet */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-1 h-6 bg-green-600 rounded"></div>
                <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">Balance Sheet <span className="text-gray-400 font-normal normal-case text-sm">($M)</span></h2>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                <table className="text-sm w-full border-collapse bg-white">
                  <thead>
                    <tr className="bg-gray-900 text-white">
                      <th className="text-left px-4 py-3 w-64 font-semibold tracking-wide">Line Item</th>
                      {allCols.map((c) => (
                        <th key={c.year} className={`px-4 py-3 text-right font-semibold tracking-wide ${c.isProjected ? "text-blue-300" : ""}`}>
                          FY{c.year}{c.isProjected ? "E" : "A"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-green-900 text-white">
                      <td className="px-4 py-2 font-bold tracking-wide text-xs uppercase">Assets</td>
                      {allCols.map((c) => <td key={c.year} className="px-4 py-2"></td>)}
                    </tr>
                    {[
                      { key: "cash" as const, label: "Cash & Equivalents", indent: true, bold: false },
                      { key: "accountsReceivable" as const, label: "Accounts Receivable", indent: true, bold: false },
                      { key: "inventory" as const, label: "Inventory", indent: true, bold: false },
                      { key: "totalCurrentAssets" as const, label: "Total Current Assets", indent: false, bold: true },
                      { key: "ppe" as const, label: "PP&E (Net)", indent: true, bold: false },
                      { key: "totalAssets" as const, label: "Total Assets", indent: false, bold: true },
                    ].map(({ key, label, indent, bold }, i) => (
                      <tr key={key} className={bold ? "bg-green-50 border-t border-green-200" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className={`px-4 py-2.5 ${bold ? "font-bold text-gray-900" : "text-gray-600"} ${indent ? "pl-8" : ""}`}>{label}</td>
                        {allCols.map((c) => (
                          <td key={c.year} className={`px-4 py-2.5 text-right font-mono ${bold ? "font-bold" : ""} ${c.isProjected ? "text-blue-400" : bold ? "text-gray-900" : "text-gray-600"}`}>
                            {c.isProjected ? "—" : n(((c as unknown as Record<string, number>)[key] ?? 0) / 1e6)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-red-900 text-white">
                      <td className="px-4 py-2 font-bold tracking-wide text-xs uppercase">Liabilities</td>
                      {allCols.map((c) => <td key={c.year} className="px-4 py-2"></td>)}
                    </tr>
                    {[
                      { key: "accountsPayable" as const, label: "Accounts Payable", indent: true, bold: false },
                      { key: "shortTermDebt" as const, label: "Short-Term Debt", indent: true, bold: false },
                      { key: "totalCurrentLiabilities" as const, label: "Total Current Liabilities", indent: false, bold: true },
                      { key: "longTermDebt" as const, label: "Long-Term Debt", indent: true, bold: false },
                      { key: "totalLiabilities" as const, label: "Total Liabilities", indent: false, bold: true },
                    ].map(({ key, label, indent, bold }, i) => (
                      <tr key={key} className={bold ? "bg-red-50 border-t border-red-200" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className={`px-4 py-2.5 ${bold ? "font-bold text-gray-900" : "text-gray-600"} ${indent ? "pl-8" : ""}`}>{label}</td>
                        {allCols.map((c) => (
                          <td key={c.year} className={`px-4 py-2.5 text-right font-mono ${bold ? "font-bold" : ""} ${c.isProjected ? "text-blue-400" : bold ? "text-gray-900" : "text-gray-600"}`}>
                            {c.isProjected ? "—" : n(((c as unknown as Record<string, number>)[key] ?? 0) / 1e6)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-gray-900 text-white border-t-2 border-gray-700">
                      <td className="px-4 py-2.5 font-bold">Total Shareholders&apos; Equity</td>
                      {allCols.map((c) => (
                        <td key={c.year} className="px-4 py-2.5 text-right font-mono font-bold">
                          {c.isProjected ? "—" : n((c.equity ?? 0) / 1e6)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-2">Balance sheet projections not modeled — shown as actual reported figures only.</p>
            </div>

            {/* Cash Flow Statement */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-1 h-6 bg-purple-600 rounded"></div>
                <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">Cash Flow Statement <span className="text-gray-400 font-normal normal-case text-sm">($M)</span></h2>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                <table className="text-sm w-full border-collapse bg-white">
                  <thead>
                    <tr className="bg-gray-900 text-white">
                      <th className="text-left px-4 py-3 w-64 font-semibold tracking-wide">Line Item</th>
                      {allCols.map((c) => (
                        <th key={c.year} className={`px-4 py-3 text-right font-semibold tracking-wide ${c.isProjected ? "text-blue-300" : ""}`}>
                          FY{c.year}{c.isProjected ? "E" : "A"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-purple-900 text-white">
                      <td className="px-4 py-2 font-bold tracking-wide text-xs uppercase">Operating Activities</td>
                      {allCols.map((c) => <td key={c.year} className="px-4 py-2"></td>)}
                    </tr>
                    <tr className="bg-white">
                      <td className="px-4 py-2 text-gray-600 pl-8">Net Income</td>
                      {allCols.map((c) => (
                        <td key={c.year} className={`px-4 py-2 text-right font-mono ${c.isProjected ? "text-blue-600" : "text-gray-600"}`}>
                          {n(c.netIncome / 1e6)}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-2 text-gray-600 pl-8">Depreciation & Amortization</td>
                      {allCols.map((c) => {
                        const da = c.isProjected ? (c.da ?? 0) : (c.depreciationAmortization ?? 0);
                        return <td key={c.year} className={`px-4 py-2 text-right font-mono ${c.isProjected ? "text-blue-600" : "text-gray-600"}`}>{n(da / 1e6)}</td>;
                      })}
                    </tr>
                    <tr className="bg-purple-50 border-t border-purple-200">
                      <td className="px-4 py-2.5 font-bold text-gray-900">Cash from Operations</td>
                      {allCols.map((c) => {
                        const ocf = c.isProjected ? (c.operatingCashFlow ?? 0) : c.operatingCashFlow;
                        return <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-bold ${c.isProjected ? "text-blue-700" : "text-gray-900"}`}>{n(ocf / 1e6)}</td>;
                      })}
                    </tr>
                    <tr className="bg-purple-50">
                      <td className="px-4 py-1.5 text-xs text-purple-600 pl-8">Operating Cash Flow Margin %</td>
                      {allCols.map((c) => {
                        const ocf = c.isProjected ? (c.operatingCashFlow ?? 0) : c.operatingCashFlow;
                        return <td key={c.year} className="px-4 py-1.5 text-right text-xs font-mono text-purple-600">{pct((ocf / c.revenue) * 100)}</td>;
                      })}
                    </tr>
                    <tr className="bg-purple-900 text-white">
                      <td className="px-4 py-2 font-bold tracking-wide text-xs uppercase">Investing Activities</td>
                      {allCols.map((c) => <td key={c.year} className="px-4 py-2"></td>)}
                    </tr>
                    <tr className="bg-white">
                      <td className="px-4 py-2 text-gray-600 pl-8">Capital Expenditures (CapEx)</td>
                      {allCols.map((c) => {
                        const capexVal = c.isProjected ? (c.capex ?? 0) : c.capex;
                        return <td key={c.year} className={`px-4 py-2 text-right font-mono ${c.isProjected ? "text-blue-500" : "text-gray-600"}`}>({n(capexVal / 1e6)})</td>;
                      })}
                    </tr>
                    <tr className="bg-gray-900 text-white border-t-2 border-gray-700">
                      <td className="px-4 py-2.5 font-bold">Free Cash Flow</td>
                      {allCols.map((c) => {
                        const fcfVal = c.isProjected ? (c.fcf ?? 0) : (c.freeCashFlow ?? 0);
                        return <td key={c.year} className="px-4 py-2.5 text-right font-mono font-bold">{n(fcfVal / 1e6)}</td>;
                      })}
                    </tr>
                    <tr className="bg-gray-800 text-gray-300">
                      <td className="px-4 py-1.5 text-xs pl-8">FCF Margin %</td>
                      {allCols.map((c) => {
                        const fcfVal = c.isProjected ? (c.fcf ?? 0) : (c.freeCashFlow ?? 0);
                        return <td key={c.year} className="px-4 py-1.5 text-right text-xs font-mono">{pct((fcfVal / c.revenue) * 100)}</td>;
                      })}
                    </tr>
                    <tr className="bg-gray-800 text-gray-300">
                      <td className="px-4 py-1.5 text-xs pl-8">CapEx % of Revenue</td>
                      {allCols.map((c) => {
                        const capexVal = c.isProjected ? (c.capex ?? 0) : c.capex;
                        return <td key={c.year} className="px-4 py-1.5 text-right text-xs font-mono">{pct((capexVal / c.revenue) * 100)}</td>;
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )})()}
        {activeTab === "comps" && (
          <ValuationComps model={model} />
        )}
      </main>
    </div>
  );
}
