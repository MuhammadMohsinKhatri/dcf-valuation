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

  const scenarioBg = scenario === "bear" ? "bg-red-50 border-red-200" :
    scenario === "bull" ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200";
  const scenarioText = scenario === "bear" ? "text-red-700" :
    scenario === "bull" ? "text-green-700" : "text-yellow-700";

  const shares = model.assumptions.sharesOutstanding;
  const currentPrice = model.currentPrice ?? 0;
  const upside = currentPrice > 0 ? ((result.ivps - currentPrice) / currentPrice) * 100 : null;

  const baseWacc = model.assumptions.waccBase;
  const baseTgr = model.assumptions.terminalGrowthRate;
  const waccSteps = [-0.02, -0.01, 0, 0.01, 0.02];
  const tgrSteps = [-0.01, -0.005, 0, 0.005, 0.01];

  return (
    <div className="space-y-6">

      {/* 1. Hero + current price */}
      <div className={`rounded-xl border-2 p-6 ${scenarioBg}`}>
        <p className="text-sm font-medium text-gray-600">Intrinsic Value / Share ({scenario.toUpperCase()})</p>
        <div className="flex items-end gap-6 mt-1">
          <p className={`text-4xl font-bold ${scenarioText}`}>${fmt(result.ivps, 2)}</p>
          {currentPrice > 0 && (
            <div className="mb-1">
              <p className="text-xs text-gray-500">Current Price</p>
              <p className="font-semibold text-gray-800">${fmt(currentPrice, 2)}</p>
            </div>
          )}
          {upside !== null && (
            <div className="mb-1">
              <p className="text-xs text-gray-500">Upside / Downside</p>
              <p className={`font-bold text-lg ${upside >= 0 ? "text-green-600" : "text-red-600"}`}>
                {upside >= 0 ? "+" : ""}{fmt(upside, 1)}%
              </p>
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">EV / Share</p>
            <p className="font-semibold">${fmt(result.ev / shares, 2)}</p>
          </div>
          <div>
            <p className="text-gray-500">Equity Value / Share</p>
            <p className="font-semibold">${fmt(result.equity / shares, 2)}</p>
          </div>
          <div>
            <p className="text-gray-500">TV % of EV</p>
            <p className="font-semibold">{fmt(result.tvPct, 1)}%</p>
          </div>
        </div>
      </div>

      {/* 2. Bear / Base / Bull side by side */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Scenario Comparison — Intrinsic Value / Share</h3>
        <div className="grid grid-cols-3 gap-3">
          {([
            { s: "bear" as Scenario, r: bearResult, bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Bear" },
            { s: "base" as Scenario, r: baseResult, bg: "bg-yellow-50 border-yellow-200", text: "text-yellow-700", label: "Base" },
            { s: "bull" as Scenario, r: bullResult, bg: "bg-green-50 border-green-200", text: "text-green-700", label: "Bull" },
          ]).map(({ r, bg, text, label }) => (
            <div key={label} className={`rounded-lg border p-4 ${bg}`}>
              <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
              <p className={`text-2xl font-bold ${text}`}>${fmt(r.ivps, 2)}</p>
              {currentPrice > 0 && (
                <p className={`text-xs mt-1 font-medium ${r.ivps >= currentPrice ? "text-green-600" : "text-red-600"}`}>
                  {r.ivps >= currentPrice ? "▲" : "▼"} {fmt(Math.abs((r.ivps - currentPrice) / currentPrice * 100), 1)}% vs market
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">WACC: {fmt(r.wacc * 100, 1)}%</p>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Projected Financials */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Projected Financials / Share ({scenario.toUpperCase()})</h3>
        <div className="overflow-x-auto bg-white border rounded-lg">
          <table className="text-sm w-full">
            <thead>
              <tr className="bg-gray-100 text-gray-600">
                <th className="text-left px-4 py-2.5">Metric</th>
                {result.revenues.map((_, i) => <th key={i} className="px-4 py-2.5 text-right">Yr {i + 1}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Revenue / Share", vals: result.revenues.map(v => v / shares) },
                { label: "EBIT / Share", vals: result.ebits.map(v => v / shares) },
                { label: "FCF / Share", vals: result.fcfs.map(v => v / shares) },
                { label: "PV of FCF / Share", vals: result.pvFcfs.map(v => v / shares) },
              ].map(({ label, vals }, i) => (
                <tr key={label} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-4 py-2 font-medium text-gray-700">{label}</td>
                  {vals.map((v, j) => (
                    <td key={j} className="px-4 py-2 text-right font-mono">${fmt(v, 2)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. EV Bridge */}
      <div className="bg-white border rounded-lg p-4 text-sm">
        <h3 className="font-semibold text-gray-700 mb-3">EV → Equity Bridge (Per Share)</h3>
        <div className="space-y-1.5">
          {[
            ["PV of FCFs / Share", result.sumPVFcf / shares, false],
            ["PV of Terminal Value / Share", result.pvTV / shares, false],
            ["= Enterprise Value / Share", result.ev / shares, true],
            ["Less: Net Debt / Share", -model.assumptions.netDebt / shares, false],
            ["Less: Minority Interest / Share", -model.assumptions.minorityInterest / shares, false],
            ["= Equity Value / Share", result.equity / shares, true],
          ].map(([label, val, bold]) => (
            <div key={label as string} className={`flex justify-between ${bold ? "font-semibold border-t pt-1.5" : "text-gray-600"}`}>
              <span>{label as string}</span>
              <span className="font-mono">${fmt(val as number, 2)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">Shares Outstanding: {fmt(shares, 1)}M</p>
      </div>

      {/* 5. Sensitivity Table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Sensitivity Table — Intrinsic Value / Share (Base)</h3>
        <p className="text-xs text-gray-400 mb-2">Rows: Terminal Growth Rate | Columns: WACC | Center cell = Base case</p>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className="px-3 py-2 bg-gray-100 border border-gray-200 text-gray-600">TGR \ WACC</th>
                {waccSteps.map((d) => (
                  <th key={d} className="px-3 py-2 bg-gray-100 border border-gray-200 text-gray-600 font-mono">
                    {fmt((baseWacc + d) * 100, 1)}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tgrSteps.map((tgrD, ri) => (
                <tr key={ri}>
                  <td className="px-3 py-2 bg-gray-100 border border-gray-200 font-mono text-gray-600 font-semibold">
                    {fmt((baseTgr + tgrD) * 100, 1)}%
                  </td>
                  {waccSteps.map((waccD, ci) => {
                    const isCenter = ri === 2 && ci === 2;
                    const val = sensitivity[ri][ci];
                    const isUp = currentPrice > 0 && val >= currentPrice;
                    return (
                      <td
                        key={ci}
                        className={`px-3 py-2 border border-gray-200 text-right font-mono font-semibold
                          ${isCenter ? "bg-blue-100 text-blue-800 ring-2 ring-blue-400" :
                            isUp ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
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
