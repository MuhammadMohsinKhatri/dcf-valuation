/**
 * Linked Three-Statement Projection Engine
 *
 * Revenue → Income Statement → Working Capital Schedule → PP&E Roll-forward
 * → Debt Schedule → Balance Sheet → Cash Flow Statement → Free Cash Flow → DCF
 *
 * Every line is derived. Nothing is a black box.
 */

import type { DCFAssumptions, FinancialPeriod } from "@/types/model";

export interface ProjectedYear {
  year: number;
  isProjected: true;

  // Income Statement
  revenue: number;
  revenueGrowth: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  da: number;
  ebitda: number;
  ebitdaMargin: number;
  ebit: number;
  ebitMargin: number;
  interestExpense: number;
  ebt: number;
  taxExpense: number;
  netIncome: number;
  netMargin: number;
  eps: number;

  // Working Capital Schedule
  accountsReceivable: number;
  inventory: number;
  accountsPayable: number;
  nwc: number;         // net working capital = AR + Inv - AP
  nwcChange: number;   // increase = cash outflow

  // PP&E Roll-forward
  openingPPE: number;
  capex: number;
  closingPPE: number;

  // Debt Schedule
  openingDebt: number;
  newDebt: number;
  debtRepayment: number;
  closingDebt: number;

  // Cash Flow Statement
  // Operating
  cfo: number;
  // Investing
  cfi: number;
  // Financing
  dividends: number;
  buybacks: number;
  cff: number;
  // Net
  netCashChange: number;
  openingCash: number;
  closingCash: number;

  // Free Cash Flow (for DCF)
  fcf: number;         // NOPAT + D&A - CapEx (unlevered, for DCF)
  leveredFCF: number;  // CFO - CapEx (levered, actual)

  // Balance Sheet
  cash: number;
  totalCurrentAssets: number;
  ppe: number;
  totalAssets: number;
  shortTermDebt: number;
  totalCurrentLiabilities: number;
  longTermDebt: number;
  totalLiabilities: number;
  retainedEarningsAdd: number;
  equity: number;
  totalLiabilitiesAndEquity: number;
  bsCheck: number; // should be ~0; Assets - (Liabilities + Equity)
}

export interface DCFOutput {
  scenario: "bear" | "base" | "bull";
  projectedYears: ProjectedYear[];
  pvFcfs: number[];
  terminalValue: number;
  pvTerminalValue: number;
  enterpriseValue: number;
  equityValue: number;
  ivps: number;
  tvPctOfEV: number;
  sumPvFcf: number;
}

function deriveGrowthRates(a: DCFAssumptions, scenario: "bear" | "base" | "bull"): number[] {
  return scenario === "bear" ? a.revenueGrowthBear
    : scenario === "bull" ? a.revenueGrowthBull
    : a.revenueGrowthBase;
}

function deriveEbitMargin(a: DCFAssumptions, scenario: "bear" | "base" | "bull"): number {
  return scenario === "bear" ? a.ebitMarginBear
    : scenario === "bull" ? a.ebitMarginBull
    : a.ebitMarginBase;
}

function deriveWACC(a: DCFAssumptions, scenario: "bear" | "base" | "bull"): number {
  return scenario === "bear" ? a.waccBear
    : scenario === "bull" ? a.waccBull
    : a.waccBase;
}

export function projectThreeStatements(
  a: DCFAssumptions,
  hist: FinancialPeriod[],
  scenario: "bear" | "base" | "bull" = "base"
): ProjectedYear[] {
  const latest = hist[0];
  const growthRates = deriveGrowthRates(a, scenario);
  const ebitMargin = deriveEbitMargin(a, scenario);
  const grossMarginHist = latest.grossProfit / latest.revenue;

  const years: ProjectedYear[] = [];

  // Opening balances from latest historical
  let prevRevenue = latest.revenue / 1e6;
  let prevPPE = a.openingPPE;
  let prevDebt = a.openingDebt;
  let prevCash = a.openingCash;
  let prevNWC = a.openingAR + a.openingInventory - a.openingAP;
  let prevEquity = a.openingEquity;

  for (let i = 0; i < a.projectionYears; i++) {
    const yr = latest.year + i + 1;
    const g = growthRates[i] ?? growthRates[growthRates.length - 1];

    // ── Income Statement ──────────────────────────────────────────
    const revenue = prevRevenue * (1 + g);
    const cogs = revenue * (1 - grossMarginHist);
    const grossProfit = revenue - cogs;
    const da = revenue * a.depreciationPct;
    const ebit = revenue * ebitMargin;
    const ebitda = ebit + da;

    // Debt schedule (interest on average debt)
    const newDebt = revenue * a.capexPct * a.newDebtPct;
    const debtRepayment = prevDebt * a.debtRepaymentPct;
    const closingDebt = prevDebt + newDebt - debtRepayment;
    const avgDebt = (prevDebt + closingDebt) / 2;
    const interestExpense = avgDebt * a.interestRate;

    const ebt = Math.max(0, ebit - interestExpense);
    const taxExpense = ebt * a.taxRate;
    const netIncome = ebt - taxExpense;
    const eps = a.sharesOutstanding > 0 ? netIncome / a.sharesOutstanding : 0;

    // ── Working Capital Schedule ──────────────────────────────────
    const ar = (revenue / 365) * a.arDays;
    const inv = (cogs / 365) * a.inventoryDays;
    const ap = (cogs / 365) * a.apDays;
    const nwc = ar + inv - ap;
    const nwcChange = nwc - prevNWC; // positive = cash outflow

    // ── PP&E Roll-forward ─────────────────────────────────────────
    const capex = revenue * a.capexPct;
    const closingPPE = prevPPE + capex - da;

    // ── Cash Flow Statement ───────────────────────────────────────
    // Operating
    const cfo = netIncome + da - nwcChange;
    // Investing
    const cfi = -capex;
    // Financing
    const dividends = netIncome * a.dividendPctNI;
    const buybacks = netIncome * a.buybackPctNI;
    const cff = newDebt - debtRepayment - dividends - buybacks;
    const netCashChange = cfo + cfi + cff;
    const closingCash = prevCash + netCashChange;

    // ── Free Cash Flow (for DCF) ──────────────────────────────────
    // Unlevered FCF = NOPAT + D&A - CapEx - NWC change
    const nopat = ebit * (1 - a.taxRate);
    const fcf = nopat + da - capex - nwcChange;
    const leveredFCF = cfo - capex;

    // ── Balance Sheet ─────────────────────────────────────────────
    const cash = closingCash;
    const totalCurrentAssets = cash + ar + inv;
    const ppe = closingPPE;
    const otherAssets = a.openingOtherAssets; // held flat (simplification)
    const totalAssets = totalCurrentAssets + ppe + otherAssets;

    const shortTermDebt = closingDebt * 0.15; // ~15% of debt is current
    const longTermDebt = closingDebt * 0.85;
    const totalCurrentLiabilities = ap + shortTermDebt;
    const otherLiabilities = a.openingOtherLiabilities;
    const totalLiabilities = totalCurrentLiabilities + longTermDebt + otherLiabilities;

    // Equity = prev equity + NI - dividends - buybacks
    const retainedEarningsAdd = netIncome - dividends - buybacks;
    const equity = prevEquity + retainedEarningsAdd;
    const totalLiabilitiesAndEquity = totalLiabilities + equity;
    const bsCheck = totalAssets - totalLiabilitiesAndEquity;

    years.push({
      year: yr,
      isProjected: true,
      revenue,
      revenueGrowth: g,
      cogs,
      grossProfit,
      grossMargin: grossProfit / revenue,
      da,
      ebitda,
      ebitdaMargin: ebitda / revenue,
      ebit,
      ebitMargin: ebit / revenue,
      interestExpense,
      ebt,
      taxExpense,
      netIncome,
      netMargin: netIncome / revenue,
      eps,
      accountsReceivable: ar,
      inventory: inv,
      accountsPayable: ap,
      nwc,
      nwcChange,
      openingPPE: prevPPE,
      capex,
      closingPPE,
      openingDebt: prevDebt,
      newDebt,
      debtRepayment,
      closingDebt,
      cfo,
      cfi,
      dividends,
      buybacks,
      cff,
      netCashChange,
      openingCash: prevCash,
      closingCash,
      fcf,
      leveredFCF,
      cash,
      totalCurrentAssets,
      ppe: closingPPE,
      totalAssets,
      shortTermDebt,
      totalCurrentLiabilities,
      longTermDebt,
      totalLiabilities,
      retainedEarningsAdd,
      equity,
      totalLiabilitiesAndEquity,
      bsCheck,
    });

    // Roll forward
    prevRevenue = revenue;
    prevPPE = closingPPE;
    prevDebt = closingDebt;
    prevCash = closingCash;
    prevNWC = nwc;
    prevEquity = equity;
  }

  return years;
}

export function calcDCF(
  a: DCFAssumptions,
  hist: FinancialPeriod[],
  scenario: "bear" | "base" | "bull" = "base"
): DCFOutput {
  const wacc = deriveWACC(a, scenario);
  const projectedYears = projectThreeStatements(a, hist, scenario);

  const pvFcfs = projectedYears.map((y, i) =>
    y.fcf / Math.pow(1 + wacc, i + 0.5) // mid-year convention
  );

  const lastFCF = projectedYears[projectedYears.length - 1].fcf;
  const terminalValue = wacc > a.terminalGrowthRate
    ? (lastFCF * (1 + a.terminalGrowthRate)) / (wacc - a.terminalGrowthRate)
    : 0;
  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, a.projectionYears);

  const sumPvFcf = pvFcfs.reduce((s, v) => s + v, 0);
  const enterpriseValue = sumPvFcf + pvTerminalValue;
  const equityValue = enterpriseValue - a.netDebt - a.minorityInterest;
  const ivps = a.sharesOutstanding > 0 ? equityValue / a.sharesOutstanding : 0;

  return {
    scenario,
    projectedYears,
    pvFcfs,
    terminalValue,
    pvTerminalValue,
    enterpriseValue,
    equityValue,
    ivps,
    tvPctOfEV: enterpriseValue > 0 ? pvTerminalValue / enterpriseValue : 0,
    sumPvFcf,
  };
}

// Auto-derive all drivers from historical financial data
export function deriveDriversFromHistory(hist: FinancialPeriod[]): Partial<DCFAssumptions> {
  const latest = hist[0];
  const rev = latest.revenue;
  const cogs = rev - latest.grossProfit;

  // WC Days — average over available history
  const avgARDays = hist.reduce((s, p) => s + (p.accountsReceivable ?? 0) / (p.revenue / 365), 0) / hist.length;
  const avgAPDays = hist.reduce((s, p) => s + (p.accountsPayable ?? 0) / ((p.revenue - p.grossProfit) / 365), 0) / hist.length;
  const avgInvDays = hist.reduce((s, p) => s + (p.inventory ?? 0) / ((p.revenue - p.grossProfit) / 365), 0) / hist.length;

  // CapEx and D&A as % of revenue
  const avgCapexPct = hist.reduce((s, p) => s + Math.abs(p.capex ?? 0) / p.revenue, 0) / hist.length;
  const avgDAPct = hist.reduce((s, p) => s + (p.depreciationAmortization ?? 0) / p.revenue, 0) / hist.length;

  // Tax rate from history
  const avgTaxRate = hist.reduce((s, p) => {
    const pretax = p.ebit - (p.interestExpense ?? 0);
    return pretax > 0 ? s + (p.taxExpense ?? 0) / pretax : s;
  }, 0) / hist.length;

  // Interest rate from history
  const latestDebt = (latest.shortTermDebt ?? 0) + (latest.longTermDebt ?? 0);
  const avgInterestRate = latestDebt > 0
    ? Math.abs(latest.interestExpense ?? 0) / latestDebt
    : 0.05;

  return {
    arDays: isFinite(avgARDays) && avgARDays > 0 ? Math.round(avgARDays) : 45,
    apDays: isFinite(avgAPDays) && avgAPDays > 0 ? Math.round(avgAPDays) : 35,
    inventoryDays: isFinite(avgInvDays) && avgInvDays > 0 ? Math.round(avgInvDays) : 30,
    capexPct: isFinite(avgCapexPct) && avgCapexPct > 0 ? avgCapexPct : 0.04,
    depreciationPct: isFinite(avgDAPct) && avgDAPct > 0 ? avgDAPct : 0.03,
    taxRate: isFinite(avgTaxRate) && avgTaxRate > 0 ? Math.min(avgTaxRate, 0.35) : 0.21,
    interestRate: isFinite(avgInterestRate) ? avgInterestRate : 0.05,
    openingDebt: latestDebt / 1e6,
    openingPPE: (latest.ppe ?? 0) / 1e6,
    openingCash: (latest.cash ?? 0) / 1e6,
    openingAR: (latest.accountsReceivable ?? 0) / 1e6,
    openingInventory: (latest.inventory ?? 0) / 1e6,
    openingAP: (latest.accountsPayable ?? 0) / 1e6,
    openingOtherAssets: Math.max(0, ((latest.totalAssets ?? 0) - (latest.cash ?? 0) - (latest.accountsReceivable ?? 0) - (latest.inventory ?? 0) - (latest.ppe ?? 0))) / 1e6,
    openingOtherLiabilities: Math.max(0, ((latest.totalLiabilities ?? 0) - (latest.shortTermDebt ?? 0) - (latest.longTermDebt ?? 0) - (latest.accountsPayable ?? 0))) / 1e6,
    openingEquity: (latest.equity ?? 0) / 1e6,
    debtRepaymentPct: 0.05,
    newDebtPct: 0,
    dividendPctNI: 0.15,
    buybackPctNI: 0.10,
  };
}
