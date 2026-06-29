"use client";
import { useMemo } from "react";
import { fmt } from "@/lib/utils";
import type { DCFModel, Scenario } from "@/types/model";

interface Props {
  model: DCFModel;
  scenario: Scenario;
}

function computeDCF(model: DCFModel, scenario: Scenario) {
  const a = model.assumptions;
  const hist = model.historicalPeriods;
  if (!hist.length) return null;

  const growthKey = `revenueGrowth${scenario.charAt(0).toUpperCase() + scenario.slice(1)}` as
    | "revenueGrowthBear" | "revenueGrowthBase" | "revenueGrowthBull";
  const ebitMargin = scenario === "bear" ? a.ebitMarginBear : scenario === "bull" ? a.ebitMarginBull : a.ebitMarginBase;
  const wacc = scenario === "bear" ? a.waccBear : scenario === "bull" ? a.waccBull : a.waccBase;
  const growthRates = a[growthKey];

  let rev = hist[0].revenue / 1e6;
  const revenues: number[] = [];
  const ebits: number[] = [];
  const fcfs: number[] = [];
  const pvFcfs: number[] = [];
  const years = a.projectionYears;

  for (let yr = 1; yr <= years; yr++) {
    rev = rev * (1 + growthRates[yr - 1]);
    const ebit = rev * ebitMargin;
    const nopat = ebit * (1 - a.taxRate);
    const da = rev * a.depreciationPct;
    const capex = rev * a.capexPct;
    const fcf = nopat + da - capex;
    revenues.push(rev);
    ebits.push(ebit);
    fcfs.push(fcf);
    pvFcfs.push(fcf / Math.pow(1 + wacc, yr - 0.5));
  }

  const terminalFCF = fcfs[years - 1];
  const tv = (terminalFCF * (1 + a.terminalGrowthRate)) / (wacc - a.terminalGrowthRate);
  const pvTV = tv / Math.pow(1 + wacc, years);
  const sumPVFcf = pvFcfs.reduce((a, b) => a + b, 0);
  const ev = sumPVFcf + pvTV;
  const equity = ev - a.netDebt - a.minorityInterest;
  const ivps = equity / a.sharesOutstanding;

  return { revenues, ebits, fcfs, pvFcfs, sumPVFcf, tv, pvTV, ev, equity, ivps, tvPct: (pvTV / ev) * 100, wacc, growthRates };
}

function computeIVPS(model: DCFModel, scenario: Scenario, waccOverride?: number, tgrOverride?: number) {
  const a = model.assumptions;
  const hist = model.historicalPeriods;
  if (!hist.length) return 0;

  const growthKey = `revenueGrowth${scenario.charAt(0).toUpperCase() + scenario.slice(1)}` as
    | "revenueGrowthBear" | "revenueGrowthBase" | "revenueGrowthBull";
  const ebitMargin = scenario === "bear" ? a.ebitMarginBear : scenario === "bull" ? a.ebitMarginBull : a.ebitMarginBase;
  const wacc = waccOverride ?? (scenario === "bear" ? a.waccBear : scenario === "bull" ? a.waccBull : a.waccBase);
  const tgr = tgrOverride ?? a.terminalGrowthRate;
  const growthRates = a[growthKey];

  let rev = hist[0].revenue / 1e6;
  const fcfs: number[] = [];
  const pvFcfs: number[] = [];

  for (let yr = 1; yr <= a.projectionYears; yr++) {
    rev = rev * (1 + growthRates[yr - 1]);
    const ebit = rev * ebitMargin;
    const nopat = ebit * (1 - a.taxRate);
    const fcf = nopat + rev * a.depreciationPct - rev * a.capexPct;
    fcfs.push(fcf);
    pvFcfs.push(fcf / Math.pow(1 + wacc, yr - 0.5));
  }

  const tv = (fcfs[a.projectionYears - 1] * (1 + tgr)) / (wacc - tgr);
  const pvTV = tv / Math.pow(1 + wacc, a.projectionYears);
  const ev = pvFcfs.reduce((a, b) => a + b, 0) + pvTV;
  return (ev - a.netDebt - a.minorityInterest) / a.sharesOutstanding;
}

export function DCFOutput({ model, scenario }: Props) {
  const result = useMemo(() => computeDCF(model, scenario), [model, scenario]);
  const bearResult = useMemo(() => computeDCF(model, "bear"), [model]);
  const baseResult = useMemo(() => computeDCF(model, "base"), [model]);
  const bullResult = useMemo(() => computeDCF(model, "bull"), [model]);

  const sensitivity = useMemo(() => {
    const baseWacc = model.assumptions.waccBase;
    const baseTgr = model.assumptions.terminalGrowthRate;
    const waccSteps = [-0.02, -0.01, 0, 0.01, 0.02];
    const tgrSteps = [-0.01, -0.005, 0, 0.005, 0.01];
    return tgrSteps.map(tgrD =>
      waccSteps.map(waccD =>
        computeIVPS(model, "base", baseWacc + waccD, baseTgr + tgrD)
      )
    );
  }, [model]);

  if (!result || !bearResult || !baseResult || !bullResult) {
    return <div className="text-gray-400 text-sm">Load a model to see DCF output.</div>;
  }

  const shares = model.assumptions.sharesOutstanding;
  const currentPrice = model.currentPrice ?? 0;
  const upside = currentPrice > 0 ? ((result.ivps - currentPrice) / currentPrice) * 100 : null;
  const baseWacc = model.assumptions.waccBase;
  const baseTgr = model.assumptions.terminalGrowthRate;
  const waccSteps = [-0.02, -0.01, 0, 0.01, 0.02];
  const tgrSteps = [-0.01, -0.005, 0, 0.005, 0.01];

  const scenarioColor = scenario === "bear" ? "#dc2626" : scenario === "bull" ? "#16a34a" : "#d97706";
  const scenarioLabel = scenario.charAt(0).toUpperCase() + scenario.slice(1);

  return (
    <div className="space-y-8">

      {/* 1. HERO — Valuation Summary */}
      <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        <div className="bg-gray-900 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">DCF Valuation — {scenarioLabel} Case</p>
            <p className="text-gray-300 text-sm mt-0.5">{model.companyName} ({model.ticker})</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Intrinsic Value / Share</p>
            <p className="text-4xl font-bold mt-0.5" style={{ color: scenarioColor }}>${fmt(result.ivps, 2)}</p>
          </div>
        </div>
        <div className="bg-white px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-6 border-t border-gray-100">
          {currentPrice > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Market Price</p>
              <p className="text-xl font-bold text-gray-800 mt-1">${fmt(currentPrice, 2)}</p>
            </div>
          )}
          {upside !== null && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Upside / Downside</p>
              <p className={`text-xl font-bold mt-1 ${upside >= 0 ? "text-green-600" : "text-red-600"}`}>
                {upside >= 0 ? "▲" : "▼"} {fmt(Math.abs(upside), 1)}%
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">EV / Share</p>
            <p className="text-xl font-bold text-gray-800 mt-1">${fmt(result.ev / shares, 2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">TV % of EV</p>
            <p className="text-xl font-bold text-gray-800 mt-1">{fmt(result.tvPct, 1)}%</p>
          </div>
        </div>
      </div>

      {/* 2. SCENARIO COMPARISON */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-gray-800 rounded"></div>
          <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide">Scenario Comparison — Intrinsic Value / Share</h3>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {([
            { s: "bear" as Scenario, r: bearResult, headerBg: "bg-red-800", valueBg: "bg-red-50", border: "border-red-200", text: "text-red-700", label: "Bear Case" },
            { s: "base" as Scenario, r: baseResult, headerBg: "bg-yellow-700", valueBg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", label: "Base Case" },
            { s: "bull" as Scenario, r: bullResult, headerBg: "bg-green-800", valueBg: "bg-green-50", border: "border-green-200", text: "text-green-700", label: "Bull Case" },
          ]).map(({ r, headerBg, valueBg, border, text, label }) => (
            <div key={label} className={`rounded-xl border ${border} overflow-hidden shadow-sm`}>
              <div className={`${headerBg} text-white px-4 py-2.5`}>
                <p className="text-xs font-bold uppercase tracking-widest">{label}</p>
              </div>
              <div className={`${valueBg} px-4 py-4`}>
                <p className={`text-3xl font-bold ${text}`}>${fmt(r.ivps, 2)}</p>
                {currentPrice > 0 && (
                  <p className={`text-sm mt-1.5 font-semibold ${r.ivps >= currentPrice ? "text-green-600" : "text-red-600"}`}>
                    {r.ivps >= currentPrice ? "▲" : "▼"} {fmt(Math.abs((r.ivps - currentPrice) / currentPrice * 100), 1)}% vs market
                  </p>
                )}
                <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>WACC</span><span className="font-mono font-semibold">{fmt(r.wacc * 100, 1)}%</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>EV / Share</span><span className="font-mono font-semibold">${fmt(r.ev / shares, 2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>TV % of EV</span><span className="font-mono font-semibold">{fmt(r.tvPct, 1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. PROJECTED FINANCIALS TABLE */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-blue-700 rounded"></div>
          <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide">Projected Financials / Share — {scenarioLabel} Case</h3>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="text-left px-4 py-3 w-56 font-semibold tracking-wide">Metric</th>
                {result.revenues.map((_, i) => (
                  <th key={i} className="px-4 py-3 text-right font-semibold tracking-wide">Year {i + 1}E</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-blue-50 border-t-2 border-blue-200">
                <td className="px-4 py-2.5 font-bold text-gray-900">Revenue / Share</td>
                {result.revenues.map((v, i) => (
                  <td key={i} className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">${fmt(v / shares, 2)}</td>
                ))}
              </tr>
              <tr className="bg-blue-50">
                <td className="px-4 py-1.5 text-xs text-blue-600 pl-8">YoY Growth %</td>
                {result.revenues.map((v, i) => {
                  const prev = i === 0 ? model.historicalPeriods[0].revenue / 1e6 : result.revenues[i - 1];
                  const g = ((v - prev) / prev) * 100;
                  return <td key={i} className="px-4 py-1.5 text-right text-xs font-mono text-blue-600">{g >= 0 ? "+" : ""}{fmt(g, 1)}%</td>;
                })}
              </tr>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-4 py-2.5 font-semibold text-gray-800">EBIT / Share</td>
                {result.ebits.map((v, i) => (
                  <td key={i} className="px-4 py-2.5 text-right font-mono font-semibold text-gray-800">${fmt(v / shares, 2)}</td>
                ))}
              </tr>
              <tr className="bg-gray-50">
                <td className="px-4 py-1.5 text-xs text-gray-500 pl-8">EBIT Margin %</td>
                {result.ebits.map((v, i) => (
                  <td key={i} className="px-4 py-1.5 text-right text-xs font-mono text-gray-500">{fmt((v / result.revenues[i]) * 100, 1)}%</td>
                ))}
              </tr>
              <tr className="bg-white border-t border-gray-200">
                <td className="px-4 py-2.5 font-semibold text-gray-800">FCF / Share</td>
                {result.fcfs.map((v, i) => (
                  <td key={i} className="px-4 py-2.5 text-right font-mono font-semibold text-gray-800">${fmt(v / shares, 2)}</td>
                ))}
              </tr>
              <tr className="bg-white">
                <td className="px-4 py-1.5 text-xs text-gray-500 pl-8">FCF Margin %</td>
                {result.fcfs.map((v, i) => (
                  <td key={i} className="px-4 py-1.5 text-right text-xs font-mono text-gray-500">{fmt((v / result.revenues[i]) * 100, 1)}%</td>
                ))}
              </tr>
              <tr className="bg-gray-900 text-white border-t-2 border-gray-700">
                <td className="px-4 py-2.5 font-bold">PV of FCF / Share</td>
                {result.pvFcfs.map((v, i) => (
                  <td key={i} className="px-4 py-2.5 text-right font-mono font-bold">${fmt(v / shares, 2)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. EV → EQUITY BRIDGE */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-gray-800 rounded"></div>
          <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide">EV → Equity Bridge <span className="text-gray-400 font-normal normal-case text-sm">(Per Share)</span></h3>
        </div>
        <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="text-left px-5 py-3 font-semibold tracking-wide">Component</th>
                <th className="text-right px-5 py-3 font-semibold tracking-wide">Value / Share</th>
                <th className="text-right px-5 py-3 font-semibold tracking-wide">% of EV</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-blue-50">
                <td className="px-5 py-3 text-gray-700 pl-8">PV of Projected FCFs</td>
                <td className="px-5 py-3 text-right font-mono font-semibold text-gray-800">${fmt(result.sumPVFcf / shares, 2)}</td>
                <td className="px-5 py-3 text-right font-mono text-gray-500">{fmt((result.sumPVFcf / result.ev) * 100, 1)}%</td>
              </tr>
              <tr className="bg-blue-50">
                <td className="px-5 py-3 text-gray-700 pl-8">PV of Terminal Value</td>
                <td className="px-5 py-3 text-right font-mono font-semibold text-gray-800">${fmt(result.pvTV / shares, 2)}</td>
                <td className="px-5 py-3 text-right font-mono text-gray-500">{fmt(result.tvPct, 1)}%</td>
              </tr>
              <tr className="bg-blue-900 text-white border-t-2 border-blue-700">
                <td className="px-5 py-3 font-bold">= Enterprise Value (EV)</td>
                <td className="px-5 py-3 text-right font-mono font-bold">${fmt(result.ev / shares, 2)}</td>
                <td className="px-5 py-3 text-right font-mono">100.0%</td>
              </tr>
              <tr className="bg-white">
                <td className="px-5 py-3 text-gray-600 pl-8">
                  {model.assumptions.netDebt < 0 ? "+ Net Cash" : "− Net Debt"}
                </td>
                <td className={`px-5 py-3 text-right font-mono font-semibold ${model.assumptions.netDebt < 0 ? "text-green-600" : "text-red-600"}`}>
                  {model.assumptions.netDebt < 0 ? "+" : "-"}${fmt(Math.abs(model.assumptions.netDebt) / shares, 2)}
                </td>
                <td className="px-5 py-3 text-right font-mono text-gray-400">—</td>
              </tr>
              {model.assumptions.minorityInterest > 0 && (
                <tr className="bg-gray-50">
                  <td className="px-5 py-3 text-gray-600 pl-8">− Minority Interest</td>
                  <td className="px-5 py-3 text-right font-mono font-semibold text-red-600">-${fmt(model.assumptions.minorityInterest / shares, 2)}</td>
                  <td className="px-5 py-3 text-right font-mono text-gray-400">—</td>
                </tr>
              )}
              <tr className="bg-gray-900 text-white border-t-2 border-gray-700">
                <td className="px-5 py-3 font-bold">= Equity Value / Share (IVPS)</td>
                <td className="px-5 py-3 text-right font-mono font-bold text-green-400">${fmt(result.ivps, 2)}</td>
                <td className="px-5 py-3 text-right font-mono text-gray-400">—</td>
              </tr>
            </tbody>
          </table>
          <div className="bg-gray-50 px-5 py-2.5 border-t border-gray-200 text-xs text-gray-400">
            Shares Outstanding: {fmt(shares, 1)}M &nbsp;|&nbsp; WACC: {fmt(result.wacc * 100, 2)}% &nbsp;|&nbsp; Terminal Growth Rate: {fmt(model.assumptions.terminalGrowthRate * 100, 1)}%
          </div>
        </div>
      </div>

      {/* 5. SENSITIVITY TABLE */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-gray-800 rounded"></div>
          <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide">Sensitivity Analysis — Intrinsic Value / Share</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">Base case (center cell highlighted blue). Green = above market price. Red = below market price.</p>
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="px-4 py-3 text-left font-semibold text-gray-300">TGR \ WACC</th>
                {waccSteps.map((d) => (
                  <th key={d} className="px-4 py-3 text-right font-mono font-semibold">
                    {fmt((baseWacc + d) * 100, 1)}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tgrSteps.map((tgrD, ri) => (
                <tr key={ri}>
                  <td className="px-4 py-3 bg-gray-900 text-white font-mono font-semibold text-right">
                    {fmt((baseTgr + tgrD) * 100, 1)}%
                  </td>
                  {waccSteps.map((waccD, ci) => {
                    const isCenter = ri === 2 && ci === 2;
                    const val = sensitivity[ri][ci];
                    const isUp = currentPrice > 0 && val >= currentPrice;
                    return (
                      <td
                        key={ci}
                        className={`px-4 py-3 text-right font-mono font-bold border border-gray-200
                          ${isCenter
                            ? "bg-blue-700 text-white ring-2 ring-blue-400 ring-inset"
                            : isUp
                              ? "bg-green-50 text-green-800"
                              : "bg-red-50 text-red-800"
                          }`}
                      >
                        ${fmt(val, 2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
