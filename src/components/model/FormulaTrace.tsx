"use client";
import { useState } from "react";
import type { DCFModel } from "@/types/model";

interface TraceNode {
  label: string;
  value: string;
  formula?: string;
  meaning?: string;
  source?: string;
  sensitivity?: string;
  children?: TraceNode[];
}

function calcIVPS(model: DCFModel, scenario: "bear" | "base" | "bull") {
  const a = model.assumptions;
  const hist = model.historicalPeriods;
  const growthKey = `revenueGrowth${scenario.charAt(0).toUpperCase() + scenario.slice(1)}` as keyof typeof a;
  const ebitMargin = scenario === "bear" ? a.ebitMarginBear : scenario === "bull" ? a.ebitMarginBull : a.ebitMarginBase;
  const wacc = scenario === "bear" ? a.waccBear : scenario === "bull" ? a.waccBull : a.waccBase;
  const growthRates = a[growthKey] as number[];
  let rev = hist[0].revenue / 1e6;
  const fcfs: number[] = [];
  const pvFcfs: number[] = [];
  const revs: number[] = [];
  for (let yr = 1; yr <= a.projectionYears; yr++) {
    rev *= (1 + growthRates[yr - 1]);
    revs.push(rev);
    const ebit = rev * ebitMargin;
    const nopat = ebit * (1 - a.taxRate);
    const fcf = nopat + rev * a.depreciationPct - rev * a.capexPct;
    fcfs.push(fcf);
    pvFcfs.push(fcf / Math.pow(1 + wacc, yr - 0.5));
  }
  const tv = (fcfs[a.projectionYears - 1] * (1 + a.terminalGrowthRate)) / (wacc - a.terminalGrowthRate);
  const pvTV = tv / Math.pow(1 + wacc, a.projectionYears);
  const ev = pvFcfs.reduce((s, v) => s + v, 0) + pvTV;
  const ivps = (ev - a.netDebt - a.minorityInterest) / a.sharesOutstanding;
  return { ivps, ev, pvFcfs, pvTV, fcfs, revs };
}

const fmt = (v: number, d = 2) => `$${v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const fmtM = (v: number) => `$${v.toFixed(1)}M`;
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

// Sensitivity: how much does IVPS change per 1pp change in a driver?
function sensitivityOf(model: DCFModel, scenario: "bear" | "base" | "bull", driver: "wacc" | "growth" | "ebit" | "tgr", delta = 0.01): string {
  const base = calcIVPS(model, scenario).ivps;
  const aRaw = { ...model.assumptions } as unknown as Record<string, unknown>;
  if (driver === "wacc") {
    const key = scenario === "bear" ? "waccBear" : scenario === "bull" ? "waccBull" : "waccBase";
    aRaw[key] = (aRaw[key] as number) + delta;
  } else if (driver === "growth") {
    const key = `revenueGrowth${scenario.charAt(0).toUpperCase() + scenario.slice(1)}`;
    aRaw[key] = (aRaw[key] as number[]).map((v: number) => v + delta);
  } else if (driver === "ebit") {
    const key = scenario === "bear" ? "ebitMarginBear" : scenario === "bull" ? "ebitMarginBull" : "ebitMarginBase";
    aRaw[key] = (aRaw[key] as number) + delta;
  } else if (driver === "tgr") {
    aRaw["terminalGrowthRate"] = (aRaw["terminalGrowthRate"] as number) + delta;
  }
  const a = aRaw as unknown as typeof model.assumptions;
  const modified = calcIVPS({ ...model, assumptions: a }, scenario).ivps;
  const change = modified - base;
  const sign = change >= 0 ? "+" : "";
  return `±1pp → ${sign}${fmt(change)} / share`;
}

// Historical revenue CAGR
function histCAGR(model: DCFModel): string {
  const hist = model.historicalPeriods;
  if (hist.length < 2) return "N/A";
  const oldest = hist[hist.length - 1];
  const newest = hist[0];
  const years = newest.year - oldest.year;
  if (years === 0) return "N/A";
  const cagr = Math.pow(newest.revenue / oldest.revenue, 1 / years) - 1;
  return fmtPct(cagr);
}

function TreeItem({ node, depth }: { node: TraceNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = !!node.children?.length;

  const depthColors = ["text-gray-900 font-bold", "text-gray-800 font-semibold", "text-gray-700", "text-gray-600"];
  const valueColors = ["text-[#0f2744] text-lg", "text-blue-700", "text-blue-600 text-xs", "text-gray-500 text-xs"];

  return (
    <li>
      <div
        className={`flex items-start gap-2 py-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors group ${depth === 0 ? "bg-blue-50 border border-blue-100 px-4 mb-1" : "px-3"}`}
        style={{ paddingLeft: depth === 0 ? undefined : `${12 + depth * 18}px` }}
        onClick={() => hasChildren && setOpen(!open)}
      >
        <span className="text-gray-300 text-[10px] mt-1.5 shrink-0 w-3">
          {hasChildren ? (open ? "▼" : "▶") : "·"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-sm ${depthColors[Math.min(depth, 3)]}`}>{node.label}</span>
            <span className={`font-mono font-bold ${valueColors[Math.min(depth, 3)]}`}>{node.value}</span>
          </div>
          {node.formula && (
            <p className="text-[11px] text-blue-600 font-mono mt-0.5 leading-relaxed">{node.formula}</p>
          )}
          {node.meaning && (
            <p className="text-[11px] text-gray-400 mt-0.5">{node.meaning}</p>
          )}
          {node.source && (
            <p className="text-[11px] text-amber-600 mt-0.5 flex items-center gap-1">
              <span className="font-semibold">Source:</span> {node.source}
            </p>
          )}
          {node.sensitivity && (
            <p className="text-[11px] text-purple-600 mt-0.5 flex items-center gap-1">
              <span className="font-semibold">Sensitivity:</span> {node.sensitivity}
            </p>
          )}
        </div>
      </div>
      {hasChildren && open && (
        <div className={`border-l-2 ${depth === 0 ? "border-blue-200 ml-5" : "border-gray-100 ml-6"}`}>
          <ul className="space-y-0.5 py-1">
            {node.children!.map((child, i) => (
              <TreeItem key={i} node={child} depth={depth + 1} />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export function FormulaTrace({ model }: { model: DCFModel }) {
  const [scenario, setScenario] = useState<"bear" | "base" | "bull">("base");
  const [view, setView] = useState<"tree" | "audit">("tree");

  const a = model.assumptions;
  const hist = model.historicalPeriods;
  const latest = hist[0];
  const wacc = scenario === "bear" ? a.waccBear : scenario === "bull" ? a.waccBull : a.waccBase;
  const ebitMargin = scenario === "bear" ? a.ebitMarginBear : scenario === "bull" ? a.ebitMarginBull : a.ebitMarginBase;
  const growthRates = (a[`revenueGrowth${scenario.charAt(0).toUpperCase() + scenario.slice(1)}` as keyof typeof a] as number[]);

  const { ivps, ev, pvFcfs, pvTV, fcfs, revs } = calcIVPS(model, scenario);
  const totalPvFcf = pvFcfs.reduce((s, v) => s + v, 0);
  const histCagr = histCAGR(model);
  const histEBIT = latest ? fmtPct(latest.ebit / latest.revenue) : "N/A";

  // Implied WACC decomposition (rough estimation)
  const rfRate = 0.043; // approx 10Y UST
  const erp = 0.055;
  const impliedBeta = ((wacc - rfRate) / erp).toFixed(2);
  const costOfDebt = 0.05; // estimate
  const debtWeight = 0.25; // estimate

  // Year-by-year FCF nodes
  let rev0 = latest.revenue / 1e6;
  const yearNodes: TraceNode[] = [];
  for (let yr = 1; yr <= a.projectionYears; yr++) {
    rev0 *= (1 + growthRates[yr - 1]);
    const ebit = rev0 * ebitMargin;
    const nopat = ebit * (1 - a.taxRate);
    const da = rev0 * a.depreciationPct;
    const capex = rev0 * a.capexPct;
    const fcf = nopat + da - capex;
    const discount = Math.pow(1 + wacc, yr - 0.5);
    yearNodes.push({
      label: `Year ${yr} FCF`,
      value: fmtM(fcf),
      formula: `FCF = NOPAT + D&A − CapEx = ${fmtM(nopat)} + ${fmtM(da)} − ${fmtM(capex)}`,
      children: [
        {
          label: "Revenue",
          value: fmtM(rev0),
          formula: `Rev${yr} = Rev${yr - 1} × (1 + ${fmtPct(growthRates[yr - 1])})`,
          source: yr === 1 ? `Historical ${a.projectionYears}Y CAGR: ${histCagr}. Yr1 growth assumption: ${fmtPct(growthRates[0])}` : `Year ${yr} of declining growth path`,
        },
        {
          label: "EBIT",
          value: fmtM(ebit),
          formula: `Revenue × ${fmtPct(ebitMargin)} EBIT Margin`,
          source: `Historical EBIT margin: ${histEBIT}. Projected margin: ${fmtPct(ebitMargin)}`,
        },
        { label: "NOPAT", value: fmtM(nopat), formula: `EBIT × (1 − ${fmtPct(a.taxRate)} tax rate)` },
        { label: "D&A (add back)", value: fmtM(da), formula: `Revenue × ${fmtPct(a.depreciationPct)} D&A rate` },
        { label: "CapEx (deduct)", value: fmtM(capex), formula: `Revenue × ${fmtPct(a.capexPct)} CapEx rate` },
        {
          label: "PV of FCF",
          value: fmtM(pvFcfs[yr - 1]),
          formula: `${fmtM(fcf)} ÷ (1 + ${fmtPct(wacc)})^${(yr - 0.5).toFixed(1)} = ÷ ${discount.toFixed(3)}`,
          meaning: "Discounted to present value using mid-year convention",
        },
      ],
    });
  }

  const lastFcf = fcfs[a.projectionYears - 1];
  const tv = (lastFcf * (1 + a.terminalGrowthRate)) / (wacc - a.terminalGrowthRate);
  const tvPct = ev > 0 ? ((pvTV / ev) * 100).toFixed(1) : "0";

  const tree: TraceNode[] = [
    {
      label: "Intrinsic Value Per Share (IVPS)",
      value: fmt(ivps),
      formula: "IVPS = (EV − Net Debt − Minority Interest) ÷ Shares Outstanding",
      meaning: "Per-share intrinsic value based on discounted future free cash flows",
      children: [
        {
          label: "Enterprise Value (EV)",
          value: fmtM(ev),
          formula: "EV = Σ PV(FCF) + PV(Terminal Value)",
          meaning: "Total intrinsic business value before capital structure",
          children: [
            {
              label: `Σ PV of Free Cash Flows (Yr 1–${a.projectionYears})`,
              value: fmtM(totalPvFcf),
              formula: `Sum of ${a.projectionYears} discounted annual FCFs (${((totalPvFcf / ev) * 100).toFixed(1)}% of EV)`,
              children: yearNodes,
            },
            {
              label: "PV of Terminal Value",
              value: fmtM(pvTV),
              formula: `TV ÷ (1 + ${fmtPct(wacc)})^${a.projectionYears} = ${fmtM(tv)} ÷ ${Math.pow(1 + wacc, a.projectionYears).toFixed(3)}`,
              meaning: `${tvPct}% of total EV — ${parseFloat(tvPct) > 75 ? "high TV dependency, model sensitive to terminal assumptions" : "within normal range for mature company"}`,
              sensitivity: sensitivityOf(model, scenario, "tgr"),
              children: [
                {
                  label: "Terminal Value (Gordon Growth Model)",
                  value: fmtM(tv),
                  formula: `FCF_final × (1 + TGR) ÷ (WACC − TGR) = ${fmtM(lastFcf)} × (1 + ${fmtPct(a.terminalGrowthRate)}) ÷ (${fmtPct(wacc)} − ${fmtPct(a.terminalGrowthRate)})`,
                  meaning: "Perpetuity value of all cash flows beyond the projection window",
                  children: [
                    {
                      label: `Final Year FCF (Yr ${a.projectionYears})`,
                      value: fmtM(lastFcf),
                      meaning: "Base for terminal value — must reflect normalized, sustainable FCF",
                    },
                    {
                      label: "Terminal Growth Rate (TGR)",
                      value: fmtPct(a.terminalGrowthRate),
                      source: "Long-run nominal GDP growth proxy (~2–3% for developed markets)",
                      sensitivity: sensitivityOf(model, scenario, "tgr"),
                      meaning: "Perpetual growth rate — cannot sustainably exceed long-run GDP",
                    },
                    {
                      label: "WACC",
                      value: fmtPct(wacc),
                      source: "Weighted Average Cost of Capital — see WACC breakdown below",
                      sensitivity: sensitivityOf(model, scenario, "wacc"),
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "WACC (Weighted Avg. Cost of Capital)",
          value: fmtPct(wacc),
          formula: `WACC = Ke × We + Kd × (1−t) × Wd`,
          meaning: "Blended discount rate reflecting cost of equity and after-tax cost of debt",
          sensitivity: sensitivityOf(model, scenario, "wacc"),
          children: [
            { label: "Risk-Free Rate (10Y UST proxy)", value: fmtPct(rfRate), source: "Approximate 10-year US Treasury yield" },
            { label: "Equity Risk Premium", value: fmtPct(erp), source: "Damodaran US ERP estimate" },
            { label: "Implied Beta", value: `${impliedBeta}x`, formula: `β = (WACC − Rf) ÷ ERP = (${fmtPct(wacc)} − ${fmtPct(rfRate)}) ÷ ${fmtPct(erp)}`, meaning: "Implied equity beta from WACC assumption" },
            { label: "Cost of Equity (est.)", value: fmtPct(rfRate + parseFloat(impliedBeta) * erp), formula: `Ke = Rf + β × ERP = ${fmtPct(rfRate)} + ${impliedBeta} × ${fmtPct(erp)}` },
            { label: "Estimated Cost of Debt", value: fmtPct(costOfDebt), source: "Estimate — verify against company credit spreads" },
            { label: "Effective After-Tax Cost of Debt", value: fmtPct(costOfDebt * (1 - a.taxRate)), formula: `Kd × (1 − ${fmtPct(a.taxRate)})` },
          ],
        },
        {
          label: "Revenue Growth Assumptions",
          value: `${fmtPct(growthRates[0])} → ${fmtPct(growthRates[growthRates.length - 1])} (Yr1→${a.projectionYears})`,
          source: `Historical revenue CAGR: ${histCagr}`,
          sensitivity: sensitivityOf(model, scenario, "growth"),
          meaning: "Year-by-year growth rates driving the projection period",
          children: growthRates.map((g, i) => ({
            label: `Year ${i + 1} Growth`,
            value: fmtPct(g),
            formula: `Yr${i + 1} Revenue = Yr${i} Revenue × (1 + ${fmtPct(g)})`,
            source: i === 0 ? `Yr1 vs historical ${a.projectionYears}Y CAGR of ${histCagr}` : "Declining toward long-run sustainable rate",
          })),
        },
        {
          label: "EBIT Margin",
          value: fmtPct(ebitMargin),
          formula: "Applied uniformly across all projection years",
          source: `Historical EBIT margin: ${histEBIT}. Assumption implies ${parseFloat(fmtPct(ebitMargin)) > parseFloat(histEBIT) ? "margin expansion" : parseFloat(fmtPct(ebitMargin)) < parseFloat(histEBIT) ? "margin compression" : "stable margins"}`,
          sensitivity: sensitivityOf(model, scenario, "ebit"),
          meaning: "Projected operating margin — single key driver of FCF generation",
        },
        { label: "Less: Net Debt", value: fmtM(a.netDebt), meaning: "Total debt minus cash — bridges from EV to equity value ($M)" },
        { label: "Less: Minority Interest", value: fmtM(a.minorityInterest), meaning: "Non-controlling interests in consolidated subsidiaries ($M)" },
        { label: "Shares Outstanding", value: `${a.sharesOutstanding.toFixed(1)}M shares`, meaning: "Diluted share count — divides equity value into per-share IVPS" },
      ],
    },
  ];

  // Assumption audit table
  const auditRows = [
    { assumption: "Revenue Growth (Yr1)", value: fmtPct(growthRates[0]), benchmark: histCagr, delta: fmtPct(growthRates[0] - (parseFloat(histCagr) / 100)), sensitivity: sensitivityOf(model, scenario, "growth"), risk: Math.abs(growthRates[0] - parseFloat(histCagr) / 100) > 0.05 ? "warn" : "ok" },
    { assumption: "EBIT Margin", value: fmtPct(ebitMargin), benchmark: histEBIT, delta: fmtPct(ebitMargin - (latest ? latest.ebit / latest.revenue : 0)), sensitivity: sensitivityOf(model, scenario, "ebit"), risk: Math.abs(ebitMargin - (latest ? latest.ebit / latest.revenue : 0)) > 0.08 ? "warn" : "ok" },
    { assumption: "WACC", value: fmtPct(wacc), benchmark: "6–12% typical", delta: "—", sensitivity: sensitivityOf(model, scenario, "wacc"), risk: wacc < 0.06 || wacc > 0.14 ? "warn" : "ok" },
    { assumption: "Terminal Growth Rate", value: fmtPct(a.terminalGrowthRate), benchmark: "1–3% (GDP)", delta: "—", sensitivity: sensitivityOf(model, scenario, "tgr"), risk: a.terminalGrowthRate > 0.04 ? "warn" : "ok" },
    { assumption: "Tax Rate", value: fmtPct(a.taxRate), benchmark: "15–28% typical", delta: "—", sensitivity: "—", risk: a.taxRate < 0.15 || a.taxRate > 0.30 ? "warn" : "ok" },
    { assumption: "CapEx % Revenue", value: fmtPct(a.capexPct), benchmark: fmtPct(a.depreciationPct) + " (D&A)", delta: fmtPct(a.capexPct - a.depreciationPct), sensitivity: "—", risk: "ok" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-teal-600 rounded" />
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Formula Trace</h2>
          <span className="text-xs text-gray-400">Full audit trail from input to IVPS</span>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setView("tree")} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === "tree" ? "bg-[#0f2744] text-white" : "bg-white text-gray-600"}`}>Tree</button>
            <button onClick={() => setView("audit")} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === "audit" ? "bg-[#0f2744] text-white" : "bg-white text-gray-600"}`}>Audit</button>
          </div>
          {/* Scenario toggle */}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            {(["bear", "base", "bull"] as const).map((s) => (
              <button key={s} onClick={() => setScenario(s)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors capitalize ${scenario === s ? s === "bear" ? "bg-red-700 text-white" : s === "bull" ? "bg-green-700 text-white" : "bg-[#0f2744] text-white" : "bg-white text-gray-600"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* IVPS badge */}
      <div className="bg-[#0f2744] rounded-xl px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">{scenario} Case — Intrinsic Value Per Share</p>
          <p className="text-3xl font-bold text-white font-mono mt-0.5">{fmt(ivps)}</p>
        </div>
        <div className="text-right text-xs text-blue-300 space-y-1">
          <p>EV: <strong className="text-white">{fmtM(ev)}</strong></p>
          <p>PV FCFs: <strong className="text-white">{fmtM(totalPvFcf)}</strong> ({((totalPvFcf / ev) * 100).toFixed(0)}%)</p>
          <p>PV TV: <strong className="text-white">{fmtM(pvTV)}</strong> ({tvPct}%)</p>
        </div>
      </div>

      {view === "tree" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <ul className="space-y-1">
            {tree.map((node, i) => <TreeItem key={i} node={node} depth={0} />)}
          </ul>
          <p className="text-[11px] text-gray-400 mt-4 px-2">Click any row to expand. Blue = source/context. Amber = data source. Purple = sensitivity (+1pp impact on IVPS).</p>
        </div>
      )}

      {view === "audit" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">Assumption Audit — {scenario.charAt(0).toUpperCase() + scenario.slice(1)} Case</p>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm w-full border-collapse">
              <thead>
                <tr className="bg-gray-900 text-white text-xs">
                  <th className="text-left px-4 py-3 font-semibold uppercase tracking-wide">Assumption</th>
                  <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Model Value</th>
                  <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Benchmark / Historical</th>
                  <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Delta</th>
                  <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Sensitivity (±1pp)</th>
                  <th className="px-4 py-3 text-center font-semibold uppercase tracking-wide">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {auditRows.map((row, i) => (
                  <tr key={i} className={row.risk === "warn" ? "bg-amber-50" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.assumption}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-[#0f2744]">{row.value}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500 text-xs">{row.benchmark}</td>
                    <td className={`px-4 py-3 text-right font-mono text-xs ${row.delta.startsWith("+") ? "text-green-700" : row.delta.startsWith("-") ? "text-red-700" : "text-gray-400"}`}>{row.delta}</td>
                    <td className="px-4 py-3 text-right text-xs text-purple-700 font-mono">{row.sensitivity}</td>
                    <td className="px-4 py-3 text-center">
                      {row.risk === "warn"
                        ? <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">Review</span>
                        : <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400 px-4 py-3 border-t border-gray-100">Sensitivity shows IVPS impact of a +1 percentage point change in each assumption. Delta = Model vs Historical benchmark.</p>
        </div>
      )}
    </div>
  );
}
