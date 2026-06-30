"use client";
import type { DCFModel } from "@/types/model";
import { projectThreeStatements, deriveDriversFromHistory } from "@/lib/projection";

// ─── SVG Line Chart ───────────────────────────────────────────────────────────

interface DataPoint {
  label: string;
  value: number;
  isProjected: boolean;
}

interface LineChartProps {
  title: string;
  subtitle: string;
  points: DataPoint[];
  formatY: (v: number) => string;
  color: string;
  projectedColor: string;
  areaColor: string;
}

function LineChart({ title, subtitle, points, formatY, color, projectedColor, areaColor }: LineChartProps) {
  const W = 560;
  const H = 220;
  const PAD = { top: 28, right: 20, bottom: 40, left: 60 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const pad = (maxV - minV) * 0.12 || Math.abs(maxV) * 0.1 || 1;
  const yMin = minV - pad;
  const yMax = maxV + pad;

  const xOf = (i: number) => PAD.left + (i / (points.length - 1)) * cw;
  const yOf = (v: number) => PAD.top + ch - ((v - yMin) / (yMax - yMin)) * ch;

  // Split into historical and projected segments
  const splitIdx = points.findIndex((p) => p.isProjected);
  const histPoints = splitIdx === -1 ? points : points.slice(0, splitIdx + 1);
  const projPoints = splitIdx === -1 ? [] : points.slice(splitIdx);

  const toPath = (pts: DataPoint[], startI: number) =>
    pts.map((p, j) => `${j === 0 ? "M" : "L"} ${xOf(startI + j)} ${yOf(p.value)}`).join(" ");

  const histPath = toPath(histPoints, 0);
  const projPath = projPoints.length > 1 ? toPath(projPoints, splitIdx) : "";

  // Area fill under historical line
  const areaPath = histPoints.length > 1
    ? `${histPath} L ${xOf(histPoints.length - 1)} ${yOf(yMin)} L ${xOf(0)} ${yOf(yMin)} Z`
    : "";

  // Y-axis ticks
  const ticks = 5;
  const yTicks = Array.from({ length: ticks }, (_, i) => yMin + (i / (ticks - 1)) * (yMax - yMin));

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-1">
        <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">{title}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
        <defs>
          <linearGradient id={`area-${title.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={areaColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={areaColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left} x2={PAD.left + cw}
              y1={yOf(v)} y2={yOf(v)}
              stroke="#f0f0f0" strokeWidth="1"
            />
            <text x={PAD.left - 6} y={yOf(v) + 4} textAnchor="end" fontSize="9" fill="#9ca3af">
              {formatY(v)}
            </text>
          </g>
        ))}

        {/* Projected region shade */}
        {splitIdx !== -1 && (
          <rect
            x={xOf(splitIdx)} y={PAD.top}
            width={cw - (xOf(splitIdx) - PAD.left)} height={ch}
            fill="#f8faff" opacity="0.7"
          />
        )}

        {/* Area fill */}
        {areaPath && (
          <path d={areaPath} fill={`url(#area-${title.replace(/\s/g, "")})`} />
        )}

        {/* Historical line */}
        <path d={histPath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Projected line — dashed */}
        {projPath && (
          <path d={projPath} fill="none" stroke={projectedColor} strokeWidth="2" strokeDasharray="5,3" strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* Data points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={xOf(i)} cy={yOf(p.value)} r="3.5"
              fill="white"
              stroke={p.isProjected ? projectedColor : color}
              strokeWidth="2"
            />
            {/* Value label on hover area — show on every other point to avoid clutter */}
            {(points.length <= 8 || i % 2 === 0) && (
              <text
                x={xOf(i)} y={yOf(p.value) - 8}
                textAnchor="middle" fontSize="8.5" fill={p.isProjected ? projectedColor : "#374151"}
                fontWeight={p.isProjected ? "400" : "600"}
              >
                {formatY(p.value)}
              </text>
            )}
          </g>
        ))}

        {/* X-axis labels */}
        {points.map((p, i) => (
          <text key={i} x={xOf(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#6b7280">
            {p.label}
          </text>
        ))}

        {/* Axis lines */}
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + ch} stroke="#e5e7eb" strokeWidth="1" />
        <line x1={PAD.left} x2={PAD.left + cw} y1={PAD.top + ch} y2={PAD.top + ch} stroke="#e5e7eb" strokeWidth="1" />

        {/* Legend */}
        <g transform={`translate(${PAD.left}, ${H - 2})`}>
          <line x1="0" x2="14" y1="-4" y2="-4" stroke={color} strokeWidth="2.5" />
          <text x="17" y="-1" fontSize="8.5" fill="#6b7280">Actual</text>
          <line x1="50" x2="64" y1="-4" y2="-4" stroke={projectedColor} strokeWidth="2" strokeDasharray="4,2" />
          <text x="67" y="-1" fontSize="8.5" fill="#6b7280">Projected</text>
        </g>
      </svg>
    </div>
  );
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

interface BarChartProps {
  title: string;
  subtitle: string;
  points: DataPoint[];
  formatY: (v: number) => string;
  color: string;
  projectedColor: string;
}

function BarChart({ title, subtitle, points, formatY, color, projectedColor }: BarChartProps) {
  const W = 560;
  const H = 220;
  const PAD = { top: 36, right: 20, bottom: 40, left: 60 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  if (points.length < 1) return null;

  const values = points.map((p) => p.value);
  const maxV = Math.max(...values, 0);
  const minV = Math.min(...values, 0);
  const yMax = maxV + (maxV - minV) * 0.15 || 1;
  const yMin = minV < 0 ? minV - (maxV - minV) * 0.1 : 0;

  const barW = (cw / points.length) * 0.6;
  const gap = cw / points.length;
  const xOf = (i: number) => PAD.left + gap * i + gap * 0.2;
  const yOf = (v: number) => PAD.top + ch - ((v - yMin) / (yMax - yMin)) * ch;
  const zero = yOf(0);

  const ticks = 5;
  const yTicks = Array.from({ length: ticks }, (_, i) => yMin + (i / (ticks - 1)) * (yMax - yMin));

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-1">
        <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">{title}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
        {/* Grid */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={PAD.left + cw} y1={yOf(v)} y2={yOf(v)} stroke="#f0f0f0" strokeWidth="1" />
            <text x={PAD.left - 6} y={yOf(v) + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{formatY(v)}</text>
          </g>
        ))}

        {/* Zero line */}
        {yMin < 0 && <line x1={PAD.left} x2={PAD.left + cw} y1={zero} y2={zero} stroke="#d1d5db" strokeWidth="1" />}

        {/* Bars */}
        {points.map((p, i) => {
          const barH = Math.abs(yOf(p.value) - zero);
          const barY = p.value >= 0 ? yOf(p.value) : zero;
          return (
            <g key={i}>
              <rect
                x={xOf(i)} y={barY}
                width={barW} height={barH}
                fill={p.isProjected ? projectedColor : color}
                opacity={p.isProjected ? 0.65 : 1}
                rx="2"
              />
              <text x={xOf(i) + barW / 2} y={barY - 5} textAnchor="middle" fontSize="8.5"
                fill={p.isProjected ? projectedColor : "#374151"} fontWeight={p.isProjected ? "400" : "600"}>
                {formatY(p.value)}
              </text>
              <text x={xOf(i) + barW / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="#6b7280">
                {p.label}
              </text>
            </g>
          );
        })}

        {/* Axis */}
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + ch} stroke="#e5e7eb" strokeWidth="1" />
        <line x1={PAD.left} x2={PAD.left + cw} y1={PAD.top + ch} y2={PAD.top + ch} stroke="#e5e7eb" strokeWidth="1" />

        {/* Legend */}
        <g transform={`translate(${PAD.left}, ${H - 2})`}>
          <rect x="0" y="-9" width="10" height="7" fill={color} rx="1" />
          <text x="13" y="-2" fontSize="8.5" fill="#6b7280">Actual</text>
          <rect x="46" y="-9" width="10" height="7" fill={projectedColor} opacity="0.65" rx="1" />
          <text x="59" y="-2" fontSize="8.5" fill="#6b7280">Projected</text>
        </g>
      </svg>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  model: DCFModel;
}

export function ChartsTab({ model }: Props) {
  const hist = [...model.historicalPeriods].reverse(); // oldest first
  const stored = model.assumptions;
  const derived = deriveDriversFromHistory(model.historicalPeriods);
  const a: typeof stored = {
    ...stored,
    arDays: stored.arDays ?? derived.arDays ?? 45,
    apDays: stored.apDays ?? derived.apDays ?? 35,
    inventoryDays: stored.inventoryDays ?? derived.inventoryDays ?? 30,
    openingDebt: stored.openingDebt ?? derived.openingDebt ?? 0,
    openingPPE: stored.openingPPE ?? derived.openingPPE ?? 0,
    openingCash: stored.openingCash ?? derived.openingCash ?? 0,
    openingAR: stored.openingAR ?? derived.openingAR ?? 0,
    openingInventory: stored.openingInventory ?? derived.openingInventory ?? 0,
    openingAP: stored.openingAP ?? derived.openingAP ?? 0,
    openingOtherAssets: stored.openingOtherAssets ?? derived.openingOtherAssets ?? 0,
    openingOtherLiabilities: stored.openingOtherLiabilities ?? derived.openingOtherLiabilities ?? 0,
    openingEquity: stored.openingEquity ?? derived.openingEquity ?? 0,
    interestRate: stored.interestRate ?? derived.interestRate ?? 0.05,
    debtRepaymentPct: stored.debtRepaymentPct ?? 0.05,
    newDebtPct: stored.newDebtPct ?? 0,
    dividendPctNI: stored.dividendPctNI ?? 0.15,
    buybackPctNI: stored.buybackPctNI ?? 0.10,
  };

  const scenario = model.activeScenario ?? "base";
  const proj = projectThreeStatements(a, model.historicalPeriods, scenario);

  // Base year (most recent historical)
  const baseYear = hist.length > 0 ? hist[hist.length - 1].year : new Date().getFullYear();

  // ── Revenue ($B) ──────────────────────────────────────────────────────────
  const revenuePoints: DataPoint[] = [
    ...hist.map((h) => ({ label: `FY${h.year}A`, value: h.revenue / 1e9, isProjected: false })),
    ...proj.map((p, i) => ({ label: `FY${baseYear + i + 1}E`, value: p.revenue / 1e3, isProjected: true })),
  ];

  // ── EBITDA Margin (%) ─────────────────────────────────────────────────────
  const ebitdaMarginPoints: DataPoint[] = [
    ...hist.map((h) => ({
      label: `FY${h.year}A`,
      value: h.revenue > 0 ? ((h.ebit + h.depreciationAmortization) / h.revenue) * 100 : 0,
      isProjected: false,
    })),
    ...proj.map((p, i) => ({
      label: `FY${baseYear + i + 1}E`,
      value: p.revenue > 0 ? (p.ebitda / p.revenue) * 100 : 0,
      isProjected: true,
    })),
  ];

  // ── FCF ($B) ──────────────────────────────────────────────────────────────
  const fcfPoints: DataPoint[] = [
    ...hist.map((h) => ({ label: `FY${h.year}A`, value: h.freeCashFlow / 1e9, isProjected: false })),
    ...proj.map((p, i) => ({ label: `FY${baseYear + i + 1}E`, value: p.leveredFCF / 1e3, isProjected: true })),
  ];

  // ── ROIC (%) ──────────────────────────────────────────────────────────────
  const roicPoints: DataPoint[] = [
    ...hist.map((h) => {
      const investedCapital = h.equity + h.longTermDebt + h.shortTermDebt - h.cash;
      const nopat = h.ebit * (1 - (a.taxRate ?? 0.21));
      const roic = investedCapital > 0 ? (nopat / investedCapital) * 100 : 0;
      return { label: `FY${h.year}A`, value: roic, isProjected: false };
    }),
    ...proj.map((p, i) => {
      const investedCapital = p.equity + p.closingDebt - p.closingCash;
      const nopat = p.ebit * (1 - (a.taxRate ?? 0.21));
      const roic = investedCapital > 0 ? (nopat / investedCapital) * 100 : 0;
      return { label: `FY${baseYear + i + 1}E`, value: roic, isProjected: true };
    }),
  ];

  // ── EPS ($) ───────────────────────────────────────────────────────────────
  const sh = a.sharesOutstanding > 0 ? a.sharesOutstanding : 1;
  const epsPoints: DataPoint[] = [
    ...hist.map((h) => ({ label: `FY${h.year}A`, value: h.netIncome / 1e6 / sh, isProjected: false })),
    ...proj.map((p, i) => ({ label: `FY${baseYear + i + 1}E`, value: p.eps, isProjected: true })),
  ];

  // ── EBIT Margin (%) ───────────────────────────────────────────────────────
  const ebitMarginPoints: DataPoint[] = [
    ...hist.map((h) => ({
      label: `FY${h.year}A`,
      value: h.revenue > 0 ? (h.ebit / h.revenue) * 100 : 0,
      isProjected: false,
    })),
    ...proj.map((p, i) => ({
      label: `FY${baseYear + i + 1}E`,
      value: p.revenue > 0 ? (p.ebit / p.revenue) * 100 : 0,
      isProjected: true,
    })),
  ];

  // ── CapEx ($B) ────────────────────────────────────────────────────────────
  const capexPoints: DataPoint[] = [
    ...hist.map((h) => ({ label: `FY${h.year}A`, value: Math.abs(h.capex) / 1e9, isProjected: false })),
    ...proj.map((p, i) => ({ label: `FY${baseYear + i + 1}E`, value: Math.abs(p.capex) / 1e3, isProjected: true })),
  ];

  const pct = (v: number) => `${v.toFixed(1)}%`;
  const bil = (v: number) => `$${v.toFixed(1)}B`;
  const dol = (v: number) => `$${v.toFixed(2)}`;

  const NAVY = "#0f2744";
  const PROJ_BLUE = "#3b82f6";
  const AREA_NAVY = "#0f2744";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 bg-[#0f2744] rounded" />
        <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">Financial Charts</h2>
        <span className="text-xs text-gray-400 font-normal normal-case capitalize">
          {scenario} scenario — solid = actual, dashed = projected
        </span>
      </div>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <LineChart
          title="Revenue"
          subtitle="$ Billions — historical actuals vs. projected"
          points={revenuePoints}
          formatY={bil}
          color={NAVY}
          projectedColor={PROJ_BLUE}
          areaColor={AREA_NAVY}
        />
        <BarChart
          title="EBITDA Margin"
          subtitle="% of Revenue — EBIT + D&A / Revenue"
          points={ebitdaMarginPoints}
          formatY={pct}
          color={NAVY}
          projectedColor={PROJ_BLUE}
        />
        <LineChart
          title="Free Cash Flow"
          subtitle="$ Billions — Levered FCF (after interest & debt service)"
          points={fcfPoints}
          formatY={bil}
          color="#065f46"
          projectedColor="#10b981"
          areaColor="#065f46"
        />
        <LineChart
          title="ROIC"
          subtitle="% — NOPAT / Invested Capital (Equity + Debt − Cash)"
          points={roicPoints}
          formatY={pct}
          color="#7c3aed"
          projectedColor="#a78bfa"
          areaColor="#7c3aed"
        />
        <BarChart
          title="EBIT Margin"
          subtitle="% of Revenue — Operating income margin"
          points={ebitMarginPoints}
          formatY={pct}
          color="#1e40af"
          projectedColor={PROJ_BLUE}
        />
        <LineChart
          title="Earnings Per Share (EPS)"
          subtitle="$ per diluted share"
          points={epsPoints}
          formatY={dol}
          color="#92400e"
          projectedColor="#f59e0b"
          areaColor="#92400e"
        />
      </div>
    </div>
  );
}
