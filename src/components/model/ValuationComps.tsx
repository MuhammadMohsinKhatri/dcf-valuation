"use client";
import { useMemo, useEffect, useState } from "react";
import type { DCFModel } from "@/types/model";
import type { PeerMetrics } from "@/app/api/peers/route";
import { ScenarioDiff } from "./ScenarioDiff";

function calcIVPS(model: DCFModel, scenario: "bear" | "base" | "bull"): number {
  const a = model.assumptions;
  const hist = model.historicalPeriods;
  if (!hist.length) return 0;
  const growthKey = `revenueGrowth${scenario.charAt(0).toUpperCase() + scenario.slice(1)}` as keyof typeof a;
  const ebitMargin = scenario === "bear" ? a.ebitMarginBear : scenario === "bull" ? a.ebitMarginBull : a.ebitMarginBase;
  const wacc = scenario === "bear" ? a.waccBear : scenario === "bull" ? a.waccBull : a.waccBase;
  const growthRates = a[growthKey] as number[];
  let rev = hist[0].revenue / 1e6;
  const fcfs: number[] = [];
  const pvFcfs: number[] = [];
  for (let yr = 1; yr <= a.projectionYears; yr++) {
    rev *= (1 + growthRates[yr - 1]);
    const ebit = rev * ebitMargin;
    const nopat = ebit * (1 - a.taxRate);
    const fcf = nopat + rev * a.depreciationPct - rev * a.capexPct;
    fcfs.push(fcf);
    pvFcfs.push(fcf / Math.pow(1 + wacc, yr - 0.5));
  }
  if (wacc <= a.terminalGrowthRate) return 0;
  const tv = (fcfs[a.projectionYears - 1] * (1 + a.terminalGrowthRate)) / (wacc - a.terminalGrowthRate);
  const pvTV = tv / Math.pow(1 + wacc, a.projectionYears);
  const ev = pvFcfs.reduce((s, v) => s + v, 0) + pvTV;
  return (ev - a.netDebt - a.minorityInterest) / a.sharesOutstanding;
}

function MultCell({ v }: { v: number | null }) {
  if (v === null || !isFinite(v) || v <= 0) return <td className="px-3 py-2 text-right font-mono text-gray-400">—</td>;
  return <td className="px-3 py-2 text-right font-mono text-gray-800">{v.toFixed(1)}x</td>;
}

export function ValuationComps({ model }: { model: DCFModel }) {
  const a = model.assumptions;
  const hist = model.historicalPeriods;
  const latest = hist[0];

  const [peers, setPeers] = useState<PeerMetrics[]>([]);
  const [peersLoading, setPeersLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/peers?ticker=${encodeURIComponent(model.ticker)}`)
      .then((r) => r.json())
      .then((d) => setPeers(d.peers ?? []))
      .catch(() => {})
      .finally(() => setPeersLoading(false));
  }, [model.ticker]);

  const { bearIVPS, baseIVPS, bullIVPS } = useMemo(() => ({
    bearIVPS: calcIVPS(model, "bear"),
    baseIVPS: calcIVPS(model, "base"),
    bullIVPS: calcIVPS(model, "bull"),
  }), [model]);

  const shares = a.sharesOutstanding;
  const currentPrice = model.currentPrice ?? 0;

  const bearEV = bearIVPS * shares + a.netDebt + a.minorityInterest;
  const baseEV = baseIVPS * shares + a.netDebt + a.minorityInterest;
  const bullEV = bullIVPS * shares + a.netDebt + a.minorityInterest;

  const latestRev = latest.revenue / 1e6;
  const latestEBITDA = (latest.ebit + latest.depreciationAmortization) / 1e6;
  const latestNI = latest.netIncome / 1e6;
  const latestFCF = (latest.freeCashFlow ?? 0) / 1e6;

  const safe = (n: number, d: number) => (d !== 0 ? n / d : 0);
  const fmt = (v: number, decimals = 2) =>
    v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
  const fmtMult = (v: number) => `${fmt(v, 1)}x`;

  const multiples = [
    { label: "EV / Revenue (LTM)", bear: fmtMult(safe(bearEV, latestRev)), base: fmtMult(safe(baseEV, latestRev)), bull: fmtMult(safe(bullEV, latestRev)) },
    { label: "EV / EBITDA (LTM)", bear: fmtMult(safe(bearEV, latestEBITDA)), base: fmtMult(safe(baseEV, latestEBITDA)), bull: fmtMult(safe(bullEV, latestEBITDA)) },
    { label: "P / E (LTM)", bear: fmtMult(safe(bearIVPS, safe(latestNI, shares))), base: fmtMult(safe(baseIVPS, safe(latestNI, shares))), bull: fmtMult(safe(bullIVPS, safe(latestNI, shares))) },
    { label: "P / FCF (LTM)", bear: fmtMult(safe(bearIVPS, safe(latestFCF, shares))), base: fmtMult(safe(baseIVPS, safe(latestFCF, shares))), bull: fmtMult(safe(bullIVPS, safe(latestFCF, shares))) },
  ];

  const minVal = Math.min(bearIVPS, currentPrice > 0 ? currentPrice : bearIVPS) * 0.85;
  const maxVal = Math.max(bullIVPS, currentPrice > 0 ? currentPrice : bullIVPS) * 1.15;
  const range = maxVal - minVal;

  function barLeft(v: number) { return `${(((v - minVal) / range) * 100).toFixed(1)}%`; }
  function barWidth(lo: number, hi: number) { return `${(((hi - lo) / range) * 100).toFixed(1)}%`; }

  const tickCount = 6;
  const ticks = Array.from({ length: tickCount }, (_, i) => minVal + (range * i) / (tickCount - 1));

  // Peer median helper
  function peerMedian(key: keyof PeerMetrics): number | null {
    const vals = peers.map((p) => p[key]).filter((v): v is number => typeof v === "number" && v > 0 && isFinite(v));
    if (!vals.length) return null;
    vals.sort((a, b) => a - b);
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
  }

  return (
    <div className="space-y-10">
      {/* ── DCF Valuation Summary ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-blue-700 rounded" />
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">DCF Valuation Summary</h2>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="text-left px-4 py-3 w-64 font-semibold">Metric</th>
                <th className="px-4 py-3 text-right font-semibold text-red-300">Bear</th>
                <th className="px-4 py-3 text-right font-semibold text-blue-300">Base</th>
                <th className="px-4 py-3 text-right font-semibold text-green-300">Bull</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium text-gray-700">Intrinsic Value / Share ($)</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-red-700">${fmt(bearIVPS)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-blue-700 bg-blue-50">${fmt(baseIVPS)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-green-700">${fmt(bullIVPS)}</td>
              </tr>
              {currentPrice > 0 && (
                <>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <td className="px-4 py-2.5 font-medium text-gray-700">Current Market Price ($)</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-600">${fmt(currentPrice)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-600 bg-blue-50">${fmt(currentPrice)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-600">${fmt(currentPrice)}</td>
                  </tr>
                  <tr className="bg-white border-b border-gray-100">
                    <td className="px-4 py-2.5 font-medium text-gray-700">Upside / (Downside)</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold ${bearIVPS >= currentPrice ? "text-green-700" : "text-red-700"}`}>
                      {fmtPct((bearIVPS - currentPrice) / currentPrice)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold bg-blue-50 ${baseIVPS >= currentPrice ? "text-green-700" : "text-red-700"}`}>
                      {fmtPct((baseIVPS - currentPrice) / currentPrice)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold ${bullIVPS >= currentPrice ? "text-green-700" : "text-red-700"}`}>
                      {fmtPct((bullIVPS - currentPrice) / currentPrice)}
                    </td>
                  </tr>
                </>
              )}
              <tr className="bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-700">Enterprise Value ($M)</td>
                <td className="px-4 py-2.5 text-right font-mono text-red-700">{bearEV.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                <td className="px-4 py-2.5 text-right font-mono text-blue-700 bg-blue-50">{baseEV.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                <td className="px-4 py-2.5 text-right font-mono text-green-700">{bullEV.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Implied Trading Multiples ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-orange-500 rounded" />
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">
            Implied Trading Multiples{" "}
            <span className="text-gray-400 font-normal normal-case text-sm">(Trailing, LTM)</span>
          </h2>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="text-left px-4 py-3 w-64 font-semibold">Multiple</th>
                <th className="px-4 py-3 text-right font-semibold text-red-300">Bear</th>
                <th className="px-4 py-3 text-right font-semibold text-blue-300">Base</th>
                <th className="px-4 py-3 text-right font-semibold text-green-300">Bull</th>
              </tr>
            </thead>
            <tbody>
              {multiples.map(({ label, bear, base, bull }, i) => (
                <tr key={label} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-4 py-2.5 font-medium text-gray-700">{label}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-red-700">{bear}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-blue-700 bg-blue-50">{base}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-green-700">{bull}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Peer Comparison ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-purple-600 rounded" />
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">
            Public Comps — Peer Trading Multiples
            <span className="ml-2 text-gray-400 font-normal normal-case text-sm">(TTM, sourced from FMP)</span>
          </h2>
        </div>
        {peersLoading ? (
          <div className="text-sm text-gray-400 py-6 text-center">Loading peer data…</div>
        ) : peers.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center rounded-xl border border-gray-200">
            No peer data available for {model.ticker}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="text-sm w-full border-collapse">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="text-left px-3 py-3 font-semibold">Company</th>
                  <th className="px-3 py-3 text-right font-semibold">Mkt Cap ($B)</th>
                  <th className="px-3 py-3 text-right font-semibold">EV/Rev</th>
                  <th className="px-3 py-3 text-right font-semibold">EV/EBITDA</th>
                  <th className="px-3 py-3 text-right font-semibold">P/E</th>
                  <th className="px-3 py-3 text-right font-semibold">P/FCF</th>
                  <th className="px-3 py-3 text-right font-semibold">P/B</th>
                </tr>
              </thead>
              <tbody>
                {peers.map((p, i) => (
                  <tr key={p.symbol} className={i % 2 === 0 ? "bg-white border-b border-gray-100" : "bg-gray-50 border-b border-gray-100"}>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-gray-900">{p.symbol}</span>
                      <span className="ml-2 text-gray-400 text-xs truncate">{p.name}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-700">
                      {p.marketCap > 0 ? `$${p.marketCap.toFixed(1)}B` : "—"}
                    </td>
                    <MultCell v={p.evToRevenueTTM} />
                    <MultCell v={p.evToEbitdaTTM} />
                    <MultCell v={p.peRatioTTM} />
                    <MultCell v={p.pfcfRatioTTM} />
                    <MultCell v={p.priceToBookRatioTTM} />
                  </tr>
                ))}
                {/* Median row */}
                {peers.length > 1 && (() => {
                  const medEvRev = peerMedian("evToRevenueTTM");
                  const medEvEbitda = peerMedian("evToEbitdaTTM");
                  const medPe = peerMedian("peRatioTTM");
                  const medPfcf = peerMedian("pfcfRatioTTM");
                  const medPb = peerMedian("priceToBookRatioTTM");
                  return (
                    <tr className="bg-blue-50 border-t-2 border-blue-200">
                      <td className="px-3 py-2.5 font-bold text-blue-800 text-xs uppercase tracking-wide">Peer Median</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <MultCell v={medEvRev} />
                      <MultCell v={medEvEbitda} />
                      <MultCell v={medPe} />
                      <MultCell v={medPfcf} />
                      <MultCell v={medPb} />
                    </tr>
                  );
                })()}
                {/* Our implied base multiples */}
                <tr className="bg-navy-900 border-t-2 border-gray-700" style={{ background: "#0f2744" }}>
                  <td className="px-3 py-2.5 font-bold text-white text-xs uppercase tracking-wide">
                    {model.ticker} — Implied (Base)
                  </td>
                  <td className="px-3 py-2 text-right text-gray-300 font-mono text-xs">
                    ${(baseIVPS * shares / 1000).toFixed(1)}B
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-yellow-300 text-xs">{fmtMult(safe(baseEV, latestRev))}</td>
                  <td className="px-3 py-2 text-right font-mono text-yellow-300 text-xs">{fmtMult(safe(baseEV, latestEBITDA))}</td>
                  <td className="px-3 py-2 text-right font-mono text-yellow-300 text-xs">{fmtMult(safe(baseIVPS, safe(latestNI, shares)))}</td>
                  <td className="px-3 py-2 text-right font-mono text-yellow-300 text-xs">{fmtMult(safe(baseIVPS, safe(latestFCF, shares)))}</td>
                  <td className="px-3 py-2 text-right text-gray-400 text-xs">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Scenario Drivers ─────────────────────────────────────────────── */}
      <ScenarioDiff model={model} bearIVPS={bearIVPS} baseIVPS={baseIVPS} bullIVPS={bullIVPS} />

      {/* ── Football Field Chart ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-indigo-600 rounded" />
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">
            Valuation Football Field —{" "}
            <span className="text-indigo-700">{model.ticker}</span>
          </h2>
        </div>
        <div className="rounded-xl border border-gray-200 shadow-sm bg-white p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-12 text-xs font-semibold text-red-700 text-right shrink-0">Bear</span>
              <div className="flex-1 relative h-8 bg-gray-100 rounded overflow-hidden">
                <div className="absolute top-0 h-full bg-red-200 border border-red-400 rounded flex items-center justify-end pr-2"
                  style={{ left: barLeft(minVal), width: barWidth(minVal, bearIVPS) }}>
                  <span className="text-xs font-bold text-red-800">${fmt(bearIVPS)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-12 text-xs font-semibold text-blue-700 text-right shrink-0">Base</span>
              <div className="flex-1 relative h-8 bg-gray-100 rounded overflow-hidden">
                <div className="absolute top-0 h-full bg-blue-300 border border-blue-500 rounded flex items-center justify-end pr-2"
                  style={{ left: barLeft(minVal), width: barWidth(minVal, baseIVPS) }}>
                  <span className="text-xs font-bold text-blue-900">${fmt(baseIVPS)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-12 text-xs font-semibold text-green-700 text-right shrink-0">Bull</span>
              <div className="flex-1 relative h-8 bg-gray-100 rounded overflow-hidden">
                <div className="absolute top-0 h-full bg-green-200 border border-green-500 rounded flex items-center justify-end pr-2"
                  style={{ left: barLeft(minVal), width: barWidth(minVal, bullIVPS) }}>
                  <span className="text-xs font-bold text-green-900">${fmt(bullIVPS)}</span>
                </div>
              </div>
            </div>
            {currentPrice > 0 && currentPrice >= minVal && currentPrice <= maxVal && (
              <div className="flex items-center gap-3">
                <span className="w-12 text-xs font-semibold text-gray-500 text-right shrink-0">Price</span>
                <div className="flex-1 relative h-8">
                  <div className="absolute top-0 h-full w-0.5 bg-red-600 z-10" style={{ left: barLeft(currentPrice) }}>
                    <div className="absolute -top-5 -translate-x-1/2 text-xs font-bold text-red-700 whitespace-nowrap">
                      ${fmt(currentPrice)}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className="w-12 shrink-0" />
              <div className="flex-1 relative">
                <div className="flex justify-between text-xs text-gray-400 font-mono">
                  {ticks.map((t) => <span key={t}>${fmt(t, 0)}</span>)}
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Football field shows Bear / Base / Bull intrinsic value per share from DCF model.
            {currentPrice > 0 && " Red line = current market price."}
          </p>
        </div>
      </div>
    </div>
  );
}
