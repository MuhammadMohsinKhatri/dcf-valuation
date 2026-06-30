"use client";
import type { DCFModel } from "@/types/model";
import { projectThreeStatements, calcDCF, deriveDriversFromHistory } from "@/lib/projection";
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
  const hist = model.historicalPeriods;
  const ticker = model.ticker;
  const companyName = model.companyName;
  const sector = model.sector ?? "";

  // For models created before new fields existed, fill gaps from historical derivation
  const derived = deriveDriversFromHistory(hist);
  const stored = model.assumptions;
  const a: typeof model.assumptions = {
    ...stored,
    arDays:                stored.arDays                ?? derived.arDays                ?? 45,
    apDays:                stored.apDays                ?? derived.apDays                ?? 35,
    inventoryDays:         stored.inventoryDays         ?? derived.inventoryDays         ?? 30,
    openingDebt:           stored.openingDebt           ?? derived.openingDebt           ?? 0,
    openingPPE:            stored.openingPPE            ?? derived.openingPPE            ?? 0,
    openingCash:           stored.openingCash           ?? derived.openingCash           ?? 0,
    openingAR:             stored.openingAR             ?? derived.openingAR             ?? 0,
    openingInventory:      stored.openingInventory      ?? derived.openingInventory      ?? 0,
    openingAP:             stored.openingAP             ?? derived.openingAP             ?? 0,
    openingOtherAssets:    stored.openingOtherAssets    ?? derived.openingOtherAssets    ?? 0,
    openingOtherLiabilities: stored.openingOtherLiabilities ?? derived.openingOtherLiabilities ?? 0,
    openingEquity:         stored.openingEquity         ?? derived.openingEquity         ?? 0,
    interestRate:          stored.interestRate          ?? derived.interestRate          ?? 0.05,
    debtRepaymentPct:      stored.debtRepaymentPct      ?? 0.05,
    newDebtPct:            stored.newDebtPct            ?? 0,
    dividendPctNI:         stored.dividendPctNI         ?? 0.15,
    buybackPctNI:          stored.buybackPctNI          ?? 0.10,
  };
  const sh = a.sharesOutstanding;

  // Build projected periods using the linked three-statement engine
  const M = 1e6;
  const rawProjected = projectThreeStatements(a, hist, "base");
  // Scale $M → raw $ so allCols display code (which divides by 1e6) works uniformly
  const projected = rawProjected.map((p) => ({
    ...p,
    revenue: p.revenue * M,
    cogs: p.cogs * M,
    grossProfit: p.grossProfit * M,
    da: p.da * M,
    ebitda: p.ebitda * M,
    ebit: p.ebit * M,
    interestExpense: p.interestExpense * M,
    ebt: p.ebt * M,
    taxExpense: p.taxExpense * M,
    netIncome: p.netIncome * M,
    accountsReceivable: p.accountsReceivable * M,
    inventory: p.inventory * M,
    accountsPayable: p.accountsPayable * M,
    nwc: p.nwc * M,
    nwcChange: p.nwcChange * M,
    capex: p.capex * M,
    openingPPE: p.openingPPE * M,
    closingPPE: p.closingPPE * M,
    openingDebt: p.openingDebt * M,
    newDebt: p.newDebt * M,
    debtRepayment: p.debtRepayment * M,
    closingDebt: p.closingDebt * M,
    cfo: p.cfo * M,
    cfi: p.cfi * M,
    dividends: p.dividends * M,
    buybacks: p.buybacks * M,
    cff: p.cff * M,
    netCashChange: p.netCashChange * M,
    closingCash: p.closingCash * M,
    fcf: p.fcf * M,
    leveredFCF: p.leveredFCF * M,
    cash: p.cash * M,
    totalCurrentAssets: p.totalCurrentAssets * M,
    ppe: p.ppe * M,
    totalAssets: p.totalAssets * M,
    shortTermDebt: p.shortTermDebt * M,
    totalCurrentLiabilities: p.totalCurrentLiabilities * M,
    longTermDebt: p.longTermDebt * M,
    totalLiabilities: p.totalLiabilities * M,
    retainedEarningsAdd: p.retainedEarningsAdd * M,
    equity: p.equity * M,
    totalLiabilitiesAndEquity: p.totalLiabilitiesAndEquity * M,
    bsCheck: p.bsCheck * M,
    // Alias fields to match FinancialPeriod names used in display
    operatingCashFlow: p.cfo * M,
    freeCashFlow: p.leveredFCF * M,
    depreciationAmortization: p.da * M,
    changeInWorkingCapital: -p.nwcChange * M, // sign flip: CF statement convention
  }));

  const allCols = [...[...hist].reverse(), ...projected];
  const latest = hist[0];
  const firstProjYear = projected[0]?.year;

  // DCF computation using the linked engine (values in $M)
  const dcfOut = calcDCF(a, hist, "base");
  const fcfs = dcfOut.projectedYears.map((p) => p.fcf);
  const pvFcfs = dcfOut.pvFcfs;
  const sumPVFcf = dcfOut.sumPvFcf;
  const tv = dcfOut.terminalValue;
  const pvTV = dcfOut.pvTerminalValue;
  const ev = dcfOut.enterpriseValue;
  const baseIVPS = dcfOut.ivps;
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
                  <td key={c.year} className={`px-4 py-2.5 text-right font-mono ${bold ? "font-bold" : ""} ${isProj(c) ? "text-blue-400" : bold ? "text-gray-900" : "text-gray-600"}`}>
                    {n(((c as unknown as Record<string, number>)[key as string] ?? 0) / 1e6)}
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
                  <td key={c.year} className={`px-4 py-2.5 text-right font-mono ${bold ? "font-bold" : ""} ${isProj(c) ? "text-blue-400" : bold ? "text-gray-900" : "text-gray-600"}`}>
                    {n(((c as unknown as Record<string, number>)[key as string] ?? 0) / 1e6)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-gray-900 text-white border-t-2 border-gray-700">
              <td className="px-4 py-2.5 font-bold">Total Shareholders&apos; Equity</td>
              {allCols.map((c) => (
                <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-bold ${isProj(c) ? "text-blue-300" : ""}`}>
                  {n(((c as { equity?: number }).equity ?? 0) / 1e6)}
                </td>
              ))}
            </tr>
            {/* Balance Check */}
            <tr className="border-t-2 border-dashed border-gray-400">
              <td className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide pl-4">
                Balance Check (Assets − L&amp;E)
              </td>
              {allCols.map((c) => {
                const check = isProj(c) ? ((c as { bsCheck?: number }).bsCheck ?? 0) / 1e6 : null;
                const ok = check !== null && Math.abs(check) < 1;
                return (
                  <td key={c.year} className={`px-4 py-2 text-right font-mono text-xs font-bold ${projBorder(c.year)} ${check === null ? "text-gray-300" : ok ? "text-green-600" : "text-red-600"}`}>
                    {check === null ? "—" : ok ? "✓ 0" : check.toFixed(1)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </TableShell>
        <p className="text-xs text-gray-400 mt-2">Blue = projected (linked model). ✓ 0 = Balance Sheet balances. Historical = actual reported.</p>
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
            {/* Operating */}
            <tr className="bg-purple-900 text-white">
              <td className="px-4 py-2 font-bold text-xs uppercase tracking-wide">Operating Activities</td>
              {allCols.map((c) => <td key={c.year} className="px-4 py-2"></td>)}
            </tr>
            <tr className="bg-white">
              <td className="px-4 py-2 text-gray-600 pl-8">Net Income</td>
              {allCols.map((c) => (
                <td key={c.year} className={`px-4 py-2 text-right font-mono ${isProj(c) ? "text-blue-600" : "text-gray-600"}`}>
                  {n(c.netIncome / 1e6)}
                </td>
              ))}
            </tr>
            <tr className="bg-gray-50">
              <td className="px-4 py-2 text-gray-600 pl-8">Depreciation & Amortization</td>
              {allCols.map((c) => {
                const da = (c as { da?: number; depreciationAmortization?: number }).da ?? (c as { depreciationAmortization?: number }).depreciationAmortization ?? 0;
                return <td key={c.year} className={`px-4 py-2 text-right font-mono ${isProj(c) ? "text-blue-600" : "text-gray-600"}`}>{n(da / 1e6)}</td>;
              })}
            </tr>
            <tr className="bg-white">
              <td className="px-4 py-2 text-gray-600 pl-8">Change in Working Capital</td>
              {allCols.map((c) => {
                const nwcVal = (c as { changeInWorkingCapital?: number }).changeInWorkingCapital ?? 0;
                const isNeg = nwcVal < 0;
                return <td key={c.year} className={`px-4 py-2 text-right font-mono ${isProj(c) ? "text-blue-500" : isNeg ? "text-red-600" : "text-gray-600"}`}>{nwcVal < 0 ? `(${n(Math.abs(nwcVal) / 1e6)})` : n(nwcVal / 1e6)}</td>;
              })}
            </tr>
            <tr className="bg-purple-50 border-t border-purple-200">
              <td className="px-4 py-2.5 font-bold text-gray-900 border-l-4 border-purple-400">Cash from Operations (CFO)</td>
              {allCols.map((c) => {
                const ocf = (c as { operatingCashFlow?: number }).operatingCashFlow ?? 0;
                return <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-bold ${projBorder(c.year)} ${isProj(c) ? "text-blue-700" : "text-gray-900"}`}>{n(ocf / 1e6)}</td>;
              })}
            </tr>
            <tr className="bg-purple-50">
              <td className="px-4 py-1 text-[11px] text-purple-600 pl-8">OCF Margin %</td>
              {allCols.map((c) => {
                const ocf = (c as { operatingCashFlow?: number }).operatingCashFlow ?? 0;
                return <td key={c.year} className={`px-4 py-1 text-right text-[11px] font-mono text-purple-600 ${projBorder(c.year)}`}>{pct((ocf / c.revenue) * 100)}</td>;
              })}
            </tr>

            {/* Investing */}
            <tr className="bg-purple-900 text-white">
              <td className="px-4 py-2 font-bold text-xs uppercase tracking-wide">Investing Activities</td>
              {allCols.map((c) => <td key={c.year} className="px-4 py-2"></td>)}
            </tr>
            <tr className="bg-white">
              <td className="px-4 py-2 text-gray-600 pl-8">Capital Expenditures (CapEx)</td>
              {allCols.map((c) => {
                const capexVal = (c as { capex?: number }).capex ?? 0;
                return <td key={c.year} className={`px-4 py-2 text-right font-mono ${isProj(c) ? "text-blue-500" : "text-red-600"}`}>({n(capexVal / 1e6)})</td>;
              })}
            </tr>
            <tr className="bg-gray-50">
              <td className="px-4 py-1 text-[11px] text-gray-400 pl-8">CapEx % of Revenue</td>
              {allCols.map((c) => {
                const capexVal = (c as { capex?: number }).capex ?? 0;
                return <td key={c.year} className={`px-4 py-1 text-right text-[11px] font-mono text-gray-400 ${projBorder(c.year)}`}>{pct((capexVal / c.revenue) * 100)}</td>;
              })}
            </tr>

            {/* Financing */}
            <tr className="bg-purple-900 text-white">
              <td className="px-4 py-2 font-bold text-xs uppercase tracking-wide">Financing Activities</td>
              {allCols.map((c) => <td key={c.year} className="px-4 py-2"></td>)}
            </tr>
            <tr className="bg-white">
              <td className="px-4 py-2 text-gray-600 pl-8">Debt Issuance / (Repayment), Net</td>
              {allCols.map((c) => {
                if (!isProj(c)) return <td key={c.year} className="px-4 py-2 text-right font-mono text-gray-400 text-xs">—</td>;
                const p = c as { newDebt?: number; debtRepayment?: number };
                const net = ((p.newDebt ?? 0) - (p.debtRepayment ?? 0)) / 1e6;
                return <td key={c.year} className={`px-4 py-2 text-right font-mono text-xs ${net >= 0 ? "text-blue-500" : "text-red-500"}`}>{net < 0 ? `(${n(Math.abs(net))})` : n(net)}</td>;
              })}
            </tr>
            <tr className="bg-gray-50">
              <td className="px-4 py-2 text-gray-600 pl-8">Dividends Paid</td>
              {allCols.map((c) => {
                if (!isProj(c)) return <td key={c.year} className="px-4 py-2 text-right font-mono text-gray-400 text-xs">—</td>;
                const div = ((c as { dividends?: number }).dividends ?? 0) / 1e6;
                return <td key={c.year} className="px-4 py-2 text-right font-mono text-xs text-red-500">{div > 0 ? `(${n(div)})` : "—"}</td>;
              })}
            </tr>
            <tr className="bg-white">
              <td className="px-4 py-2 text-gray-600 pl-8">Share Buybacks</td>
              {allCols.map((c) => {
                if (!isProj(c)) return <td key={c.year} className="px-4 py-2 text-right font-mono text-gray-400 text-xs">—</td>;
                const bb = ((c as { buybacks?: number }).buybacks ?? 0) / 1e6;
                return <td key={c.year} className="px-4 py-2 text-right font-mono text-xs text-red-500">{bb > 0 ? `(${n(bb)})` : "—"}</td>;
              })}
            </tr>

            {/* FCF Summary */}
            <tr className="border-t-2 border-gray-700">
              <td className="px-4 py-2.5 font-bold text-white bg-[#0f2744] border-l-4 border-green-400">Free Cash Flow (FCF)</td>
              {allCols.map((c) => {
                const fcfVal = (c as { fcf?: number; freeCashFlow?: number }).fcf ?? (c as { freeCashFlow?: number }).freeCashFlow ?? 0;
                return <td key={c.year} className={`px-4 py-2.5 text-right font-mono font-bold text-white ${projBorder(c.year)} ${isProj(c) ? "bg-[#1a3a5c]" : "bg-[#0f2744]"}`}>{n(fcfVal / 1e6)}</td>;
              })}
            </tr>
            <tr>
              <td className="px-4 py-1 text-[11px] text-blue-300 pl-8 bg-[#1a3a5c]">FCF Margin %</td>
              {allCols.map((c) => {
                const fcfVal = (c as { fcf?: number; freeCashFlow?: number }).fcf ?? (c as { freeCashFlow?: number }).freeCashFlow ?? 0;
                return <td key={c.year} className={`px-4 py-1 text-right text-[11px] font-mono text-blue-300 ${projBorder(c.year)} bg-[#1a3a5c]`}>{pct((fcfVal / c.revenue) * 100)}</td>;
              })}
            </tr>
            <tr>
              <td className="px-4 py-1 text-[11px] text-green-300 pl-8 bg-[#1a3a5c]">FCF / Share ($)</td>
              {allCols.map((c) => {
                const fcfVal = (c as { fcf?: number; freeCashFlow?: number }).fcf ?? (c as { freeCashFlow?: number }).freeCashFlow ?? 0;
                return <td key={c.year} className={`px-4 py-1 text-right text-[11px] font-mono text-green-300 ${projBorder(c.year)} bg-[#1a3a5c]`}>{sh > 0 ? `$${(fcfVal / 1e6 / sh).toFixed(2)}` : "—"}</td>;
              })}
            </tr>
          </tbody>
        </TableShell>
        <p className="text-xs text-gray-400 mt-2">Projected: CFO = NI + D&A − ΔNWC. FCF = NOPAT + D&A − CapEx − ΔNWC (unlevered, for DCF). Financing = debt schedule + capital return assumptions.</p>
      </div>

      {/* ── 3b. SUPPORTING SCHEDULES ── */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-gray-500 rounded"></div>
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">Supporting Schedules</h2>
          <span className="text-xs text-gray-400 font-normal normal-case">Projected years only — drives Balance Sheet & Cash Flow</span>
        </div>

        {/* Working Capital Schedule */}
        <div>
          <p className="text-xs font-bold text-teal-700 uppercase tracking-wide mb-2 pl-1">Working Capital Schedule ($M)</p>
          <TableShell>
            <thead>
              <tr className="bg-teal-900 text-white">
                <th className="text-left px-4 py-2.5 w-64 text-xs font-semibold uppercase tracking-wide">Driver</th>
                {projected.map((p, i) => (
                  <th key={p.year} className={`px-4 py-2.5 text-right text-xs font-semibold text-teal-200 ${i === 0 ? "border-l-2 border-teal-400" : ""}`}>FY{p.year}E</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "AR Days", fn: (p: typeof projected[0]) => a.arDays.toFixed(0), unit: "days", bold: false },
                { label: "Accounts Receivable", fn: (p: typeof projected[0]) => n((p.accountsReceivable ?? 0) / 1e6), unit: "", bold: false },
                { label: "Inventory Days", fn: (p: typeof projected[0]) => a.inventoryDays.toFixed(0), unit: "days", bold: false },
                { label: "Inventory", fn: (p: typeof projected[0]) => n((p.inventory ?? 0) / 1e6), unit: "", bold: false },
                { label: "AP Days", fn: (p: typeof projected[0]) => a.apDays.toFixed(0), unit: "days", bold: false },
                { label: "Accounts Payable", fn: (p: typeof projected[0]) => n((p.accountsPayable ?? 0) / 1e6), unit: "", bold: false },
                { label: "Net Working Capital", fn: (p: typeof projected[0]) => n((p.nwc ?? 0) / 1e6), unit: "", bold: true },
                { label: "Change in NWC (cash impact)", fn: (p: typeof projected[0]) => { const v = (p.nwcChange ?? 0) / 1e6; return (v > 0 ? `(${n(v)})` : n(Math.abs(v))); }, unit: "", bold: false },
              ].map(({ label, fn, bold }, i) => (
                <tr key={label} className={bold ? "bg-teal-50 border-t border-teal-200" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className={`px-4 py-2 ${bold ? "font-bold text-gray-900" : "text-gray-600 pl-8"} text-sm`}>{label}</td>
                  {projected.map((p) => (
                    <td key={p.year} className={`px-4 py-2 text-right font-mono text-sm ${bold ? "font-bold text-teal-700" : "text-teal-600"}`}>{fn(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>

        {/* PP&E Roll-forward */}
        <div>
          <p className="text-xs font-bold text-orange-700 uppercase tracking-wide mb-2 pl-1">PP&amp;E Roll-forward ($M)</p>
          <TableShell>
            <thead>
              <tr className="bg-orange-900 text-white">
                <th className="text-left px-4 py-2.5 w-64 text-xs font-semibold uppercase tracking-wide">Line Item</th>
                {projected.map((p, i) => (
                  <th key={p.year} className={`px-4 py-2.5 text-right text-xs font-semibold text-orange-200 ${i === 0 ? "border-l-2 border-orange-400" : ""}`}>FY{p.year}E</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Opening PP&E", fn: (p: typeof projected[0]) => n((p.openingPPE ?? 0) / 1e6), bold: false },
                { label: "+ Capital Expenditures", fn: (p: typeof projected[0]) => n((p.capex ?? 0) / 1e6), bold: false },
                { label: "− Depreciation & Amortization", fn: (p: typeof projected[0]) => `(${n((p.depreciationAmortization ?? 0) / 1e6)})`, bold: false },
                { label: "= Closing PP&E (Net)", fn: (p: typeof projected[0]) => n((p.ppe ?? 0) / 1e6), bold: true },
              ].map(({ label, fn, bold }, i) => (
                <tr key={label} className={bold ? "bg-orange-50 border-t-2 border-orange-300" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className={`px-4 py-2 ${bold ? "font-bold text-gray-900" : "text-gray-600 pl-8"} text-sm`}>{label}</td>
                  {projected.map((p) => (
                    <td key={p.year} className={`px-4 py-2 text-right font-mono text-sm ${bold ? "font-bold text-orange-700" : "text-orange-600"}`}>{fn(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>

        {/* Debt Schedule */}
        <div>
          <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-2 pl-1">Debt Schedule ($M)</p>
          <TableShell>
            <thead>
              <tr className="bg-red-900 text-white">
                <th className="text-left px-4 py-2.5 w-64 text-xs font-semibold uppercase tracking-wide">Line Item</th>
                {projected.map((p, i) => (
                  <th key={p.year} className={`px-4 py-2.5 text-right text-xs font-semibold text-red-200 ${i === 0 ? "border-l-2 border-red-400" : ""}`}>FY{p.year}E</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Opening Debt", fn: (p: typeof projected[0]) => n((p.openingDebt ?? 0) / 1e6), bold: false },
                { label: "+ New Borrowings", fn: (p: typeof projected[0]) => n((p.newDebt ?? 0) / 1e6), bold: false },
                { label: "− Debt Repayment", fn: (p: typeof projected[0]) => `(${n((p.debtRepayment ?? 0) / 1e6)})`, bold: false },
                { label: "= Closing Debt", fn: (p: typeof projected[0]) => n((p.closingDebt ?? 0) / 1e6), bold: true },
                { label: "Interest Expense", fn: (p: typeof projected[0]) => `(${n((p.interestExpense ?? 0) / 1e6)})`, bold: false },
              ].map(({ label, fn, bold }, i) => (
                <tr key={label} className={bold ? "bg-red-50 border-t-2 border-red-300" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className={`px-4 py-2 ${bold ? "font-bold text-gray-900" : "text-gray-600 pl-8"} text-sm`}>{label}</td>
                  {projected.map((p) => (
                    <td key={p.year} className={`px-4 py-2 text-right font-mono text-sm ${bold ? "font-bold text-red-700" : "text-red-600"}`}>{fn(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>

        {/* Retained Earnings Bridge */}
        <div>
          <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-2 pl-1">Equity Roll-forward ($M)</p>
          <TableShell>
            <thead>
              <tr className="bg-indigo-900 text-white">
                <th className="text-left px-4 py-2.5 w-64 text-xs font-semibold uppercase tracking-wide">Line Item</th>
                {projected.map((p, i) => (
                  <th key={p.year} className={`px-4 py-2.5 text-right text-xs font-semibold text-indigo-200 ${i === 0 ? "border-l-2 border-indigo-400" : ""}`}>FY{p.year}E</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Opening Equity", fn: (p: typeof projected[0], i: number) => n(i === 0 ? a.openingEquity : (projected[i - 1].equity ?? 0) / 1e6), bold: false },
                { label: "+ Net Income", fn: (p: typeof projected[0]) => n((p.netIncome ?? 0) / 1e6), bold: false },
                { label: "− Dividends Paid", fn: (p: typeof projected[0]) => `(${n((p.dividends ?? 0) / 1e6)})`, bold: false },
                { label: "− Share Buybacks", fn: (p: typeof projected[0]) => `(${n((p.buybacks ?? 0) / 1e6)})`, bold: false },
                { label: "= Closing Equity", fn: (p: typeof projected[0]) => n((p.equity ?? 0) / 1e6), bold: true },
              ].map(({ label, fn, bold }, i) => (
                <tr key={label} className={bold ? "bg-indigo-50 border-t-2 border-indigo-300" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className={`px-4 py-2 ${bold ? "font-bold text-gray-900" : "text-gray-600 pl-8"} text-sm`}>{label}</td>
                  {projected.map((p, pi) => (
                    <td key={p.year} className={`px-4 py-2 text-right font-mono text-sm ${bold ? "font-bold text-indigo-700" : "text-indigo-600"}`}>{fn(p, pi)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
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
                <th className="text-left px-4 py-3 w-64 font-semibold tracking-wide text-xs uppercase">Metric (per share)</th>
                {allCols.map((c) => (
                  <th key={c.year} className={`px-4 py-3 text-right font-semibold tracking-wide text-xs ${isProj(c) ? "bg-[#0f2744] text-blue-300" : "text-gray-400"}`}>
                    FY{c.year}{isProj(c) ? "E" : "A"}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold tracking-wide text-green-300 text-xs bg-green-900">DCF IVPS</th>
              </tr>
            </thead>
            <tbody>
              {/* Earnings */}
              <tr className="bg-indigo-900 text-white">
                <td className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide" colSpan={allCols.length + 2}>Earnings & Profitability</td>
              </tr>
              {[
                { label: "Revenue / Share", fn: (c: typeof allCols[0]) => c.revenue / 1e6 / sh, bold: false },
                { label: "Gross Profit / Share", fn: (c: typeof allCols[0]) => c.grossProfit / 1e6 / sh, bold: false },
                { label: "EBIT / Share", fn: (c: typeof allCols[0]) => c.ebit / 1e6 / sh, bold: false },
                { label: "EPS (Diluted)", fn: (c: typeof allCols[0]) => c.netIncome / 1e6 / sh, bold: true },
              ].map(({ label, fn, bold }, i) => (
                <tr key={label} className={bold ? "bg-indigo-50 border-t border-indigo-100" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className={`px-4 py-2.5 ${bold ? "font-bold text-gray-900" : "text-gray-600 pl-8"}`}>{label}</td>
                  {allCols.map((c) => {
                    const val = fn(c);
                    return <td key={c.year} className={`px-4 py-2.5 text-right font-mono ${bold ? "font-bold" : ""} ${isProj(c) ? "text-blue-700" : "text-gray-800"}`}>{val !== 0 ? `$${val.toFixed(2)}` : "—"}</td>;
                  })}
                  <td className="px-4 py-2.5 bg-green-50 border-l-2 border-green-200"></td>
                </tr>
              ))}

              {/* Cash Flow */}
              <tr className="bg-indigo-900 text-white">
                <td className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide" colSpan={allCols.length + 2}>Cash Flow</td>
              </tr>
              {[
                { label: "Operating Cash Flow / Share", fn: (c: typeof allCols[0]) => ((c as { operatingCashFlow?: number }).operatingCashFlow ?? 0) / 1e6 / sh, bold: false },
                { label: "FCF / Share", fn: (c: typeof allCols[0]) => ((c as { fcf?: number; freeCashFlow?: number }).fcf ?? (c as { freeCashFlow?: number }).freeCashFlow ?? 0) / 1e6 / sh, bold: true },
                { label: "CapEx / Share", fn: (c: typeof allCols[0]) => ((c as { capex?: number }).capex ?? 0) / 1e6 / sh, bold: false },
              ].map(({ label, fn, bold }, i) => (
                <tr key={label} className={bold ? "bg-indigo-50 border-t border-indigo-100" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className={`px-4 py-2.5 ${bold ? "font-bold text-gray-900" : "text-gray-600 pl-8"}`}>{label}</td>
                  {allCols.map((c) => {
                    const val = fn(c);
                    return <td key={c.year} className={`px-4 py-2.5 text-right font-mono ${bold ? "font-bold" : ""} ${isProj(c) ? "text-blue-700" : "text-gray-800"}`}>{val !== 0 ? `$${val.toFixed(2)}` : "—"}</td>;
                  })}
                  {label === "FCF / Share" ? (
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-green-700 bg-green-50 border-l-2 border-green-200">${baseIVPS.toFixed(2)}</td>
                  ) : (
                    <td className="px-4 py-2.5 bg-green-50 border-l-2 border-green-200"></td>
                  )}
                </tr>
              ))}

              {/* Balance Sheet */}
              <tr className="bg-indigo-900 text-white">
                <td className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide" colSpan={allCols.length + 2}>Balance Sheet</td>
              </tr>
              {[
                { label: "Book Value / Share (BVPS)", fn: (c: typeof allCols[0]) => ((c as { equity?: number }).equity ?? 0) / 1e6 / sh, bold: true },
                { label: "Cash / Share", fn: (c: typeof allCols[0]) => ((c as { cash?: number }).cash ?? 0) / 1e6 / sh, bold: false },
                { label: "Total Debt / Share", fn: (c: typeof allCols[0]) => (((c as { shortTermDebt?: number }).shortTermDebt ?? 0) + ((c as { longTermDebt?: number }).longTermDebt ?? 0)) / 1e6 / sh, bold: false },
              ].map(({ label, fn, bold }, i) => (
                <tr key={label} className={bold ? "bg-indigo-50 border-t border-indigo-100" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className={`px-4 py-2.5 ${bold ? "font-bold text-gray-900" : "text-gray-600 pl-8"}`}>{label}</td>
                  {allCols.map((c) => {
                    const val = fn(c);
                    return <td key={c.year} className={`px-4 py-2.5 text-right font-mono ${bold ? "font-bold" : ""} ${isProj(c) ? "text-blue-400" : "text-gray-800"}`}>{val !== 0 ? `$${val.toFixed(2)}` : "—"}</td>;
                  })}
                  <td className="px-4 py-2.5 bg-green-50 border-l-2 border-green-200"></td>
                </tr>
              ))}

              {/* Valuation Multiples */}
              {currentPrice > 0 && (
                <>
                  <tr className="bg-indigo-900 text-white">
                    <td className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide" colSpan={allCols.length + 2}>Implied Valuation Multiples (at Current Price ${currentPrice.toFixed(2)})</td>
                  </tr>
                  {[
                    { label: "P / E (Price / EPS)", fn: (c: typeof allCols[0]) => { const eps = c.netIncome / 1e6 / sh; return eps > 0 ? currentPrice / eps : 0; }, suffix: "x" },
                    { label: "P / FCF (Price / FCF per Share)", fn: (c: typeof allCols[0]) => { const fcfps = ((c as { fcf?: number; freeCashFlow?: number }).fcf ?? (c as { freeCashFlow?: number }).freeCashFlow ?? 0) / 1e6 / sh; return fcfps > 0 ? currentPrice / fcfps : 0; }, suffix: "x" },
                    { label: "P / BV (Price / Book Value)", fn: (c: typeof allCols[0]) => { const bvps = ((c as { equity?: number }).equity ?? 0) / 1e6 / sh; return bvps > 0 ? currentPrice / bvps : 0; }, suffix: "x" },
                    { label: "P / Sales (Price / Revenue per Share)", fn: (c: typeof allCols[0]) => { const rps = c.revenue / 1e6 / sh; return rps > 0 ? currentPrice / rps : 0; }, suffix: "x" },
                  ].map(({ label, fn, suffix }, i) => (
                    <tr key={label} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-2.5 text-gray-600 pl-8 text-sm">{label}</td>
                      {allCols.map((c) => {
                        const val = fn(c);
                        return <td key={c.year} className={`px-4 py-2.5 text-right font-mono text-sm ${isProj(c) ? "text-blue-600" : "text-gray-700"}`}>{val > 0 && val < 500 ? `${val.toFixed(1)}${suffix}` : "—"}</td>;
                      })}
                      <td className="px-4 py-2.5 bg-green-50 border-l-2 border-green-200 text-right font-mono text-green-700 text-sm font-semibold">
                        {(() => { const ivpsMultiple = fn({ ...allCols[allCols.length - 1], netIncome: baseIVPS * sh * 1e6 }); return "—"; })()}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* IVPS vs Price */}
              <tr className="bg-[#0f2744] text-white border-t-2 border-gray-700">
                <td className="px-4 py-2.5 font-bold">DCF Intrinsic Value / Share (IVPS)</td>
                {allCols.map((c) => (
                  <td key={c.year} className="px-4 py-2.5 text-right font-mono text-gray-400">—</td>
                ))}
                <td className="px-4 py-2.5 text-right font-mono font-bold text-green-400 bg-green-900 border-l-2 border-green-700 text-lg">
                  ${baseIVPS.toFixed(2)}
                </td>
              </tr>
              {currentPrice > 0 && (
                <tr className="bg-gray-800 text-gray-300">
                  <td className="px-4 py-2.5 font-semibold">Current Market Price</td>
                  {allCols.map((c) => (
                    <td key={c.year} className="px-4 py-2.5 text-right font-mono text-gray-400">${currentPrice.toFixed(2)}</td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-white bg-gray-900 border-l-2 border-gray-700">${currentPrice.toFixed(2)}</td>
                </tr>
              )}
              {upside !== null && (
                <tr className="bg-gray-700 text-gray-200">
                  <td className="px-4 py-2.5 font-bold pl-8">Implied Upside / (Downside)</td>
                  {allCols.map((c) => (
                    <td key={c.year} className="px-4 py-2.5 text-right font-mono text-gray-500">—</td>
                  ))}
                  <td className={`px-4 py-2.5 text-right font-mono font-bold text-base ${upside >= 0 ? "text-green-400 bg-green-900" : "text-red-400 bg-red-900"} border-l-2 ${upside >= 0 ? "border-green-700" : "border-red-700"}`}>
                    {upside >= 0 ? "+" : ""}{upside.toFixed(1)}%
                  </td>
                </tr>
              )}
            </tbody>
          </TableShell>
          <p className="text-xs text-gray-400 mt-2">
            IVPS = Intrinsic Value Per Share (Base Case DCF). Blue = projected. Historical = actual reported. Multiples calculated at current market price.
          </p>
        </div>
      )}

    </div>
  );
}
