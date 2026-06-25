"use client";
import { useMemo } from "react";
import { fmt, fmtPct } from "@/lib/utils";
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
    | "revenueGrowthBear"
    | "revenueGrowthBase"
    | "revenueGrowthBull";
  const ebitMargin = scenario === "bear" ? a.ebitMarginBear : scenario === "bull" ? a.ebitMarginBull : a.ebitMarginBase;
  const wacc = scenario === "bear" ? a.waccBear : scenario === "bull" ? a.waccBull : a.waccBase;
  const growthRates = a[growthKey];

  let rev = hist[0].revenue / 1e6;
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

  return {
    fcfs,
    pvFcfs,
    sumPVFcf,
    tv,
    pvTV,
    ev,
    equity,
    ivps,
    tvPct: (pvTV / ev) * 100,
  };
}

export function DCFOutput({ model, scenario }: Props) {
  const result = useMemo(() => computeDCF(model, scenario), [model, scenario]);

  if (!result) return <div className="text-gray-400 text-sm">Load a model to see DCF output.</div>;

  const scenarioBg = scenario === "bear" ? "bg-red-50 border-red-200" :
    scenario === "bull" ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200";
  const scenarioText = scenario === "bear" ? "text-red-700" :
    scenario === "bull" ? "text-green-700" : "text-yellow-700";

  return (
    <div className="space-y-4">
      {/* Hero metric */}
      <div className={`rounded-xl border-2 p-6 ${scenarioBg}`}>
        <p className="text-sm font-medium text-gray-600">Intrinsic Value / Share ({scenario.toUpperCase()})</p>
        <p className={`text-4xl font-bold mt-1 ${scenarioText}`}>
          ${fmt(result.ivps, 2)}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">EV / Share</p>
            <p className="font-semibold">${fmt(result.ev / model.assumptions.sharesOutstanding, 2)}</p>
          </div>
          <div>
            <p className="text-gray-500">Equity Value / Share</p>
            <p className="font-semibold">${fmt(result.equity / model.assumptions.sharesOutstanding, 2)}</p>
          </div>
          <div>
            <p className="text-gray-500">TV % of EV</p>
            <p className="font-semibold">{fmt(result.tvPct, 1)}%</p>
          </div>
        </div>
      </div>

      {/* FCF waterfall */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Projected FCF / Share</h3>
        <div className="grid grid-cols-5 gap-2">
          {result.fcfs.map((fcf, i) => (
            <div key={i} className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">Yr {i + 1}</p>
              <p className="font-mono font-semibold text-sm">${fmt(fcf / model.assumptions.sharesOutstanding, 2)}</p>
              <p className="text-xs text-gray-400">PV: ${fmt(result.pvFcfs[i] / model.assumptions.sharesOutstanding, 2)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bridge */}
      <div className="bg-white border rounded-lg p-4 text-sm">
        <h3 className="font-semibold text-gray-700 mb-3">EV → Equity Bridge (Per Share)</h3>
        <div className="space-y-1.5">
          {[
            ["PV of FCFs / Share", result.sumPVFcf / model.assumptions.sharesOutstanding, false],
            ["PV of Terminal Value / Share", result.pvTV / model.assumptions.sharesOutstanding, false],
            ["= Enterprise Value / Share", result.ev / model.assumptions.sharesOutstanding, true],
            ["Less: Net Debt / Share", -model.assumptions.netDebt / model.assumptions.sharesOutstanding, false],
            ["Less: Minority Interest / Share", -model.assumptions.minorityInterest / model.assumptions.sharesOutstanding, false],
            ["= Equity Value / Share", result.equity / model.assumptions.sharesOutstanding, true],
          ].map(([label, val, bold]) => (
            <div key={label as string} className={`flex justify-between ${bold ? "font-semibold border-t pt-1.5" : "text-gray-600"}`}>
              <span>{label as string}</span>
              <span className="font-mono">${fmt(val as number, 2)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">Shares Outstanding: {fmt(model.assumptions.sharesOutstanding, 1)}M</p>
      </div>
    </div>
  );
}
