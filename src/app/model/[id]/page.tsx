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

  const handleAssumptionsUpdate = useCallback((a: DCFAssumptions, s: AssumptionSource[]) => {
    setModel((prev) => prev ? { ...prev, assumptions: a, assumptionSources: s } : prev);
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
          <Link href="/dashboard" className="text-blue-700 font-bold text-lg">Fable DCF</Link>
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
            onUpdate={handleAssumptionsUpdate}
          />
        )}
        {activeTab === "financials" && (
          <div className="space-y-8 overflow-x-auto">

            {/* Income Statement */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3 border-l-4 border-blue-600 pl-3">Income Statement ($M)</h2>
              <table className="text-sm w-full border-collapse bg-white rounded-xl overflow-hidden border border-gray-200">
                <thead>
                  <tr className="bg-gray-800 text-white">
                    <th className="text-left px-4 py-3 w-56">Metric</th>
                    {model.historicalPeriods.map((p) => <th key={p.year} className="px-4 py-3 text-right">FY{p.year}A</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: "revenue" as const, label: "Revenue", bold: true },
                    { key: "grossProfit" as const, label: "Gross Profit", bold: false },
                    { key: "ebit" as const, label: "EBIT (Operating Income)", bold: false },
                    { key: "interestExpense" as const, label: "Interest Expense", bold: false },
                    { key: "taxExpense" as const, label: "Income Tax Expense", bold: false },
                    { key: "netIncome" as const, label: "Net Income", bold: true },
                  ].map(({ key, label, bold }, i) => (
                    <tr key={key} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className={`px-4 py-2.5 ${bold ? "font-bold text-gray-900" : "text-gray-600"}`}>{label}</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className={`px-4 py-2.5 text-right font-mono ${bold ? "font-bold" : ""}`}>
                          {(p[key] / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Balance Sheet */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3 border-l-4 border-green-600 pl-3">Balance Sheet ($M)</h2>
              <table className="text-sm w-full border-collapse bg-white rounded-xl overflow-hidden border border-gray-200">
                <thead>
                  <tr className="bg-gray-800 text-white">
                    <th className="text-left px-4 py-3 w-56">Metric</th>
                    {model.historicalPeriods.map((p) => <th key={p.year} className="px-4 py-3 text-right">FY{p.year}A</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: "cash" as const, label: "Cash & Equivalents", bold: false },
                    { key: "accountsReceivable" as const, label: "Accounts Receivable", bold: false },
                    { key: "inventory" as const, label: "Inventory", bold: false },
                    { key: "totalCurrentAssets" as const, label: "Total Current Assets", bold: true },
                    { key: "ppe" as const, label: "PP&E (Net)", bold: false },
                    { key: "totalAssets" as const, label: "Total Assets", bold: true },
                    { key: "accountsPayable" as const, label: "Accounts Payable", bold: false },
                    { key: "shortTermDebt" as const, label: "Short Term Debt", bold: false },
                    { key: "totalCurrentLiabilities" as const, label: "Total Current Liabilities", bold: true },
                    { key: "longTermDebt" as const, label: "Long Term Debt", bold: false },
                    { key: "totalLiabilities" as const, label: "Total Liabilities", bold: true },
                    { key: "equity" as const, label: "Total Equity", bold: true },
                  ].map(({ key, label, bold }, i) => (
                    <tr key={key} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className={`px-4 py-2.5 ${bold ? "font-bold text-gray-900" : "text-gray-600"}`}>{label}</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className={`px-4 py-2.5 text-right font-mono ${bold ? "font-bold" : ""}`}>
                          {(p[key] / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cash Flow Statement */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3 border-l-4 border-purple-600 pl-3">Cash Flow Statement ($M)</h2>
              <table className="text-sm w-full border-collapse bg-white rounded-xl overflow-hidden border border-gray-200">
                <thead>
                  <tr className="bg-gray-800 text-white">
                    <th className="text-left px-4 py-3 w-56">Metric</th>
                    {model.historicalPeriods.map((p) => <th key={p.year} className="px-4 py-3 text-right">FY{p.year}A</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: "operatingCashFlow" as const, label: "Operating Cash Flow", bold: true },
                    { key: "depreciationAmortization" as const, label: "Depreciation & Amortization", bold: false },
                    { key: "capex" as const, label: "Capital Expenditures", bold: false },
                    { key: "freeCashFlow" as const, label: "Free Cash Flow", bold: true },
                  ].map(({ key, label, bold }, i) => (
                    <tr key={key} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className={`px-4 py-2.5 ${bold ? "font-bold text-gray-900" : "text-gray-600"}`}>{label}</td>
                      {model.historicalPeriods.map((p) => (
                        <td key={p.year} className={`px-4 py-2.5 text-right font-mono ${bold ? "font-bold" : ""}`}>
                          {(p[key] / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
