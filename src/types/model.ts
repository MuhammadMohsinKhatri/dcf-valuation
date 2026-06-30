export type Scenario = "bear" | "base" | "bull";

export interface FinancialPeriod {
  year: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  ebit: number;
  interestExpense: number;
  taxExpense: number;
  netIncome: number;
  // Balance sheet
  cash: number;
  accountsReceivable: number;
  inventory: number;
  totalCurrentAssets: number;
  ppe: number;
  totalAssets: number;
  accountsPayable: number;
  shortTermDebt: number;
  totalCurrentLiabilities: number;
  longTermDebt: number;
  totalLiabilities: number;
  equity: number;
  // Cash flow
  depreciationAmortization: number;
  capex: number;
  changeInWorkingCapital: number;
  operatingCashFlow: number;
  freeCashFlow: number;
}

export interface DCFAssumptions {
  revenueGrowthRates: [number, number, number, number, number];
  revenueGrowthBear: number[];
  revenueGrowthBase: number[];
  revenueGrowthBull: number[];
  ebitMarginBear: number;
  ebitMarginBase: number;
  ebitMarginBull: number;
  taxRate: number;
  depreciationPct: number;   // D&A as % of revenue
  capexPct: number;          // CapEx as % of revenue
  nwcChangePct: number;      // legacy — replaced by WC days below
  terminalGrowthRate: number;
  waccBear: number;
  waccBase: number;
  waccBull: number;
  projectionYears: number;
  netDebt: number;           // $M
  sharesOutstanding: number; // millions
  minorityInterest: number;  // $M

  // Working Capital Schedule (days)
  arDays: number;            // AR / Revenue * 365
  apDays: number;            // AP / COGS * 365
  inventoryDays: number;     // Inventory / COGS * 365

  // Debt Schedule
  openingDebt: number;       // Total debt at start of projection ($M)
  interestRate: number;      // Interest rate on debt (decimal)
  debtRepaymentPct: number;  // % of opening debt repaid per year
  newDebtPct: number;        // New debt raised as % of CapEx

  // PP&E Roll-forward
  openingPPE: number;        // Net PP&E at start of projection ($M)

  // Financing
  dividendPctNI: number;     // Dividends as % of Net Income
  buybackPctNI: number;      // Share buybacks as % of Net Income

  // Opening Balance Sheet items ($M)
  openingCash: number;
  openingAR: number;
  openingInventory: number;
  openingAP: number;
  openingOtherAssets: number;
  openingOtherLiabilities: number;
  openingEquity: number;
}

export interface AssumptionSource {
  field: string;
  value: number;
  source: string;
  rationale: string;
}

export interface DCFModel {
  id: string;
  userId: string;
  ticker: string;
  companyName: string;
  currency: string;
  currentPrice?: number;
  sector?: string;
  industry?: string;
  historicalPeriods: FinancialPeriod[];
  assumptions: DCFAssumptions;
  assumptionSources: AssumptionSource[];
  aiNarrative?: string;
  activeScenario: Scenario;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySearchResult {
  symbol: string;
  name: string;
  exchangeShortName: string;
  currency: string;
}

export interface FMPIncomeStatement {
  date: string;
  symbol: string;
  revenue: number;
  costOfRevenue: number;
  grossProfit: number;
  operatingExpenses: number;
  operatingIncome: number;
  interestExpense: number;
  incomeTaxExpense: number;
  netIncome: number;
  eps: number;
  depreciationAndAmortization: number;
}

export interface FMPBalanceSheet {
  date: string;
  cashAndCashEquivalents: number;
  netReceivables: number;
  inventory: number;
  totalCurrentAssets: number;
  propertyPlantEquipmentNet: number;
  totalAssets: number;
  accountPayables: number;
  shortTermDebt: number;
  totalCurrentLiabilities: number;
  longTermDebt: number;
  totalLiabilities: number;
  totalStockholdersEquity: number;
  totalDebt: number;
  netDebt: number;
}

export interface FMPCashFlow {
  date: string;
  operatingCashFlow: number;
  capitalExpenditure: number;
  freeCashFlow: number;
  netChangeInCash: number;
}

export interface FMPProfile {
  symbol: string;
  companyName: string;
  currency: string;
  mktCap?: number;
  marketCap?: number;
  sharesOutstanding?: number;
  description: string;
  sector: string;
  industry: string;
  price: number;
}

