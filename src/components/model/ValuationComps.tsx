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

function peerMedian(peers: PeerMetrics[], key: keyof PeerMetrics): number | null {
  const vals = peers.map((p) => p[key]).filter((v): v is number => typeof v === "number" && v > 0 && isFinite(v));
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
}

function peerPercentile(peers: PeerMetrics[], key: keyof PeerMetrics, value: number): number | null {
  const vals = peers.map((p) => p[key]).filter((v): v is number => typeof v === "number" && v > 0 && isFinite(v));
  if (!vals.length || value <= 0) return null;
  vals.sort((a, b) => a - b);
  const below = vals.filter((v) => v < value).length;
  return Math.round((below / vals.length) * 100);
}

function peerRank(peers: PeerMetrics[], key: keyof PeerMetrics, value: number): { rank: number; total: number } | null {
  const vals = peers.map((p) => p[key]).filter((v): v is number => typeof v === "number" && v > 0 && isFinite(v));
  if (!vals.length || value <= 0) return null;
  const allVals = [...vals, value].sort((a, b) => a - b);
  const rank = allVals.indexOf(value) + 1;
  return { rank, total: allVals.length };
}

function MultCell({ v }: { v: number | null }) {
  if (v === null || !isFinite(v) || v <= 0) return <td className="px-3 py-2 text-right font-mono text-gray-400">—</td>;
  return <td className="px-3 py-2 text-right font-mono text-gray-800">{v.toFixed(1)}x</td>;
}

function PremDiscBadge({ implied, median }: { implied: number; median: number | null }) {
  if (!median || implied <= 0 || median <= 0) return <td className="px-3 py-2 text-right text-gray-400 text-xs">—</td>;
  const pct = ((implied - median) / median) * 100;
  const label = pct >= 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`;
  return (
    <td className="px-3 py-2 text-right">
      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${pct > 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
        {label}
      </span>
    </td>
  );
}

function PctlBadge({ pctl }: { pctl: number | null }) {
  if (pctl === null) return <td className="px-3 py-2 text-right text-gray-400 text-xs">—</td>;
  const color = pctl >= 75 ? "text-red-700 bg-red-50" : pctl <= 25 ? "text-green-700 bg-green-50" : "text-amber-700 bg-amber-50";
  return (
    <td className="px-3 py-2 text-right">
      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${color}`}>{pctl}th pctile</span>
    </td>
  );
}

function RankBadge({ rank, total }: { rank: number; total: number }) {
  const pct = rank / total;
  const color = pct <= 0.33 ? "text-green-700 bg-green-50" : pct >= 0.66 ? "text-red-700 bg-red-50" : "text-amber-700 bg-amber-50";
  return <span className={`text-[10px] font-bold px-1 py-0.5 rounded ml-1 ${color}`}>#{rank}/{total}</span>;
}

// SVG scatter chart: x = EV/EBITDA, y = P/E
function ScatterChart({ peers, subjectSymbol, subjectEvEbitda, subjectPE }: {
  peers: PeerMetrics[];
  subjectSymbol: string;
  subjectEvEbitda: number;
  subjectPE: number;
}) {
  const W = 520, H = 320, PAD = { t: 20, r: 30, b: 48, l: 52 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const validPeers = peers.filter((p): p is typeof p & { evToEbitdaTTM: number; peRatioTTM: number } =>
    p.evToEbitdaTTM != null && p.peRatioTTM != null &&
    p.evToEbitdaTTM > 0 && p.peRatioTTM > 0 &&
    isFinite(p.evToEbitdaTTM) && isFinite(p.peRatioTTM) &&
    p.evToEbitdaTTM < 100 && p.peRatioTTM < 200
  );
  const allX = [...validPeers.map(p => p.evToEbitdaTTM), ...(subjectEvEbitda > 0 && subjectEvEbitda < 100 ? [subjectEvEbitda] : [])];
  const allY = [...validPeers.map(p => p.peRatioTTM), ...(subjectPE > 0 && subjectPE < 200 ? [subjectPE] : [])];
  if (!allX.length || !allY.length) return null;

  const xMin = Math.max(0, Math.min(...allX) * 0.8);
  const xMax = Math.max(...allX) * 1.2;
  const yMin = Math.max(0, Math.min(...allY) * 0.8);
  const yMax = Math.max(...allY) * 1.2;

  const sx = (v: number) => PAD.l + ((v - xMin) / (xMax - xMin)) * plotW;
  const sy = (v: number) => PAD.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const xTicks = 5;
  const yTicks = 5;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl">
      {/* Grid */}
      {Array.from({ length: yTicks }, (_, i) => {
        const v = yMin + ((yMax - yMin) * i) / (yTicks - 1);
        return <line key={i} x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} stroke="#e5e7eb" strokeWidth="1" />;
      })}
      {Array.from({ length: xTicks }, (_, i) => {
        const v = xMin + ((xMax - xMin) * i) / (xTicks - 1);
        return <line key={i} x1={sx(v)} x2={sx(v)} y1={PAD.t} y2={H - PAD.b} stroke="#e5e7eb" strokeWidth="1" />;
      })}

      {/* Axes */}
      <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="#6b7280" strokeWidth="1.5" />
      <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} stroke="#6b7280" strokeWidth="1.5" />

      {/* X tick labels */}
      {Array.from({ length: xTicks }, (_, i) => {
        const v = xMin + ((xMax - xMin) * i) / (xTicks - 1);
        return <text key={i} x={sx(v)} y={H - PAD.b + 14} textAnchor="middle" fontSize="10" fill="#9ca3af">{v.toFixed(1)}x</text>;
      })}
      {/* Y tick labels */}
      {Array.from({ length: yTicks }, (_, i) => {
        const v = yMin + ((yMax - yMin) * i) / (yTicks - 1);
        return <text key={i} x={PAD.l - 6} y={sy(v) + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{v.toFixed(0)}x</text>;
      })}

      {/* Axis labels */}
      <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="#6b7280" fontWeight="600">EV / EBITDA (TTM)</text>
      <text x={14} y={PAD.t + plotH / 2} textAnchor="middle" fontSize="11" fill="#6b7280" fontWeight="600" transform={`rotate(-90, 14, ${PAD.t + plotH / 2})`}>P / E (TTM)</text>

      {/* Peer dots */}
      {validPeers.map((p, i) => (
        <g key={i}>
          <circle cx={sx(p.evToEbitdaTTM)} cy={sy(p.peRatioTTM)} r="5" fill="#94a3b8" fillOpacity="0.8" stroke="#64748b" strokeWidth="0.5" />
          <text x={sx(p.evToEbitdaTTM) + 7} y={sy(p.peRatioTTM) + 4} fontSize="9" fill="#64748b">{p.symbol}</text>
        </g>
      ))}

      {/* Subject company dot */}
      {subjectEvEbitda > 0 && subjectEvEbitda < 100 && subjectPE > 0 && subjectPE < 200 && (
        <g>
          <circle cx={sx(subjectEvEbitda)} cy={sy(subjectPE)} r="8" fill="#0f2744" stroke="#1a3a5c" strokeWidth="1.5" />
          <text x={sx(subjectEvEbitda)} y={sy(subjectPE) - 12} textAnchor="middle" fontSize="10" fill="#0f2744" fontWeight="700">{subjectSymbol}</text>
        </g>
      )}
    </svg>
  );
}

export function ValuationComps({ model }: { model: DCFModel }) {
  const a = model.assumptions;
  const hist = model.historicalPeriods;
  const latest = hist[0];

  const [peers, setPeers] = useState<PeerMetrics[]>([]);
  const [peersLoading, setPeersLoading] = useState(true);
  const [sortKey, setSortKey] = useState<keyof PeerMetrics>("evToEbitdaTTM");
  const [sortAsc, setSortAsc] = useState(true);

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
  const fmtMult = (v: number) => (v > 0 && isFinite(v) ? `${fmt(v, 1)}x` : "—");

  const impliedEvRev = safe(baseEV, latestRev);
  const impliedEvEbitda = safe(baseEV, latestEBITDA);
  const impliedPE = safe(baseIVPS, safe(latestNI, shares));
  const impliedPFCF = safe(baseIVPS, safe(latestFCF, shares));

  const multiples = [
    { label: "EV / Revenue (LTM)", bear: fmtMult(safe(bearEV, latestRev)), base: fmtMult(impliedEvRev), bull: fmtMult(safe(bullEV, latestRev)) },
    { label: "EV / EBITDA (LTM)", bear: fmtMult(safe(bearEV, latestEBITDA)), base: fmtMult(impliedEvEbitda), bull: fmtMult(safe(bullEV, latestEBITDA)) },
    { label: "P / E (LTM)", bear: fmtMult(safe(bearIVPS, safe(latestNI, shares))), base: fmtMult(impliedPE), bull: fmtMult(safe(bullIVPS, safe(latestNI, shares))) },
    { label: "P / FCF (LTM)", bear: fmtMult(safe(bearIVPS, safe(latestFCF, shares))), base: fmtMult(impliedPFCF), bull: fmtMult(safe(bullIVPS, safe(latestFCF, shares))) },
  ];

  const minVal = Math.min(bearIVPS, currentPrice > 0 ? currentPrice : bearIVPS) * 0.85;
  const maxVal = Math.max(bullIVPS, currentPrice > 0 ? currentPrice : bullIVPS) * 1.15;
  const range = maxVal - minVal;
  const barLeft = (v: number) => `${(((v - minVal) / range) * 100).toFixed(1)}%`;
  const barWidth = (lo: number, hi: number) => `${(((hi - lo) / range) * 100).toFixed(1)}%`;
  const tickCount = 6;
  const ticks = Array.from({ length: tickCount }, (_, i) => minVal + (range * i) / (tickCount - 1));

  // Sort peers
  const sortedPeers = useMemo(() => {
    return [...peers].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      const an = typeof av === "number" && av > 0 && isFinite(av);
      const bn = typeof bv === "number" && bv > 0 && isFinite(bv);
      if (!an && !bn) return 0;
      if (!an) return 1;
      if (!bn) return -1;
      return sortAsc ? av - bv : bv - av;
    });
  }, [peers, sortKey, sortAsc]);

  function toggleSort(k: keyof PeerMetrics) {
    if (sortKey === k) setSortAsc(!sortAsc);
    else { setSortKey(k); setSortAsc(true); }
  }

  function SortTh({ label, k }: { label: string; k: keyof PeerMetrics }) {
    const active = sortKey === k;
    return (
      <th className={`px-3 py-3 text-right font-semibold cursor-pointer select-none hover:text-blue-300 transition-colors ${active ? "text-yellow-300" : ""}`}
        onClick={() => toggleSort(k)}>
        {label} {active ? (sortAsc ? "↑" : "↓") : ""}
      </th>
    );
  }

  // Peer medians
  const medEvRev = peerMedian(peers, "evToRevenueTTM");
  const medEvEbitda = peerMedian(peers, "evToEbitdaTTM");
  const medPe = peerMedian(peers, "peRatioTTM");
  const medPfcf = peerMedian(peers, "pfcfRatioTTM");
  const medPb = peerMedian(peers, "priceToBookRatioTTM");

  // Percentiles for our implied multiples vs peers
  const pctlEvRev = peerPercentile(peers, "evToRevenueTTM", impliedEvRev);
  const pctlEvEbitda = peerPercentile(peers, "evToEbitdaTTM", impliedEvEbitda);
  const pctlPE = peerPercentile(peers, "peRatioTTM", impliedPE);
  const pctlPFCF = peerPercentile(peers, "pfcfRatioTTM", impliedPFCF);

  return (
    <div className="space-y-10">
      {/* DCF Valuation Summary */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-blue-700 rounded" />
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">DCF Valuation Summary</h2>
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

      {/* Implied Trading Multiples */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-orange-500 rounded" />
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">
            Implied Trading Multiples{" "}
            <span className="text-gray-400 font-normal normal-case text-xs">(Trailing, LTM)</span>
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
                {peers.length > 0 && <th className="px-4 py-3 text-right font-semibold text-purple-300">vs. Median</th>}
                {peers.length > 0 && <th className="px-4 py-3 text-right font-semibold text-amber-300">Percentile</th>}
              </tr>
            </thead>
            <tbody>
              {multiples.map(({ label, bear, base, bull }, i) => {
                const impliedVals = [impliedEvRev, impliedEvEbitda, impliedPE, impliedPFCF];
                const medVals = [medEvRev, medEvEbitda, medPe, medPfcf];
                const pctls = [pctlEvRev, pctlEvEbitda, pctlPE, pctlPFCF];
                return (
                  <tr key={label} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2.5 font-medium text-gray-700">{label}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-red-700">{bear}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-blue-700 bg-blue-50">{base}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-green-700">{bull}</td>
                    {peers.length > 0 && <PremDiscBadge implied={impliedVals[i]} median={medVals[i]} />}
                    {peers.length > 0 && <PctlBadge pctl={pctls[i]} />}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {peers.length > 0 && (
          <p className="text-[11px] text-gray-400 mt-1.5 px-1">
            vs. Median = premium (+) or discount (−) of implied Base multiple vs. peer median. Percentile = where Base implied multiple ranks vs. peer set (higher = more expensive).
          </p>
        )}
      </div>

      {/* Peer Comparison */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-purple-600 rounded" />
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">
            Public Comps — Peer Trading Multiples
            <span className="ml-2 text-gray-400 font-normal normal-case text-xs">(TTM, sourced from FMP)</span>
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
                <tr className="bg-gray-900 text-white text-xs">
                  <th className="text-left px-3 py-3 font-semibold">Company</th>
                  <th className="px-3 py-3 text-right font-semibold">Mkt Cap ($B)</th>
                  <SortTh label="EV/Rev" k="evToRevenueTTM" />
                  <SortTh label="EV/EBITDA" k="evToEbitdaTTM" />
                  <SortTh label="P/E" k="peRatioTTM" />
                  <SortTh label="P/FCF" k="pfcfRatioTTM" />
                  <SortTh label="P/B" k="priceToBookRatioTTM" />
                  <th className="px-3 py-3 text-center font-semibold">Rank (EV/EBITDA)</th>
                </tr>
              </thead>
              <tbody>
                {sortedPeers.map((p, i) => {
                  const rankInfo = peerRank(peers, "evToEbitdaTTM", p.evToEbitdaTTM ?? -1);
                  return (
                    <tr key={p.symbol} className={i % 2 === 0 ? "bg-white border-b border-gray-100" : "bg-gray-50 border-b border-gray-100"}>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-gray-900">{p.symbol}</span>
                        <span className="ml-2 text-gray-400 text-xs truncate max-w-[120px] inline-block align-middle">{p.name}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-700 text-xs">
                        {p.marketCap > 0 ? `$${p.marketCap.toFixed(1)}B` : "—"}
                      </td>
                      <MultCell v={p.evToRevenueTTM} />
                      <MultCell v={p.evToEbitdaTTM} />
                      <MultCell v={p.peRatioTTM} />
                      <MultCell v={p.pfcfRatioTTM} />
                      <MultCell v={p.priceToBookRatioTTM} />
                      <td className="px-3 py-2 text-center">
                        {rankInfo && <RankBadge rank={rankInfo.rank} total={rankInfo.total} />}
                      </td>
                    </tr>
                  );
                })}

                {/* Peer Median */}
                {peers.length > 1 && (
                  <tr className="bg-blue-50 border-t-2 border-blue-200">
                    <td className="px-3 py-2.5 font-bold text-blue-800 text-xs uppercase tracking-wide">Peer Median</td>
                    <td className="px-3 py-2 text-right">—</td>
                    <MultCell v={medEvRev} />
                    <MultCell v={medEvEbitda} />
                    <MultCell v={medPe} />
                    <MultCell v={medPfcf} />
                    <MultCell v={medPb} />
                    <td />
                  </tr>
                )}

                {/* Premium / Discount vs Median */}
                {peers.length > 1 && (
                  <tr className="bg-amber-50 border-t border-amber-200">
                    <td className="px-3 py-2.5 font-bold text-amber-800 text-xs uppercase tracking-wide">
                      {model.ticker} Implied vs. Median
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-400">Base Case</td>
                    <PremDiscBadge implied={impliedEvRev} median={medEvRev} />
                    <PremDiscBadge implied={impliedEvEbitda} median={medEvEbitda} />
                    <PremDiscBadge implied={impliedPE} median={medPe} />
                    <PremDiscBadge implied={impliedPFCF} median={medPfcf} />
                    <td />
                    <td />
                  </tr>
                )}

                {/* Subject implied multiples */}
                <tr className="border-t-2 border-gray-700" style={{ background: "#0f2744" }}>
                  <td className="px-3 py-2.5 font-bold text-white text-xs uppercase tracking-wide">
                    {model.ticker} — Implied (Base)
                  </td>
                  <td className="px-3 py-2 text-right text-gray-300 font-mono text-xs">
                    ${(baseIVPS * shares / 1000).toFixed(1)}B
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-yellow-300 text-xs">{fmtMult(impliedEvRev)}</td>
                  <td className="px-3 py-2 text-right font-mono text-yellow-300 text-xs">{fmtMult(impliedEvEbitda)}</td>
                  <td className="px-3 py-2 text-right font-mono text-yellow-300 text-xs">{fmtMult(impliedPE)}</td>
                  <td className="px-3 py-2 text-right font-mono text-yellow-300 text-xs">{fmtMult(impliedPFCF)}</td>
                  <td className="px-3 py-2 text-right text-gray-400 text-xs">—</td>
                  <td className="px-3 py-2 text-center">
                    {(() => {
                      const r = peerRank(peers, "evToEbitdaTTM", impliedEvEbitda);
                      return r ? <RankBadge rank={r.rank} total={r.total} /> : null;
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Scatter Chart */}
      {!peersLoading && peers.length > 1 && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-1 h-6 bg-teal-600 rounded" />
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">
              Multiple Scatter — EV/EBITDA vs P/E
              <span className="ml-2 text-gray-400 font-normal normal-case text-xs">(Base implied shown in navy)</span>
            </h2>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <ScatterChart
              peers={peers}
              subjectSymbol={model.ticker}
              subjectEvEbitda={impliedEvEbitda}
              subjectPE={impliedPE}
            />
            <p className="text-[11px] text-gray-400 mt-2">
              Each dot = public peer (TTM multiples from FMP). Navy dot = {model.ticker} implied Base Case. Outliers {">"} 100x EV/EBITDA or {">"} 200x P/E excluded.
            </p>
          </div>
        </div>
      )}

      {/* Scenario Drivers */}
      <ScenarioDiff model={model} bearIVPS={bearIVPS} baseIVPS={baseIVPS} bullIVPS={bullIVPS} />

      {/* Football Field */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1 h-6 bg-indigo-600 rounded" />
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">
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
