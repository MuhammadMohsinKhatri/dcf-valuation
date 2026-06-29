"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { AssumptionsPanel } from "@/components/model/AssumptionsPanel";
import { DCFOutput } from "@/components/model/DCFOutput";
import { ScenarioSelector } from "@/components/model/ScenarioSelector";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import type { DCFModel, DCFAssumptions, AssumptionSource, Scenario } from "@/types/model";

export default function ModelPage() {
  const { id } = useParams<{ id: string }>();
  const [model, setModel] = useState<DCFModel | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<"output" | "assumptions" | "financials">("output");

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
          {(["output", "assumptions", "financials"] as const).map((tab) => (
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
        {activeTab === "financials" && (
          <div className="space-y-10 overflow-x-auto">

            {/* Per Share Summary */}
            {(() => {
              const p = model.historicalPeriods[0];
              const sh = model.assumptions.sharesOutstanding;
              if (!p || !sh) return null;
              const items = [
                { label: "Revenue / Share", value: p.revenue / 1e6 / sh },
                { label: "Gross Profit / Share", value: p.grossProfit / 1e6 / sh },
                { label: "EBIT / Share", value: p.ebit / 1e6 / sh },
                { label: "Net Income / Share (EPS)", value: p.netIncome / 1e6 / sh },
                { label: "FCF / Share", value: p.freeCashFlow / 1e6 / sh },
                { label: "Book Value / Share", value: p.equity / 1e6 / sh },
                { label: "Cash / Share", value: p.cash / 1e6 / sh },
              ];
              return (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-1 h-6 bg-blue-700 rounded"></div>
                    <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">Per Share Summary — FY{p.year}A</h2>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    {items.map((item) => (
                      <div key={item.label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1 leading-tight">{item.label}</p>
                        <p className="text-lg font-bold text-blue-700 font-mono">${item.value.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

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
                      {model.historicalPeriods.map((p) => <th key={p.year} className="px-4 py-3 text-right font-semibold tracking-wide">FY{p.year}A</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Revenue */}
                    <tr className="bg-blue-50 border-t-2 border-blue-200">
                      <td className="px-4 py-2.5 font-bold text-gray-900">Revenue</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">
                          {(p.revenue / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-blue-50">
                      <td className="px-4 py-1.5 text-xs text-blue-600 pl-8">YoY Growth %</td>
                      {model.historicalPeriods.map((p, i) => {
                        const prev = model.historicalPeriods[i + 1];
                        const growth = prev ? ((p.revenue - prev.revenue) / prev.revenue) * 100 : null;
                        return (
                          <td key={p.year} className="px-4 py-1.5 text-right text-xs font-mono text-blue-600">
                            {growth !== null ? `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                    {/* COGS */}
                    <tr className="bg-white">
                      <td className="px-4 py-2 text-gray-600 pl-8">Cost of Revenue (COGS)</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-2 text-right font-mono text-gray-600">
                          ({((p.revenue - p.grossProfit) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })})
                        </td>
                      ))}
                    </tr>
                    {/* Gross Profit */}
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td className="px-4 py-2.5 font-semibold text-gray-800">Gross Profit</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-2.5 text-right font-mono font-semibold text-gray-800">
                          {(p.grossProfit / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-1.5 text-xs text-gray-500 pl-8">Gross Margin %</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-1.5 text-right text-xs font-mono text-gray-500">
                          {((p.grossProfit / p.revenue) * 100).toFixed(1)}%
                        </td>
                      ))}
                    </tr>
                    {/* OpEx */}
                    <tr className="bg-white">
                      <td className="px-4 py-2 text-gray-600 pl-8">Operating Expenses</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-2 text-right font-mono text-gray-600">
                          ({(p.operatingExpenses / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })})
                        </td>
                      ))}
                    </tr>
                    {/* EBIT */}
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td className="px-4 py-2.5 font-semibold text-gray-800">EBIT (Operating Income)</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-2.5 text-right font-mono font-semibold text-gray-800">
                          {(p.ebit / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-1.5 text-xs text-gray-500 pl-8">EBIT Margin %</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-1.5 text-right text-xs font-mono text-gray-500">
                          {((p.ebit / p.revenue) * 100).toFixed(1)}%
                        </td>
                      ))}
                    </tr>
                    {/* Interest & Tax */}
                    <tr className="bg-white">
                      <td className="px-4 py-2 text-gray-600 pl-8">Interest Expense</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-2 text-right font-mono text-gray-600">
                          ({(p.interestExpense / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })})
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-2 text-gray-600 pl-8">Income Tax Expense</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-2 text-right font-mono text-gray-600">
                          ({(p.taxExpense / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })})
                        </td>
                      ))}
                    </tr>
                    {/* Net Income */}
                    <tr className="bg-blue-900 text-white border-t-2 border-blue-700">
                      <td className="px-4 py-2.5 font-bold">Net Income</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-2.5 text-right font-mono font-bold">
                          {(p.netIncome / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-blue-800 text-blue-200">
                      <td className="px-4 py-1.5 text-xs pl-8">Net Margin %</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-1.5 text-right text-xs font-mono">
                          {((p.netIncome / p.revenue) * 100).toFixed(1)}%
                        </td>
                      ))}
                    </tr>
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
                      {model.historicalPeriods.map((p) => <th key={p.year} className="px-4 py-3 text-right font-semibold tracking-wide">FY{p.year}A</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Assets */}
                    <tr className="bg-green-900 text-white">
                      <td className="px-4 py-2 font-bold tracking-wide text-xs uppercase">Assets</td>
                      {model.historicalPeriods.map((p) => <td key={p.year} className="px-4 py-2"></td>)}
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
                        {model.historicalPeriods.map((p) => (
                          <td key={p.year} className={`px-4 py-2.5 text-right font-mono ${bold ? "font-bold text-gray-900" : "text-gray-600"}`}>
                            {(p[key] / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {/* Liabilities */}
                    <tr className="bg-red-900 text-white">
                      <td className="px-4 py-2 font-bold tracking-wide text-xs uppercase">Liabilities</td>
                      {model.historicalPeriods.map((p) => <td key={p.year} className="px-4 py-2"></td>)}
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
                        {model.historicalPeriods.map((p) => (
                          <td key={p.year} className={`px-4 py-2.5 text-right font-mono ${bold ? "font-bold text-gray-900" : "text-gray-600"}`}>
                            {(p[key] / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {/* Equity */}
                    <tr className="bg-gray-900 text-white border-t-2 border-gray-700">
                      <td className="px-4 py-2.5 font-bold">Total Shareholders&apos; Equity</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-2.5 text-right font-mono font-bold">
                          {(p.equity / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
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
                      {model.historicalPeriods.map((p) => <th key={p.year} className="px-4 py-3 text-right font-semibold tracking-wide">FY{p.year}A</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Operating */}
                    <tr className="bg-purple-900 text-white">
                      <td className="px-4 py-2 font-bold tracking-wide text-xs uppercase">Operating Activities</td>
                      {model.historicalPeriods.map((p) => <td key={p.year} className="px-4 py-2"></td>)}
                    </tr>
                    <tr className="bg-white">
                      <td className="px-4 py-2 text-gray-600 pl-8">Net Income</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-2 text-right font-mono text-gray-600">
                          {(p.netIncome / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-2 text-gray-600 pl-8">Depreciation & Amortization</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-2 text-right font-mono text-gray-600">
                          {(p.depreciationAmortization / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-purple-50 border-t border-purple-200">
                      <td className="px-4 py-2.5 font-bold text-gray-900">Cash from Operations</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">
                          {(p.operatingCashFlow / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-purple-50">
                      <td className="px-4 py-1.5 text-xs text-purple-600 pl-8">Operating Cash Flow Margin %</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-1.5 text-right text-xs font-mono text-purple-600">
                          {((p.operatingCashFlow / p.revenue) * 100).toFixed(1)}%
                        </td>
                      ))}
                    </tr>
                    {/* Investing */}
                    <tr className="bg-purple-900 text-white">
                      <td className="px-4 py-2 font-bold tracking-wide text-xs uppercase">Investing Activities</td>
                      {model.historicalPeriods.map((p) => <td key={p.year} className="px-4 py-2"></td>)}
                    </tr>
                    <tr className="bg-white">
                      <td className="px-4 py-2 text-gray-600 pl-8">Capital Expenditures (CapEx)</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-2 text-right font-mono text-gray-600">
                          ({(p.capex / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })})
                        </td>
                      ))}
                    </tr>
                    {/* FCF */}
                    <tr className="bg-gray-900 text-white border-t-2 border-gray-700">
                      <td className="px-4 py-2.5 font-bold">Free Cash Flow</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-2.5 text-right font-mono font-bold">
                          {(p.freeCashFlow / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-gray-800 text-gray-300">
                      <td className="px-4 py-1.5 text-xs pl-8">FCF Margin %</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-1.5 text-right text-xs font-mono">
                          {((p.freeCashFlow / p.revenue) * 100).toFixed(1)}%
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-gray-800 text-gray-300">
                      <td className="px-4 py-1.5 text-xs pl-8">CapEx % of Revenue</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className="px-4 py-1.5 text-right text-xs font-mono">
                          {((p.capex / p.revenue) * 100).toFixed(1)}%
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
