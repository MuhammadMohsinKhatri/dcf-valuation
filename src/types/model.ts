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
  revenueGrowthRates: [number, number, number, number, number]; // 5-year [bear,base,bull] per year... simplified to per-scenario
  revenueGrowthBear: number[];
  revenueGrowthBase: number[];
  revenueGrowthBull: number[];
  ebitMarginBear: number;
  ebitMarginBase: number;
  ebitMarginBull: number;
  taxRate: number;
  depreciationPct: number; // % of revenue
  capexPct: number; // % of revenue
  nwcChangePct: number; // % of revenue change
  terminalGrowthRate: number;
  waccBear: number;
  waccBase: number;
  waccBull: number;
  projectionYears: number;
  netDebt: number;
  sharesOutstanding: number; // in millions
  minorityInterest: number;
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
  historicalPeriods: FinancialPeriod[];
  assumptions: DCFAssumptions;
  assumptionSources: AssumptionSource[];
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
  mktCap: number;
  sharesOutstanding: number;
  description: string;
  sector: string;
  industry: string;
  price: number;
}

