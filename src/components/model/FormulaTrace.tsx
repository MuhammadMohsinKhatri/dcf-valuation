"use client";
import { useState } from "react";
import type { DCFModel } from "@/types/model";

interface TraceNode {
  label: string;
  value: string;
  formula?: string;
  meaning?: string;
  children?: TraceNode[];
}

function calcIVPS(model: DCFModel, scenario: "bear" | "base" | "bull"): { ivps: number; ev: number; pvFcfs: number[]; pvTV: number; fcfs: number[] } {
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
  return { ivps, ev, pvFcfs, pvTV, fcfs };
}

function fmt(v: number, isCurrency = true, decimals = 2) {
  if (isCurrency) return `$${v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtM(v: number) { return `$${(v).toFixed(1)}M`; }
function fmtPct(v: number) { return `${(v * 100).toFixed(1)}%`; }

function TraceTree({ nodes, depth = 0 }: { nodes: TraceNode[]; depth?: number }) {
  return (
    <ul className="space-y-1">
      {nodes.map((node, i) => (
        <TreeItem key={i} node={node} depth={depth} />
      ))}
    </ul>
  );
}

function TreeItem({ node, depth }: { node: TraceNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <li>
      <div
        className={`flex items-start gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer ${depth === 0 ? "bg-gray-100 font-bold" : ""}`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
        onClick={() => hasChildren && setOpen(!open)}
      >
        <span className="text-gray-300 text-xs mt-1 shrink-0 w-3">
          {hasChildren ? (open ? "▼" : "▶") : "·"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm ${depth === 0 ? "text-gray-900 font-bold" : "text-gray-700"}`}>{node.label}</span>
            <span className={`font-mono text-sm font-semibold ${depth === 0 ? "text-blue-700" : "text-gray-800"}`}>{node.value}</span>
          </div>
          {node.formula && (
            <p className="text-xs text-blue-600 font-mono mt-0.5">{node.formula}</p>
          )}
          {node.meaning && (
            <p className="text-xs text-gray-400 mt-0.5">{node.meaning}</p>
          )}
        </div>
      </div>
      {hasChildren && open && (
        <div className="border-l-2 border-gray-100 ml-6">
          <TraceTree nodes={node.children!} depth={depth + 1} />
        </div>
      )}
    </li>
  );
}

export function FormulaTrace({ model }: { model: DCFModel }) {
  const [scenario, setScenario] = useState<"bear" | "base" | "bull">("base");
  const a = model.assumptions;
  const hist = model.historicalPeriods;
  const latest = hist[0];
  const wacc = scenario === "bear" ? a.waccBear : scenario === "bull" ? a.waccBull : a.waccBase;
  const ebitMargin = scenario === "bear" ? a.ebitMarginBear : scenario === "bull" ? a.ebitMarginBull : a.ebitMarginBase;
  const growthRates = (a[`revenueGrowth${scenario.charAt(0).toUpperCase() + scenario.slice(1)}` as keyof typeof a] as number[]);

  const { ivps, ev, pvFcfs, pvTV, fcfs } = calcIVPS(model, scenario);
  const totalPvFcf = pvFcfs.reduce((s, v) => s + v, 0);

  // Build year-by-year FCF nodes
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
      formula: `FCF${yr} = NOPAT + D&A − CapEx`,
      children: [
        { label: "Revenue", value: fmtM(rev0), formula: `Rev${yr} = Rev${yr - 1} × (1 + ${fmtPct(growthRates[yr - 1])})` },
        { label: "EBIT", value: fmtM(ebit), formula: `EBIT = Revenue × ${fmtPct(ebitMargin)} (EBIT Margin)` },
        { label: "NOPAT", value: fmtM(nopat), formula: `NOPAT = EBIT × (1 − ${fmtPct(a.taxRate)}) (Tax Rate)` },
        { label: "D&A (add back)", value: fmtM(da), formula: `D&A = Revenue × ${fmtPct(a.depreciationPct)}` },
        { label: "CapEx (deduct)", value: fmtM(capex), formula: `CapEx = Revenue × ${fmtPct(a.capexPct)}` },
        { label: "PV of FCF", value: fmtM(pvFcfs[yr - 1]), formula: `PV = FCF ÷ (1 + ${fmtPct(wacc)})^${(yr - 0.5).toFixed(1)} = ÷${discount.toFixed(3)}` },
      ],
    });
  }

  const lastFcf = fcfs[a.projectionYears - 1];
  const tv = (lastFcf * (1 + a.terminalGrowthRate)) / (wacc - a.terminalGrowthRate);

  const tree: TraceNode[] = [
    {
      label: "Intrinsic Value Per Share (IVPS)",
      value: fmt(ivps),
      formula: `IVPS = (EV − Net Debt − Minority Interest) ÷ Shares Outstanding`,
      meaning: "The per-share value of the business based on discounted future free cash flows",
      children: [
        {
          label: "Enterprise Value (EV)",
          value: fmtM(ev),
          formula: `EV = Σ PV(FCF₁..₅) + PV(Terminal Value)`,
          meaning: "Total intrinsic value of the business before capital structure adjustment",
          children: [
            {
              label: `Σ PV of Free Cash Flows (Yr 1–${a.projectionYears})`,
              value: fmtM(totalPvFcf),
              formula: `Sum of ${a.projectionYears} discounted annual FCFs`,
              children: yearNodes,
            },
            {
              label: "PV of Terminal Value",
              value: fmtM(pvTV),
              formula: `PV(TV) = TV ÷ (1 + WACC)^${a.projectionYears}`,
              meaning: "Present value of all cash flows beyond the projection period",
              children: [
                {
                  label: "Terminal Value (Gordon Growth)",
                  value: fmtM(tv),
                  formula: `TV = FCF₅ × (1 + ${fmtPct(a.terminalGrowthRate)}) ÷ (WACC − TGR)`,
                  meaning: "Perpetuity value assuming constant long-term growth",
                  children: [
                    { label: `FCF in Final Year (Yr ${a.projectionYears})`, value: fmtM(lastFcf), formula: "See FCF tree above" },
                    { label: "Terminal Growth Rate", value: fmtPct(a.terminalGrowthRate), meaning: "Long-run nominal GDP growth proxy" },
                    { label: "WACC", value: fmtPct(wacc), meaning: "Weighted Average Cost of Capital — discount rate" },
                  ],
                },
              ],
            },
          ],
        },
        { label: "Less: Net Debt", value: fmtM(a.netDebt), meaning: "Total debt minus cash and equivalents ($M)" },
        { label: "Less: Minority Interest", value: fmtM(a.minorityInterest), meaning: "Non-controlling interests in subsidiaries ($M)" },
        { label: "Shares Outstanding", value: `${a.sharesOutstanding.toFixed(1)}M`, meaning: "Diluted shares used for per-share calculation" },
      ],
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-teal-600 rounded" />
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">Formula Trace</h2>
          <span className="text-xs text-gray-400">Click any node to expand/collapse</span>
        </div>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
          {(["bear", "base", "bull"] as const).map((s) => (
            <button key={s} onClick={() => setScenario(s)}
              className={`px-3 py-1.5 font-semibold transition-colors ${
                scenario === s
                  ? s === "bear" ? "bg-red-700 text-white" : s === "bull" ? "bg-green-700 text-white" : "bg-blue-700 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="mb-3 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-between">
          <span className="text-sm text-blue-700 font-medium">
            {scenario.charAt(0).toUpperCase() + scenario.slice(1)} Case — IVPS
          </span>
          <span className="font-mono font-bold text-blue-900 text-lg">{fmt(ivps)}</span>
        </div>
        <TraceTree nodes={tree} depth={0} />
      </div>

      <p className="text-xs text-gray-400 px-1">
        Trace shows how every input flows through to the final intrinsic value. Click nodes to drill into the calculation.
        All values in $M unless shown per share.
      </p>
    </div>
  );
}
