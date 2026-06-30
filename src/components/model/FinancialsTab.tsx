"use client";
import type { DCFModel } from "@/types/model";
import { SectionExplain } from "./SectionExplain";

const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const pct = (v: number) => `${v.toFixed(1)}%`;
const ps = (v: number, sh: number) => sh > 0 ? `$${(v / sh).toFixed(2)}` : "—";

function SectionHeader({
  title, subtitle, accentColor, ticker, companyName, sector, section, keyMetrics,
}: {
  title: string;
  subtitle?: string;
  accentColor: string;
  ticker: string;
  companyName: string;
  sector: string;
  section: "income_statement" | "balance_sheet" | "cash_flow" | "dcf" | "per_share";
  keyMetrics: Record<string, string | number>;
}) {
  return (
    <div className="mb-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-1 h-6 rounded ${accentColor}`}></div>
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">
            {title}
            {subtitle && <span className="text-gray-400 font-normal normal-case text-sm ml-2">{subtitle}</span>}
          </h2>
        </div>
        <SectionExplain
          ticker={ticker}
          companyName={companyName}
          sector={sector}
          section={section}
          keyMetrics={keyMetrics}
        />
      </div>
    </div>
  );
}

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="text-sm w-full border-collapse bg-white">
        {children}
      </table>
    </div>
  );
}

function isProj(c: unknown) { return typeof c === "object" && c !== null && "isProjected" in c && !!(c as { isProjected: boolean }).isProjected; }

function THead({ cols }: { cols: { year: number }[] }) {
  const firstProjIdx = cols.findIndex((c) => isProj(c));
  return (
    <thead>
      <tr className="border-b-2 border-gray-700">
        <th className="text-left px-4 py-2.5 w-64 font-semibold tracking-wide bg-gray-900 text-white text-xs uppercase">Line Item</th>
        {cols.map((c, i) => (
          <th
            key={c.year}
            className={`px-4 py-2.5 text-right font-semibold tracking-wide text-xs uppercase ${
              isProj(c)
                ? `bg-[#0f2744] text-blue-300${i === firstProjIdx ? " border-l-2 border-blue-500" : ""}`
                : "bg-gray-900 text-gray-400"
            }`}
          >
            FY{c.year}{isProj(c) ? "E" : "A"}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function FinancialsTab({ model }: { model: DCFModel }) {
  const a = model.assumptions;
  const hist = model.historicalPeriods;
  const sh = a.sharesOutstanding;
  const ticker = model.ticker;
  const companyName = model.companyName;
  const sector = model.sector ?? "";

  // Build projected periods (base case)
  const projected: {
    year: number; isProjected: boolean;
    revenue: number; grossProfit: number; ebit: number; ebitda: number;
    netIncome: number; da: number; capex: number; fcf: number; operatingCashFlow: number;
  }[] = [];

  let rev = hist[0].revenue / 1e6;
  for (let yr = 0; yr < a.projectionYears; yr++) {
    rev = rev * (1 + a.revenueGrowthBase[yr]);
    const ebit = rev * a.ebitMarginBase;
    const da = rev * a.depreciationPct;
    const capex = rev * a.capexPct;
    const ebitda = ebit + da;
    const nopat = ebit * (1 - a.taxRate);
    const fcf = nopat + da - capex;
    const grossProfit = rev * (hist[0].grossProfit / (hist[0].revenue / 1e6));
    projected.push({
      year: hist[0].year + yr + 1,
      isProjected: true,
      revenue: rev * 1e6,
      grossProfit: grossProfit * 1e6,
      ebitda: ebitda * 1e6,
      ebit: ebit * 1e6,
      da: da * 1e6,
      capex: capex * 1e6,
      netIncome: nopat * 1e6,
      fcf: fcf * 1e6,
      operatingCashFlow: (nopat + da) * 1e6,
    });
  }

  const allCols = [...[...hist].reverse(), ...projected];
  const latest = hist[0];
  const firstProjYear = projected[0]?.year;

  // DCF computation for section 4
  const fcfs: number[] = [];
  const pvFcfs: number[] = [];
  let dcfRev = hist[0].revenue / 1e6;
  for (let yr = 1; yr <= a.projectionYears; yr++) {
    dcfRev *= (1 + a.revenueGrowthBase[yr - 1]);
    const nopat = dcfRev * a.ebitMarginBase * (1 - a.taxRate);
    const fcf = nopat + dcfRev * a.depreciationPct - dcfRev * a.capexPct;
    fcfs.push(fcf);
    pvFcfs.push(fcf / Math.pow(1 + a.waccBase, yr - 0.5));
  }
  const sumPVFcf = pvFcfs.reduce((s, v) => s + v, 0);
  const tv = a.waccBase > a.terminalGrowthRate
    ? (fcfs[a.projectionYears - 1] * (1 + a.terminalGrowthRate)) / (a.waccBase - a.terminalGrowthRate)
    : 0;
  const pvTV = tv / Math.pow(1 + a.waccBase, a.projectionYears);
  const ev = sumPVFcf + pvTV;
  const equity = ev - a.netDebt - a.minorityInterest;
  const baseIVPS = sh > 0 ? equity / sh : 0;
  const currentPrice = model.currentPrice ?? 0;
  const upside = currentPrice > 0 ? ((baseIVPS - currentPrice) / currentPrice) * 100 : null;

  const projYears = projected.map((p) => p.year);

  // Returns extra className for the first projected column — adds a visible separator line
  function projBorder(year: number) {
    return year === firstProjYear ? "border-l-2 border-blue-400/40" : "";
  }

  return (
    <div className="space-y-12">

      {/* ── 1. INCOME STATEMENT ── */}
      <div>
        <SectionHeader
          title="Income Statement" subtitle="($M)"
          accentColor="bg-blue-600"
          ticker={ticker} companyName={companyName} sector={sector}
          section="income_statement"
          keyMetrics={{
            latestRevenue: `$${n(latest.revenue / 1e6)}M`,
            revenueGrowthBase: `${(a.revenueGrowthBase[0] * 100).toFixed(1)}% Yr1`,
            grossMargin: pct((latest.grossProfit / latest.revenue) * 100),
            ebitMargin: pct((latest.ebit / latest.revenue) * 100),
            netMargin: pct((latest.netIncome / latest.revenue) * 100),
          }}
        />
        <TableShell>
          <THead cols={allCols} />
          <tbody>
            <tr className="border-t-2 border-blue-200">
              <td className="px-4 py-2.5 font-bold text-gray-900 bg-blue-50">Revenue</td>
              {allCols.map((c) => (
                <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-bold ${projBorder(c.year)} ${isProj(c) ? "text-blue-700 bg-blue-50" : "text-gray-900 bg-white"}`}>
                  {n(c.revenue / 1e6)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-4 py-1 text-[11px] text-gray-400 pl-8 bg-gray-50">YoY Growth %</td>
              {allCols.map((c, i) => {
                const prev = allCols[i - 1];
                const g = prev ? ((c.revenue - prev.revenue) / prev.revenue) * 100 : null;
                return (
                  <td key={c.year} className={`px-4 py-1 text-right text-[11px] font-mono ${projBorder(c.year)} ${isProj(c) ? "text-blue-500 bg-blue-50/50" : "text-gray-400 bg-gray-50"}`}>
                    {g !== null ? `${g >= 0 ? "+" : ""}${g.toFixed(1)}%` : "—"}
                  </td>
                );
              })}
            </tr>
            <tr className="bg-white">
              <td className="px-4 py-2 text-gray-600 pl-8">Cost of Revenue (COGS)</td>
              {allCols.map((c) => (
                <td key={c.year} className={`px-4 py-2 text-right font-mono ${isProj(c) ? "text-blue-600" : "text-gray-600"}`}>
                  ({n((c.revenue - c.grossProfit) / 1e6)})
                </td>
              ))}
            </tr>
            <tr className="border-t-2 border-gray-200">
              <td className="px-4 py-2.5 font-bold text-gray-900 bg-gray-100 border-l-4 border-gray-400">Gross Profit</td>
              {allCols.map((c) => (
                <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-bold ${projBorder(c.year)} ${isProj(c) ? "text-blue-700 bg-blue-50" : "text-gray-800 bg-gray-100"}`}>
                  {n(c.grossProfit / 1e6)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-4 py-1 text-[11px] text-gray-400 pl-8 bg-gray-50">Gross Margin %</td>
              {allCols.map((c) => (
                <td key={c.year} className={`px-4 py-1 text-right text-[11px] font-mono ${projBorder(c.year)} ${isProj(c) ? "text-blue-400 bg-blue-50/30" : "text-gray-400 bg-gray-50"}`}>
                  {pct((c.grossProfit / c.revenue) * 100)}
                </td>
              ))}
            </tr>
            <tr className="bg-white border-t border-gray-200">
              <td className="px-4 py-2.5 font-semibold text-gray-800">EBITDA</td>
              {allCols.map((c) => {
                const ebitda = (c as { ebitda?: number; depreciationAmortization?: number }).ebitda
                  ?? (c.ebit + ((c as { depreciationAmortization?: number }).depreciationAmortization ?? 0));
                return (
                  <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-semibold ${isProj(c) ? "text-blue-700" : "text-gray-800"}`}>
                    {n(ebitda / 1e6)}
                  </td>
                );
              })}
            </tr>
            <tr className="bg-white">
              <td className="px-4 py-1.5 text-xs text-gray-500 pl-8">EBITDA Margin %</td>
              {allCols.map((c) => {
                const ebitda = (c as { ebitda?: number; depreciationAmortization?: number }).ebitda
                  ?? (c.ebit + ((c as { depreciationAmortization?: number }).depreciationAmortization ?? 0));
                return (
                  <td key={c.year} className="px-4 py-1.5 text-right text-xs font-mono text-gray-500">
                    {pct((ebitda / c.revenue) * 100)}
                  </td>
                );
              })}
            </tr>
            <tr className="border-t-2 border-gray-200">
              <td className="px-4 py-2.5 font-bold text-gray-900 bg-gray-100 border-l-4 border-gray-400">EBIT (Operating Income)</td>
              {allCols.map((c) => (
                <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-bold ${projBorder(c.year)} ${isProj(c) ? "text-blue-700 bg-blue-50" : "text-gray-800 bg-gray-100"}`}>
                  {n(c.ebit / 1e6)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-4 py-1 text-[11px] text-gray-400 pl-8 bg-gray-50">EBIT Margin %</td>
              {allCols.map((c) => (
                <td key={c.year} className={`px-4 py-1 text-right text-[11px] font-mono ${projBorder(c.year)} ${isProj(c) ? "text-blue-400 bg-blue-50/30" : "text-gray-400 bg-gray-50"}`}>
                  {pct((c.ebit / c.revenue) * 100)}
                </td>
              ))}
            </tr>
            <tr className="bg-white">
              <td className="px-4 py-2 text-gray-600 pl-8">Income Tax</td>
              {allCols.map((c) => {
                const tax = (c as { isProjected?: boolean }).isProjected
                  ? c.ebit * a.taxRate
                  : ((c as { taxExpense?: number }).taxExpense ?? 0);
                return (
                  <td key={c.year} className={`px-4 py-2 text-right font-mono ${(c as { isProjected?: boolean }).isProjected ? "text-blue-500" : "text-gray-600"}`}>
                    ({n(tax / 1e6)})
                  </td>
                );
              })}
            </tr>
            <tr className="border-t-2 border-gray-700">
              <td className="px-4 py-2.5 font-bold text-white bg-[#0f2744] border-l-4 border-blue-400">Net Income</td>
              {allCols.map((c) => (
                <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-bold text-white ${projBorder(c.year)} ${isProj(c) ? "bg-[#1a3a5c]" : "bg-[#0f2744]"}`}>
                  {n(c.netIncome / 1e6)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-4 py-1 text-[11px] text-blue-300 pl-8 bg-[#1a3a5c]">Net Margin %</td>
              {allCols.map((c) => (
                <td key={c.year} className={`px-4 py-1 text-right text-[11px] font-mono text-blue-300 ${projBorder(c.year)} bg-[#1a3a5c]`}>
                  {pct((c.netIncome / c.revenue) * 100)}
                </td>
              ))}
            </tr>
            {sh > 0 && (
              <tr>
                <td className="px-4 py-1 text-[11px] text-blue-300 pl-8 bg-[#1a3a5c]">EPS ($)</td>
                {allCols.map((c) => (
                  <td key={c.year} className={`px-4 py-1 text-right text-[11px] font-mono text-blue-300 ${projBorder(c.year)} bg-[#1a3a5c]`}>
                    ${(c.netIncome / 1e6 / sh).toFixed(2)}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </TableShell>
        <p className="text-xs text-gray-400 mt-2">Blue columns = Base Case projections. Historical = actual reported figures.</p>
      </div>

      {/* ── 2. BALANCE SHEET ── */}
      <div>
        <SectionHeader
          title="Balance Sheet" subtitle="($M)"
          accentColor="bg-green-600"
          ticker={ticker} companyName={companyName} sector={sector}
          section="balance_sheet"
          keyMetrics={{
            cash: `$${n((latest.cash ?? 0) / 1e6)}M`,
            totalAssets: `$${n((latest.totalAssets ?? 0) / 1e6)}M`,
            totalLiabilities: `$${n((latest.totalLiabilities ?? 0) / 1e6)}M`,
            equity: `$${n((latest.equity ?? 0) / 1e6)}M`,
            netDebt: `$${n(a.netDebt)}M`,
          }}
        />
        <TableShell>
          <THead cols={allCols} />
          <tbody>
            <tr className="bg-green-900 text-white">
              <td className="px-4 py-2 font-bold tracking-wide text-xs uppercase">Assets</td>
              {allCols.map((c) => <td key={c.year} className="px-4 py-2"></td>)}
            </tr>
            {([
              { key: "cash", label: "Cash & Equivalents", indent: true, bold: false },
              { key: "accountsReceivable", label: "Accounts Receivable", indent: true, bold: false },
              { key: "inventory", label: "Inventory", indent: true, bold: false },
              { key: "totalCurrentAssets", label: "Total Current Assets", indent: false, bold: true },
              { key: "ppe", label: "PP&E (Net)", indent: true, bold: false },
              { key: "totalAssets", label: "Total Assets", indent: false, bold: true },
            ] as { key: keyof typeof latest; label: string; indent: boolean; bold: boolean }[]).map(({ key, label, indent, bold }, i) => (
              <tr key={key as string} className={bold ? "bg-green-50 border-t border-green-200" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className={`px-4 py-2.5 ${bold ? "font-bold text-gray-900" : "text-gray-600"} ${indent ? "pl-8" : ""}`}>{label}</td>
                {allCols.map((c) => (
                  <td key={c.year} className={`px-4 py-2.5 text-right font-mono ${bold ? "font-bold" : ""} ${(c as { isProjected?: boolean }).isProjected ? "text-blue-400" : bold ? "text-gray-900" : "text-gray-600"}`}>
                    {(c as { isProjected?: boolean }).isProjected ? "—" : n(((c as unknown as Record<string, number>)[key as string] ?? 0) / 1e6)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-red-900 text-white">
              <td className="px-4 py-2 font-bold tracking-wide text-xs uppercase">Liabilities</td>
              {allCols.map((c) => <td key={c.year} className="px-4 py-2"></td>)}
            </tr>
            {([
              { key: "accountsPayable", label: "Accounts Payable", indent: true, bold: false },
              { key: "shortTermDebt", label: "Short-Term Debt", indent: true, bold: false },
              { key: "totalCurrentLiabilities", label: "Total Current Liabilities", indent: false, bold: true },
              { key: "longTermDebt", label: "Long-Term Debt", indent: true, bold: false },
              { key: "totalLiabilities", label: "Total Liabilities", indent: false, bold: true },
            ] as { key: keyof typeof latest; label: string; indent: boolean; bold: boolean }[]).map(({ key, label, indent, bold }, i) => (
              <tr key={key as string} className={bold ? "bg-red-50 border-t border-red-200" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className={`px-4 py-2.5 ${bold ? "font-bold text-gray-900" : "text-gray-600"} ${indent ? "pl-8" : ""}`}>{label}</td>
                {allCols.map((c) => (
                  <td key={c.year} className={`px-4 py-2.5 text-right font-mono ${bold ? "font-bold" : ""} ${(c as { isProjected?: boolean }).isProjected ? "text-blue-400" : bold ? "text-gray-900" : "text-gray-600"}`}>
                    {(c as { isProjected?: boolean }).isProjected ? "—" : n(((c as unknown as Record<string, number>)[key as string] ?? 0) / 1e6)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-gray-900 text-white border-t-2 border-gray-700">
              <td className="px-4 py-2.5 font-bold">Total Shareholders&apos; Equity</td>
              {allCols.map((c) => (
                <td key={c.year} className="px-4 py-2.5 text-right font-mono font-bold">
                  {(c as { isProjected?: boolean }).isProjected ? "—" : n(((c as { equity?: number }).equity ?? 0) / 1e6)}
                </td>
              ))}
            </tr>
          </tbody>
        </TableShell>
        <p className="text-xs text-gray-400 mt-2">Balance sheet projections not modeled — historical actuals only.</p>
      </div>

      {/* ── 3. CASH FLOW STATEMENT ── */}
      <div>
        <SectionHeader
          title="Cash Flow Statement" subtitle="($M)"
          accentColor="bg-purple-600"
          ticker={ticker} companyName={companyName} sector={sector}
          section="cash_flow"
          keyMetrics={{
            latestFCF: `$${n((latest.freeCashFlow ?? 0) / 1e6)}M`,
            fcfMargin: pct(((latest.freeCashFlow ?? 0) / latest.revenue) * 100),
            capexPct: pct(a.capexPct * 100),
            daPct: pct(a.depreciationPct * 100),
            latestOCF: `$${n((latest.operatingCashFlow ?? 0) / 1e6)}M`,
          }}
        />
        <TableShell>
          <THead cols={allCols} />
          <tbody>
            <tr className="bg-purple-900 text-white">
              <td className="px-4 py-2 font-bold text-xs uppercase tracking-wide">Operating Activities</td>
              {allCols.map((c) => <td key={c.year} className="px-4 py-2"></td>)}
            </tr>
            <tr className="bg-white">
              <td className="px-4 py-2 text-gray-600 pl-8">Net Income</td>
              {allCols.map((c) => (
                <td key={c.year} className={`px-4 py-2 text-right font-mono ${(c as { isProjected?: boolean }).isProjected ? "text-blue-600" : "text-gray-600"}`}>
                  {n(c.netIncome / 1e6)}
                </td>
              ))}
            </tr>
            <tr className="bg-gray-50">
              <td className="px-4 py-2 text-gray-600 pl-8">Depreciation & Amortization</td>
              {allCols.map((c) => {
                const da = (c as { da?: number; depreciationAmortization?: number }).da
                  ?? (c as { depreciationAmortization?: number }).depreciationAmortization ?? 0;
                return (
                  <td key={c.year} className={`px-4 py-2 text-right font-mono ${(c as { isProjected?: boolean }).isProjected ? "text-blue-600" : "text-gray-600"}`}>
                    {n(da / 1e6)}
                  </td>
                );
              })}
            </tr>
            <tr className="bg-purple-50 border-t border-purple-200">
              <td className="px-4 py-2.5 font-bold text-gray-900">Cash from Operations</td>
              {allCols.map((c) => {
                const ocf = (c as { operatingCashFlow?: number }).operatingCashFlow ?? 0;
                return (
                  <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-bold ${(c as { isProjected?: boolean }).isProjected ? "text-blue-700" : "text-gray-900"}`}>
                    {n(ocf / 1e6)}
                  </td>
                );
              })}
            </tr>
            <tr className="bg-purple-50">
              <td className="px-4 py-1.5 text-xs text-purple-700 pl-8">OCF Margin %</td>
              {allCols.map((c) => {
                const ocf = (c as { operatingCashFlow?: number }).operatingCashFlow ?? 0;
                return (
                  <td key={c.year} className="px-4 py-1.5 text-right text-xs font-mono text-purple-600">
                    {pct((ocf / c.revenue) * 100)}
                  </td>
                );
              })}
            </tr>
            <tr className="bg-purple-900 text-white">
              <td className="px-4 py-2 font-bold text-xs uppercase tracking-wide">Investing Activities</td>
              {allCols.map((c) => <td key={c.year} className="px-4 py-2"></td>)}
            </tr>
            <tr className="bg-white">
              <td className="px-4 py-2 text-gray-600 pl-8">Capital Expenditures</td>
              {allCols.map((c) => {
                const capexVal = (c as { capex?: number }).capex ?? 0;
                return (
                  <td key={c.year} className={`px-4 py-2 text-right font-mono ${(c as { isProjected?: boolean }).isProjected ? "text-blue-500" : "text-gray-600"}`}>
                    ({n(capexVal / 1e6)})
                  </td>
                );
              })}
            </tr>
            <tr className="border-t-2 border-gray-700">
              <td className="px-4 py-2.5 font-bold text-white bg-[#0f2744] border-l-4 border-green-400">Free Cash Flow</td>
              {allCols.map((c) => {
                const fcfVal = (c as { fcf?: number; freeCashFlow?: number }).fcf
                  ?? (c as { freeCashFlow?: number }).freeCashFlow ?? 0;
                return (
                  <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-bold text-white ${projBorder(c.year)} ${isProj(c) ? "bg-[#1a3a5c]" : "bg-[#0f2744]"}`}>
                    {n(fcfVal / 1e6)}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="px-4 py-1 text-[11px] text-blue-300 pl-8 bg-[#1a3a5c]">FCF Margin %</td>
              {allCols.map((c) => {
                const fcfVal = (c as { fcf?: number; freeCashFlow?: number }).fcf
                  ?? (c as { freeCashFlow?: number }).freeCashFlow ?? 0;
                return (
                  <td key={c.year} className={`px-4 py-1 text-right text-[11px] font-mono text-blue-300 ${projBorder(c.year)} bg-[#1a3a5c]`}>
                    {pct((fcfVal / c.revenue) * 100)}
                  </td>
                );
              })}
            </tr>
            <tr className="bg-gray-800 text-gray-300">
              <td className="px-4 py-1.5 text-xs pl-8">CapEx % of Revenue</td>
              {allCols.map((c) => {
                const capexVal = (c as { capex?: number }).capex ?? 0;
                return (
                  <td key={c.year} className="px-4 py-1.5 text-right text-xs font-mono">
                    {pct((capexVal / c.revenue) * 100)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </TableShell>
      </div>

      {/* ── 4. DCF ── */}
      <div>
        <SectionHeader
          title="DCF Valuation" subtitle="(Base Case, $M unless noted)"
          accentColor="bg-[#0f2744]"
          ticker={ticker} companyName={companyName} sector={sector}
          section="dcf"
          keyMetrics={{
            baseIVPS: `$${baseIVPS.toFixed(2)}`,
            currentPrice: currentPrice > 0 ? `$${currentPrice.toFixed(2)}` : "N/A",
            upside: upside !== null ? `${upside.toFixed(1)}%` : "N/A",
            wacc: pct(a.waccBase * 100),
            terminalGrowth: pct(a.terminalGrowthRate * 100),
            tvPctEV: ev > 0 ? pct((pvTV / ev) * 100) : "N/A",
            ebitMargin: pct(a.ebitMarginBase * 100),
          }}
        />
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="text-sm w-full border-collapse bg-white">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="text-left px-4 py-3 w-64 font-semibold tracking-wide">Line Item</th>
                {projYears.map((yr, i) => (
                  <th key={yr} className="px-4 py-3 text-right font-semibold tracking-wide text-blue-300">
                    FY{yr}E {i === 0 ? "(Yr 1)" : ""}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold tracking-wide text-yellow-300">Terminal</th>
                <th className="px-4 py-3 text-right font-semibold tracking-wide text-green-300">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-blue-50">
                <td className="px-4 py-2.5 font-semibold text-gray-800">Projected Revenue ($M)</td>
                {projected.map((p) => (
                  <td key={p.year} className="px-4 py-2.5 text-right font-mono text-blue-700">{n(p.revenue / 1e6)}</td>
                ))}
                <td className="px-4 py-2.5 text-right font-mono text-gray-400">—</td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-400">—</td>
              </tr>
              <tr className="bg-blue-50">
                <td className="px-4 py-1.5 text-xs pl-8 text-blue-600">Revenue Growth %</td>
                {projected.map((p, i) => {
                  const prevRev = i === 0 ? hist[0].revenue / 1e6 : projected[i - 1].revenue / 1e6;
                  const g = ((p.revenue / 1e6 - prevRev) / prevRev) * 100;
                  return <td key={p.year} className="px-4 py-1.5 text-right text-xs font-mono text-blue-500">{g >= 0 ? "+" : ""}{g.toFixed(1)}%</td>;
                })}
                <td className="px-4 py-1.5 text-right text-xs font-mono text-gray-400">—</td>
                <td className="px-4 py-1.5 text-right text-xs font-mono text-gray-400">—</td>
              </tr>
              <tr className="bg-white border-t border-gray-200">
                <td className="px-4 py-2.5 font-semibold text-gray-800">EBIT ($M)</td>
                {projected.map((p) => (
                  <td key={p.year} className="px-4 py-2.5 text-right font-mono text-blue-700">{n(p.ebit / 1e6)}</td>
                ))}
                <td className="px-4 py-2.5 text-right font-mono text-gray-400">—</td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-400">—</td>
              </tr>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-4 py-2.5 font-semibold text-gray-800">Unlevered Free Cash Flow ($M)</td>
                {fcfs.map((f, i) => (
                  <td key={i} className="px-4 py-2.5 text-right font-mono text-blue-700">{n(f)}</td>
                ))}
                <td className="px-4 py-2.5 text-right font-mono text-yellow-700">{n(tv)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-400">—</td>
              </tr>
              <tr className="bg-white">
                <td className="px-4 py-2 text-gray-600 pl-8 text-xs">Discount Factor (WACC {pct(a.waccBase * 100)})</td>
                {pvFcfs.map((pv, i) => (
                  <td key={i} className="px-4 py-2 text-right font-mono text-xs text-gray-500">
                    {(1 / Math.pow(1 + a.waccBase, i + 0.5)).toFixed(3)}x
                  </td>
                ))}
                <td className="px-4 py-2 text-right font-mono text-xs text-gray-500">
                  {(1 / Math.pow(1 + a.waccBase, a.projectionYears)).toFixed(3)}x
                </td>
                <td className="px-4 py-2 text-right font-mono text-gray-400">—</td>
              </tr>
              <tr className="bg-[#1a3a5c] text-white border-t-2 border-[#0f2744]">
                <td className="px-4 py-2.5 font-bold">PV of Cash Flows ($M)</td>
                {pvFcfs.map((pv, i) => (
                  <td key={i} className="px-4 py-2.5 text-right font-mono font-bold">{n(pv)}</td>
                ))}
                <td className="px-4 py-2.5 text-right font-mono font-bold text-yellow-300">{n(pvTV)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-green-300">{n(ev)}</td>
              </tr>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-4 py-2.5 text-gray-700 font-medium pl-8">Sum of PV FCFs</td>
                <td colSpan={a.projectionYears} className="px-4 py-2.5 text-right font-mono text-gray-800 font-semibold">{n(sumPVFcf)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-400">{pct((sumPVFcf / ev) * 100)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-400"></td>
              </tr>
              <tr className="bg-gray-50">
                <td className="px-4 py-2.5 text-gray-700 font-medium pl-8">PV of Terminal Value (TGR {pct(a.terminalGrowthRate * 100)})</td>
                <td colSpan={a.projectionYears} className="px-4 py-2.5 text-right font-mono text-yellow-700 font-semibold">{n(pvTV)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-yellow-600">{pct((pvTV / ev) * 100)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-400"></td>
              </tr>
              <tr className="bg-[#0f2744] text-white border-t-2">
                <td className="px-4 py-2.5 font-bold">= Enterprise Value ($M)</td>
                <td colSpan={a.projectionYears + 1} className="px-4 py-2.5"></td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-green-300">{n(ev)}</td>
              </tr>
              {a.netDebt !== 0 && (
                <tr className="bg-white">
                  <td className="px-4 py-2 text-gray-600 pl-8">{a.netDebt < 0 ? "+ Net Cash" : "− Net Debt"} ($M)</td>
                  <td colSpan={a.projectionYears + 1} className="px-4 py-2"></td>
                  <td className={`px-4 py-2 text-right font-mono font-semibold ${a.netDebt < 0 ? "text-green-700" : "text-red-700"}`}>
                    {a.netDebt < 0 ? "+" : "-"}{n(Math.abs(a.netDebt))}
                  </td>
                </tr>
              )}
              <tr className="bg-gray-900 text-white border-t-2 border-gray-700">
                <td className="px-4 py-2.5 font-bold">= Equity Value / Share (IVPS)</td>
                <td colSpan={a.projectionYears + 1} className="px-4 py-2.5"></td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-green-400">${baseIVPS.toFixed(2)}</td>
              </tr>
              {currentPrice > 0 && (
                <tr className="bg-gray-800 text-gray-200">
                  <td className="px-4 py-2 text-xs pl-8">vs Current Price ${currentPrice.toFixed(2)}</td>
                  <td colSpan={a.projectionYears + 1} className="px-4 py-2"></td>
                  <td className={`px-4 py-2 text-right font-mono font-bold text-sm ${(upside ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {upside !== null ? `${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 5. PER SHARE SUMMARY ── */}
      {sh > 0 && (
        <div>
          <SectionHeader
            title="Per Share Summary" subtitle="($)"
            accentColor="bg-indigo-600"
            ticker={ticker} companyName={companyName} sector={sector}
            section="per_share"
            keyMetrics={{
              baseIVPS: `$${baseIVPS.toFixed(2)}`,
              currentPrice: currentPrice > 0 ? `$${currentPrice.toFixed(2)}` : "N/A",
              latestEPS: `$${(latest.netIncome / 1e6 / sh).toFixed(2)}`,
              latestFCFPerShare: `$${((latest.freeCashFlow ?? 0) / 1e6 / sh).toFixed(2)}`,
              bookValuePerShare: `$${((latest.equity ?? 0) / 1e6 / sh).toFixed(2)}`,
            }}
          />
          <TableShell>
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="text-left px-4 py-3 w-64 font-semibold tracking-wide">Metric (per share)</th>
                {allCols.map((c) => (
                  <th key={c.year} className={`px-4 py-3 text-right font-semibold tracking-wide ${(c as { isProjected?: boolean }).isProjected ? "text-blue-300" : ""}`}>
                    FY{c.year}{(c as { isProjected?: boolean }).isProjected ? "E" : "A"}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold tracking-wide text-green-300">IVPS</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Revenue / Share", fn: (c: typeof allCols[0]) => c.revenue / 1e6 / sh, bold: true },
                { label: "Gross Profit / Share", fn: (c: typeof allCols[0]) => c.grossProfit / 1e6 / sh, bold: false },
                { label: "EBIT / Share", fn: (c: typeof allCols[0]) => c.ebit / 1e6 / sh, bold: false },
                { label: "EPS (Net Income / Share)", fn: (c: typeof allCols[0]) => c.netIncome / 1e6 / sh, bold: true },
                { label: "FCF / Share", fn: (c: typeof allCols[0]) => ((c as { fcf?: number; freeCashFlow?: number }).fcf ?? (c as { freeCashFlow?: number }).freeCashFlow ?? 0) / 1e6 / sh, bold: true },
                { label: "Book Value / Share", fn: (c: typeof allCols[0]) => ((c as { equity?: number }).equity ?? 0) / 1e6 / sh, bold: false },
                { label: "Cash / Share", fn: (c: typeof allCols[0]) => ((c as { cash?: number }).cash ?? 0) / 1e6 / sh, bold: false },
              ].map(({ label, fn, bold }, i) => (
                <tr key={label} className={bold ? "bg-blue-50" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className={`px-4 py-2.5 ${bold ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>{label}</td>
                  {allCols.map((c) => {
                    const val = fn(c);
                    return (
                      <td key={c.year} className={`px-4 py-2.5 text-right font-mono ${bold ? "font-bold" : ""} ${(c as { isProjected?: boolean }).isProjected ? "text-blue-700" : "text-gray-800"}`}>
                        {val !== 0 ? `$${val.toFixed(2)}` : "—"}
                      </td>
                    );
                  })}
                  {/* IVPS column — only shown on last FCF / Share row */}
                  {label === "FCF / Share" ? (
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-green-700 bg-green-50 border-l-2 border-green-200" rowSpan={1}>
                      ${baseIVPS.toFixed(2)}
                    </td>
                  ) : (
                    <td className="px-4 py-2.5 bg-green-50 border-l-2 border-green-200"></td>
                  )}
                </tr>
              ))}
              {/* Current price row */}
              {currentPrice > 0 && (
                <tr className="bg-gray-900 text-white border-t-2 border-gray-700">
                  <td className="px-4 py-2.5 font-bold">Current Market Price</td>
                  {allCols.map((c) => (
                    <td key={c.year} className="px-4 py-2.5 text-right font-mono text-gray-300">${currentPrice.toFixed(2)}</td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-mono font-bold bg-green-900 border-l-2 border-green-700">
                    ${currentPrice.toFixed(2)}
                  </td>
                </tr>
              )}
              {upside !== null && (
                <tr className="bg-gray-800 text-gray-300">
                  <td className="px-4 py-2 text-xs pl-8">Implied Upside / (Downside) vs IVPS</td>
                  {allCols.map((c) => (
                    <td key={c.year} className="px-4 py-2 text-right font-mono text-xs text-gray-500">—</td>
                  ))}
                  <td className={`px-4 py-2 text-right font-mono font-bold text-sm ${upside >= 0 ? "text-green-400" : "text-red-400"} bg-gray-900 border-l-2 border-gray-700`}>
                    {upside >= 0 ? "+" : ""}{upside.toFixed(1)}%
                  </td>
                </tr>
              )}
            </tbody>
          </TableShell>
          <p className="text-xs text-gray-400 mt-2">
            IVPS = Intrinsic Value Per Share (Base Case DCF). Blue = projected. Historical = actual reported.
          </p>
        </div>
      )}

    </div>
  );
}
