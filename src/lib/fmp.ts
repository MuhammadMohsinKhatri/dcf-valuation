import type {
  FMPIncomeStatement,
  FMPBalanceSheet,
  FMPCashFlow,
  FMPProfile,
  CompanySearchResult,
} from "@/types/model";

const BASE = "https://financialmodelingprep.com/api/v3";

async function fmpGet<T>(path: string): Promise<T> {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY not configured");
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}apikey=${key}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`FMP error ${res.status}: ${path}`);
  return res.json();
}

export async function searchTicker(query: string): Promise<CompanySearchResult[]> {
  const data = await fmpGet<CompanySearchResult[]>(
    `/search?query=${encodeURIComponent(query)}&limit=10`
  );
  return data;
}

export async function getProfile(ticker: string): Promise<FMPProfile> {
  const data = await fmpGet<FMPProfile[]>(`/profile/${ticker}`);
  return data[0];
}

export async function getIncomeStatements(
  ticker: string,
  limit = 5
): Promise<FMPIncomeStatement[]> {
  return fmpGet<FMPIncomeStatement[]>(
    `/income-statement/${ticker}?limit=${limit}`
  );
}

export async function getBalanceSheets(
  ticker: string,
  limit = 5
): Promise<FMPBalanceSheet[]> {
  return fmpGet<FMPBalanceSheet[]>(
    `/balance-sheet-statement/${ticker}?limit=${limit}`
  );
}

export async function getCashFlows(
  ticker: string,
  limit = 5
): Promise<FMPCashFlow[]> {
  return fmpGet<FMPCashFlow[]>(
    `/cash-flow-statement/${ticker}?limit=${limit}`
  );
}

export async function getSharesOutstanding(ticker: string): Promise<number> {
  const profile = await getProfile(ticker);
  return profile.sharesOutstanding / 1e6; // return in millions
}
