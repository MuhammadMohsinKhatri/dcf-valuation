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

  return { revenues, ebits, fcfs, pvFcfs, sumPVFcf, tv, pvTV, ev, equity, ivps, tvPct: (pvTV / ev) * 100, wacc, growthRates, ebitMargin };
}

function computeIVPS_WACC_TGR(model: DCFModel, scenario: Scenario, waccOverride: number, tgrOverride: number) {
  const a = model.assumptions;
  const hist = model.historicalPeriods;
  if (!hist.length) return 0;
  const growthKey = `revenueGrowth${scenario.charAt(0).toUpperCase() + scenario.slice(1)}` as
    | "revenueGrowthBear" | "revenueGrowthBase" | "revenueGrowthBull";
  const ebitMargin = scenario === "bear" ? a.ebitMarginBear : scenario === "bull" ? a.ebitMarginBull : a.ebitMarginBase;
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
    pvFcfs.push(fcf / Math.pow(1 + waccOverride, yr - 0.5));
  }

  const tv = (fcfs[a.projectionYears - 1] * (1 + tgrOverride)) / (waccOverride - tgrOverride);
  if (waccOverride <= tgrOverride) return 0;
  const pvTV = tv / Math.pow(1 + waccOverride, a.projectionYears);
  const ev = pvFcfs.reduce((a, b) => a + b, 0) + pvTV;
  return (ev - a.netDebt - a.minorityInterest) / a.sharesOutstanding;
}

function computeIVPS_Growth_Margin(model: DCFModel, avgGrowthOverride: number, ebitMarginOverride: number) {
  const a = model.assumptions;
  const hist = model.historicalPeriods;
  if (!hist.length) return 0;
  const wacc = a.waccBase;

  let rev = hist[0].revenue / 1e6;
  const fcfs: number[] = [];
  const pvFcfs: number[] = [];

  for (let yr = 1; yr <= a.projectionYears; yr++) {
    rev = rev * (1 + avgGrowthOverride);
    const ebit = rev * ebitMarginOverride;
    const nopat = ebit * (1 - a.taxRate);
    const fcf = nopat + rev * a.depreciationPct - rev * a.capexPct;
    fcfs.push(fcf);
    pvFcfs.push(fcf / Math.pow(1 + wacc, yr - 0.5));
  }

  const tv = (fcfs[a.projectionYears - 1] * (1 + a.terminalGrowthRate)) / (wacc - a.terminalGrowthRate);
  if (wacc <= a.terminalGrowthRate) return 0;
  const pvTV = tv / Math.pow(1 + wacc, a.projectionYears);
  const ev = pvFcfs.reduce((a, b) => a + b, 0) + pvTV;
  return (ev - a.netDebt - a.minorityInterest) / a.sharesOutstanding;
}

export function DCFOutput({ model, scenario }: Props) {
  const result = useMemo(() => computeDCF(model, scenario), [model, scenario]);
  const bearResult = useMemo(() => computeDCF(model, "bear"), [model]);
  const baseResult = useMemo(() => computeDCF(model, "base"), [model]);
  const bullResult = useMemo(() => computeDCF(model, "bull"), [model]);

  const a = model.assumptions;
  const baseWacc = a.waccBase;
  const baseTgr = a.terminalGrowthRate;
  const baseEbitMargin = a.ebitMarginBase;
  const baseRevGrowth = a.revenueGrowthBase.reduce((s, v) => s + v, 0) / a.revenueGrowthBase.length;

  // Sensitivity 1: WACC × Terminal Growth Rate
  const waccSteps = [-0.02, -0.01, 0, 0.01, 0.02];
  const tgrSteps = [-0.02, -0.01, 0, 0.01, 0.02].map(d => baseTgr + d);
  const sensitivityWacc = useMemo(() =>
    tgrSteps.map(tgr =>
      waccSteps.map(waccD => computeIVPS_WACC_TGR(model, "base", baseWacc + waccD, tgr))
    ),
    [model]
  );

  // Sensitivity 2: Revenue Growth CAGR × EBIT Margin
  const growthSteps = [-0.02, -0.01, 0, 0.01, 0.02].map(d => baseRevGrowth + d);
  const marginSteps = [-0.03, -0.015, 0, 0.015, 0.03].map(d => baseEbitMargin + d);
  const sensitivityGrowthMargin = useMemo(() =>
    growthSteps.map(g =>
      marginSteps.map(m => computeIVPS_Growth_Margin(model, g, m))
    ),
    [model]
  );

  if (!result || !bearResult || !baseResult || !bullResult) {
    return <div className="text-gray-400 text-sm">Load a model to see DCF output.</div>;
  }

  const shares = a.sharesOutstanding;
  const currentPrice = model.currentPrice ?? 0;
  const upside = currentPrice > 0 ? ((result.ivps - currentPrice) / currentPrice) * 100 : null;

  const hist = model.historicalPeriods;
  const latestYear = hist[0]?.year ?? new Date().getFullYear();

  return (
    <div className="space-y-0 font-sans">

      {/* ── PAGE HEADER (GS Style) ── */}
      <div className="bg-white border border-gray-300 rounded-t-xl px-6 pt-5 pb-4 flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-0.5">Discounted Cash Flow Analysis</p>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">
            {model.companyName} ({model.ticker}) — DCF Valuation
          </h1>
          <p className="text-sm text-gray-500 mt-1">($ in millions, except per share data) &nbsp;|&nbsp; Base Year: FY{latestYear}A</p>
        </div>
        <div className="text-right flex flex-col items-end gap-2">
          <span className="border border-red-600 text-red-600 text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded">
            Confidential
          </span>
          <p className="text-xs text-gray-400 font-mono">BOE Group</p>
        </div>
      </div>

      {/* ── VALUATION SUMMARY STRIP ── */}
      <div className="bg-[#0f2744] text-white px-6 py-3 flex items-center justify-between border-x border-gray-300">
        <div className="flex items-center gap-8">
          <div>
            <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Intrinsic Value / Share</p>
            <p className="text-3xl font-bold text-white mt-0.5">${fmt(result.ivps, 2)}</p>
            <p className="text-xs text-blue-300 mt-0.5 capitalize">{scenario} Case</p>
          </div>
          {currentPrice > 0 && (
            <div className="border-l border-blue-700 pl-8">
              <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Market Price</p>
              <p className="text-2xl font-bold text-white mt-0.5">${fmt(currentPrice, 2)}</p>
              {upside !== null && (
                <p className={`text-sm font-bold mt-0.5 ${upside >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {upside >= 0 ? "▲" : "▼"} {fmt(Math.abs(upside), 1)}% vs. market
                </p>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-8 text-right">
          <div>
            <p className="text-[10px] text-blue-300 uppercase tracking-widest">WACC</p>
            <p className="text-lg font-bold text-white">{fmt(result.wacc * 100, 2)}%</p>
          </div>
          <div>
            <p className="text-[10px] text-blue-300 uppercase tracking-widest">Terminal Growth</p>
            <p className="text-lg font-bold text-white">{fmt(a.terminalGrowthRate * 100, 1)}%</p>
          </div>
          <div>
            <p className="text-[10px] text-blue-300 uppercase tracking-widest">TV % of EV</p>
            <p className="text-lg font-bold text-white">{fmt(result.tvPct, 1)}%</p>
          </div>
        </div>
      </div>

      {/* ── SCENARIO COMPARISON TABLE ── */}
      <div className="border-x border-gray-300">
        <div className="bg-[#1a3a5c] px-5 py-2.5 text-center">
          <p className="text-xs font-bold text-white uppercase tracking-widest">Bear / Base / Bull Scenario Summary</p>
        </div>
        <div className="overflow-x-auto bg-white">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300">
                <th className="text-left px-5 py-2.5 font-semibold text-gray-700 w-48">Metric</th>
                <th className="px-5 py-2.5 text-right font-semibold text-red-700 border-l border-gray-200">Bear Case</th>
                <th className="px-5 py-2.5 text-right font-semibold text-[#1a3a5c] border-l border-gray-200 bg-blue-50">Base Case</th>
                <th className="px-5 py-2.5 text-right font-semibold text-green-700 border-l border-gray-200">Bull Case</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Intrinsic Value / Share", fn: (r: NonNullable<ReturnType<typeof computeDCF>>) => `$${fmt(r.ivps, 2)}`, bold: true },
                { label: "WACC", fn: (r: NonNullable<ReturnType<typeof computeDCF>>) => `${fmt(r.wacc * 100, 2)}%`, bold: false },
                { label: "Enterprise Value ($M)", fn: (r: NonNullable<ReturnType<typeof computeDCF>>) => `$${fmt(r.ev, 0)}`, bold: false },
                { label: "EBIT Margin", fn: (r: NonNullable<ReturnType<typeof computeDCF>>) => `${fmt(r.ebitMargin * 100, 1)}%`, bold: false },
                { label: "TV % of EV", fn: (r: NonNullable<ReturnType<typeof computeDCF>>) => `${fmt(r.tvPct, 1)}%`, bold: false },
                ...(currentPrice > 0 ? [{
                  label: "Upside / Downside",
                  fn: (r: NonNullable<ReturnType<typeof computeDCF>>) => {
                    const u = ((r.ivps - currentPrice) / currentPrice) * 100;
                    return `${u >= 0 ? "+" : ""}${fmt(u, 1)}%`;
                  },
                  bold: true
                }] : []),
              ].map(({ label, fn, bold }, i) => (
                <tr key={label} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className={`px-5 py-2 text-gray-700 ${bold ? "font-bold" : ""}`}>{label}</td>
                  <td className={`px-5 py-2 text-right font-mono border-l border-gray-200 ${bold ? "font-bold text-red-700" : "text-red-600"}`}>{fn(bearResult)}</td>
                  <td className={`px-5 py-2 text-right font-mono border-l border-gray-200 bg-blue-50 ${bold ? "font-bold text-[#1a3a5c]" : "text-blue-800"}`}>{fn(baseResult)}</td>
                  <td className={`px-5 py-2 text-right font-mono border-l border-gray-200 ${bold ? "font-bold text-green-700" : "text-green-700"}`}>{fn(bullResult)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── EV → EQUITY BRIDGE ── */}
      <div className="border-x border-gray-300">
        <div className="bg-[#1a3a5c] px-5 py-2.5 text-center">
          <p className="text-xs font-bold text-white uppercase tracking-widest">Enterprise Value → Equity Value Bridge <span className="font-normal normal-case">(Per Share, {scenario.charAt(0).toUpperCase() + scenario.slice(1)} Case)</span></p>
        </div>
        <div className="overflow-x-auto bg-white">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300">
                <th className="text-left px-5 py-2.5 font-semibold text-gray-700 w-64">Component</th>
                <th className="text-right px-5 py-2.5 font-semibold text-gray-700 w-40 border-l border-gray-200">Value ($M)</th>
                <th className="text-right px-5 py-2.5 font-semibold text-gray-700 w-36 border-l border-gray-200">Per Share</th>
                <th className="text-right px-5 py-2.5 font-semibold text-gray-700 w-28 border-l border-gray-200">% of EV</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white">
                <td className="px-5 py-2 text-gray-600 pl-8">PV of Projected FCFs ({a.projectionYears}-Year)</td>
                <td className="px-5 py-2 text-right font-mono text-gray-700 border-l border-gray-200">{fmt(result.sumPVFcf, 1)}</td>
                <td className="px-5 py-2 text-right font-mono text-gray-700 border-l border-gray-200">${fmt(result.sumPVFcf / shares, 2)}</td>
                <td className="px-5 py-2 text-right font-mono text-gray-500 border-l border-gray-200">{fmt((result.sumPVFcf / result.ev) * 100, 1)}%</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="px-5 py-2 text-gray-600 pl-8">PV of Terminal Value (Gordon Growth)</td>
                <td className="px-5 py-2 text-right font-mono text-gray-700 border-l border-gray-200">{fmt(result.pvTV, 1)}</td>
                <td className="px-5 py-2 text-right font-mono text-gray-700 border-l border-gray-200">${fmt(result.pvTV / shares, 2)}</td>
                <td className="px-5 py-2 text-right font-mono text-gray-500 border-l border-gray-200">{fmt(result.tvPct, 1)}%</td>
              </tr>
              <tr className="bg-[#0f2744] text-white border-t-2 border-[#0f2744]">
                <td className="px-5 py-2.5 font-bold">= Enterprise Value (EV)</td>
                <td className="px-5 py-2.5 text-right font-mono font-bold border-l border-blue-800">{fmt(result.ev, 1)}</td>
                <td className="px-5 py-2.5 text-right font-mono font-bold border-l border-blue-800">${fmt(result.ev / shares, 2)}</td>
                <td className="px-5 py-2.5 text-right font-mono border-l border-blue-800">100.0%</td>
              </tr>
              <tr className="bg-white">
                <td className="px-5 py-2 text-gray-600 pl-8">
                  {a.netDebt < 0 ? "+ Net Cash (EV → Equity)" : "− Net Debt (EV → Equity)"}
                </td>
                <td className={`px-5 py-2 text-right font-mono font-semibold border-l border-gray-200 ${a.netDebt < 0 ? "text-green-700" : "text-red-700"}`}>
                  {a.netDebt < 0 ? "+" : "-"}{fmt(Math.abs(a.netDebt), 1)}
                </td>
                <td className={`px-5 py-2 text-right font-mono font-semibold border-l border-gray-200 ${a.netDebt < 0 ? "text-green-700" : "text-red-700"}`}>
                  {a.netDebt < 0 ? "+$" : "-$"}{fmt(Math.abs(a.netDebt) / shares, 2)}
                </td>
                <td className="px-5 py-2 text-right font-mono text-gray-400 border-l border-gray-200">—</td>
              </tr>
              {a.minorityInterest > 0 && (
                <tr className="bg-gray-50">
                  <td className="px-5 py-2 text-gray-600 pl-8">− Minority Interest</td>
                  <td className="px-5 py-2 text-right font-mono font-semibold text-red-700 border-l border-gray-200">-{fmt(a.minorityInterest, 1)}</td>
                  <td className="px-5 py-2 text-right font-mono font-semibold text-red-700 border-l border-gray-200">-${fmt(a.minorityInterest / shares, 2)}</td>
                  <td className="px-5 py-2 text-right font-mono text-gray-400 border-l border-gray-200">—</td>
                </tr>
              )}
              <tr className="bg-gray-900 text-white border-t-2 border-gray-700">
                <td className="px-5 py-2.5 font-bold">= Equity Value / Share (IVPS)</td>
                <td className="px-5 py-2.5 text-right font-mono font-bold text-green-400 border-l border-gray-700">{fmt(result.equity, 1)}</td>
                <td className="px-5 py-2.5 text-right font-mono font-bold text-green-400 border-l border-gray-700">${fmt(result.ivps, 2)}</td>
                <td className="px-5 py-2.5 text-right font-mono text-gray-400 border-l border-gray-700">—</td>
              </tr>
            </tbody>
          </table>
          <div className="bg-gray-50 px-5 py-2 border-t border-gray-200 text-xs text-gray-400">
            Shares Outstanding: {fmt(shares, 1)}M &nbsp;|&nbsp; WACC: {fmt(result.wacc * 100, 2)}% &nbsp;|&nbsp; Terminal Growth Rate: {fmt(a.terminalGrowthRate * 100, 1)}% &nbsp;|&nbsp; Projection Period: {a.projectionYears} years
          </div>
        </div>
      </div>

      {/* ── PROJECTED FINANCIALS ── */}
      <div className="border-x border-gray-300">
        <div className="bg-[#1a3a5c] px-5 py-2.5 text-center">
          <p className="text-xs font-bold text-white uppercase tracking-widest">
            Projected Financials — {scenario.charAt(0).toUpperCase() + scenario.slice(1)} Case <span className="font-normal normal-case">($ per share)</span>
          </p>
        </div>
        <div className="overflow-x-auto bg-white">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300">
                <th className="text-left px-5 py-2.5 font-semibold text-gray-700 w-56">Metric</th>
                {result.revenues.map((_, i) => (
                  <th key={i} className="px-5 py-2.5 text-right font-semibold text-gray-700 border-l border-gray-200">
                    FY{latestYear + i + 1}E
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-blue-50">
                <td className="px-5 py-2.5 font-bold text-gray-900">Revenue / Share</td>
                {result.revenues.map((v, i) => (
                  <td key={i} className="px-5 py-2.5 text-right font-mono font-bold text-[#1a3a5c] border-l border-gray-200">${fmt(v / shares, 2)}</td>
                ))}
              </tr>
              <tr className="bg-blue-50">
                <td className="px-5 py-2 text-gray-500 pl-10 text-xs">YoY Revenue Growth %</td>
                {result.revenues.map((v, i) => {
                  const prev = i === 0 ? hist[0].revenue / 1e6 : result.revenues[i - 1];
                  const g = ((v - prev) / prev) * 100;
                  return <td key={i} className="px-5 py-2 text-right text-xs font-mono text-blue-600 border-l border-gray-200">{g >= 0 ? "+" : ""}{fmt(g, 1)}%</td>;
                })}
              </tr>
              <tr className="bg-white border-t border-gray-200">
                <td className="px-5 py-2.5 font-semibold text-gray-800">EBIT / Share</td>
                {result.ebits.map((v, i) => (
                  <td key={i} className="px-5 py-2.5 text-right font-mono text-gray-800 border-l border-gray-200">${fmt(v / shares, 2)}</td>
                ))}
              </tr>
              <tr className="bg-white">
                <td className="px-5 py-2 text-gray-500 pl-10 text-xs">EBIT Margin %</td>
                {result.ebits.map((v, i) => (
                  <td key={i} className="px-5 py-2 text-right text-xs font-mono text-gray-500 border-l border-gray-200">{fmt((v / result.revenues[i]) * 100, 1)}%</td>
                ))}
              </tr>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-5 py-2.5 font-semibold text-gray-800">Free Cash Flow / Share</td>
                {result.fcfs.map((v, i) => (
                  <td key={i} className="px-5 py-2.5 text-right font-mono text-gray-800 border-l border-gray-200">${fmt(v / shares, 2)}</td>
                ))}
              </tr>
              <tr className="bg-gray-50">
                <td className="px-5 py-2 text-gray-500 pl-10 text-xs">FCF Margin %</td>
                {result.fcfs.map((v, i) => (
                  <td key={i} className="px-5 py-2 text-right text-xs font-mono text-gray-500 border-l border-gray-200">{fmt((v / result.revenues[i]) * 100, 1)}%</td>
                ))}
              </tr>
              <tr className="bg-[#0f2744] text-white border-t-2">
                <td className="px-5 py-2.5 font-bold">PV of FCF / Share</td>
                {result.pvFcfs.map((v, i) => (
                  <td key={i} className="px-5 py-2.5 text-right font-mono font-bold border-l border-blue-800">${fmt(v / shares, 2)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SENSITIVITIES HEADER ── */}
      <div className="border-x border-t border-gray-300 bg-[#0f2744] px-5 py-3 flex items-center justify-between">
        <div>
          <p className="text-base font-bold text-white">Discounted Cash Flow Analysis — Sensitivities</p>
          <p className="text-xs text-blue-300 mt-0.5">($ per share, Base Case assumptions)</p>
        </div>
        <span className="border border-red-400 text-red-400 text-xs font-bold uppercase tracking-widest px-2 py-0.5">Confidential</span>
      </div>

      {/* ── SENSITIVITY 1: WACC × Terminal Growth Rate ── */}
      <div className="border-x border-gray-300 bg-white">
        <div className="bg-[#1a3a5c] px-5 py-2.5 text-center">
          <p className="text-xs font-bold text-white uppercase tracking-widest">WACC × Terminal Growth Rate Sensitivity — Intrinsic Value / Share</p>
        </div>
        <div className="flex">
          {/* Assumptions sidebar */}
          <div className="w-52 flex-shrink-0 bg-gray-50 border-r border-gray-200 px-4 py-4">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Assumptions</p>
            <ul className="space-y-2 text-xs text-gray-600">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-2 h-2 bg-[#1a3a5c] rounded-sm flex-shrink-0"></span>
                <span>EBIT Margin: {fmt(a.ebitMarginBase * 100, 1)}%</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-2 h-2 bg-[#1a3a5c] rounded-sm flex-shrink-0"></span>
                <span>Rev. Growth (Avg): {fmt(baseRevGrowth * 100, 1)}%</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-2 h-2 bg-[#1a3a5c] rounded-sm flex-shrink-0"></span>
                <span>Base WACC: {fmt(a.waccBase * 100, 1)}%</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-2 h-2 bg-[#1a3a5c] rounded-sm flex-shrink-0"></span>
                <span>Base TGR: {fmt(a.terminalGrowthRate * 100, 1)}%</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-2 h-2 bg-[#1a3a5c] rounded-sm flex-shrink-0"></span>
                <span>Tax Rate: {fmt(a.taxRate * 100, 1)}%</span>
              </li>
            </ul>
          </div>
          {/* Table */}
          <div className="flex-1 overflow-x-auto">
            <table className="text-sm w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <td colSpan={1} className="px-4 py-2 text-xs text-gray-500 border-b border-gray-300"></td>
                  <td colSpan={waccSteps.length} className="px-4 py-2 text-center text-xs font-bold text-[#1a3a5c] uppercase tracking-wide border-b border-gray-300 bg-blue-50">
                    WACC
                  </td>
                </tr>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 w-24">TGR \ WACC</th>
                  {waccSteps.map((d) => (
                    <th key={d} className={`px-4 py-2 text-right font-mono font-semibold text-xs border-l border-gray-200 ${d === 0 ? "bg-blue-100 text-[#1a3a5c]" : "text-gray-700"}`}>
                      {fmt((baseWacc + d) * 100, 1)}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tgrSteps.map((tgr, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2.5 bg-[#1a3a5c] text-white font-mono font-bold text-xs text-right border-b border-[#2a4a6c]">
                      {fmt(tgr * 100, 1)}%
                    </td>
                    {waccSteps.map((waccD, ci) => {
                      const isCenter = ri === 2 && ci === 2;
                      const val = sensitivityWacc[ri][ci];
                      const isAbove = currentPrice > 0 && val >= currentPrice;
                      const isBelow = currentPrice > 0 && val < currentPrice;
                      return (
                        <td
                          key={ci}
                          className={`px-4 py-2.5 text-right font-mono text-xs font-semibold border-l border-b border-gray-200
                            ${isCenter
                              ? "bg-blue-100 text-[#0f2744] ring-2 ring-[#1a3a5c] ring-inset font-bold"
                              : isAbove
                                ? "bg-green-50 text-green-800"
                                : isBelow
                                  ? "bg-red-50 text-red-800"
                                  : "text-gray-700"
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
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400">
              {currentPrice > 0 ? `Green = above market price ($${fmt(currentPrice, 2)}). Red = below market price. ` : ""}Blue = Base Case assumptions.
            </div>
          </div>
        </div>
      </div>

      {/* ── SENSITIVITY 2: Revenue Growth × EBIT Margin ── */}
      <div className="border-x border-b border-gray-300 bg-white rounded-b-xl overflow-hidden">
        <div className="bg-[#1a3a5c] px-5 py-2.5 text-center">
          <p className="text-xs font-bold text-white uppercase tracking-widest">Revenue Growth CAGR × EBIT Margin Sensitivity — Intrinsic Value / Share</p>
        </div>
        <div className="flex">
          {/* Assumptions sidebar */}
          <div className="w-52 flex-shrink-0 bg-gray-50 border-r border-gray-200 px-4 py-4">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Assumptions</p>
            <ul className="space-y-2 text-xs text-gray-600">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-2 h-2 bg-[#1a3a5c] rounded-sm flex-shrink-0"></span>
                <span>Base WACC: {fmt(a.waccBase * 100, 1)}%</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-2 h-2 bg-[#1a3a5c] rounded-sm flex-shrink-0"></span>
                <span>Terminal Growth: {fmt(a.terminalGrowthRate * 100, 1)}%</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-2 h-2 bg-[#1a3a5c] rounded-sm flex-shrink-0"></span>
                <span>Base Rev. Growth: {fmt(baseRevGrowth * 100, 1)}%</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-2 h-2 bg-[#1a3a5c] rounded-sm flex-shrink-0"></span>
                <span>Base EBIT Margin: {fmt(baseEbitMargin * 100, 1)}%</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-2 h-2 bg-[#1a3a5c] rounded-sm flex-shrink-0"></span>
                <span>Tax Rate: {fmt(a.taxRate * 100, 1)}%</span>
              </li>
            </ul>
          </div>
          {/* Table */}
          <div className="flex-1 overflow-x-auto">
            <table className="text-sm w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <td className="px-4 py-2 border-b border-gray-300"></td>
                  <td colSpan={marginSteps.length} className="px-4 py-2 text-center text-xs font-bold text-[#1a3a5c] uppercase tracking-wide border-b border-gray-300 bg-blue-50">
                    EBIT Margin
                  </td>
                </tr>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 w-24">Growth \ Margin</th>
                  {marginSteps.map((m, i) => (
                    <th key={i} className={`px-4 py-2 text-right font-mono font-semibold text-xs border-l border-gray-200 ${i === 2 ? "bg-blue-100 text-[#1a3a5c]" : "text-gray-700"}`}>
                      {fmt(m * 100, 1)}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {growthSteps.map((g, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2.5 bg-[#1a3a5c] text-white font-mono font-bold text-xs text-right border-b border-[#2a4a6c]">
                      {fmt(g * 100, 1)}%
                    </td>
                    {marginSteps.map((m, ci) => {
                      const isCenter = ri === 2 && ci === 2;
                      const val = sensitivityGrowthMargin[ri][ci];
                      const isAbove = currentPrice > 0 && val >= currentPrice;
                      const isBelow = currentPrice > 0 && val < currentPrice;
                      return (
                        <td
                          key={ci}
                          className={`px-4 py-2.5 text-right font-mono text-xs font-semibold border-l border-b border-gray-200
                            ${isCenter
                              ? "bg-blue-100 text-[#0f2744] ring-2 ring-[#1a3a5c] ring-inset font-bold"
                              : isAbove
                                ? "bg-green-50 text-green-800"
                                : isBelow
                                  ? "bg-red-50 text-red-800"
                                  : "text-gray-700"
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
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400">
              {currentPrice > 0 ? `Green = above market price ($${fmt(currentPrice, 2)}). Red = below market price. ` : ""}Blue = Base Case assumptions.
            </div>
          </div>
        </div>
        <div className="bg-gray-50 px-5 py-2.5 border-t border-gray-200 text-xs text-gray-400 italic">
          Source: BOE Group DCF Model. Note: All values per share. Projections based on analyst estimates. For internal use only.
        </div>
      </div>

    </div>
  );
}
