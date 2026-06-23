import type {
  FMPIncomeStatement,
  FMPBalanceSheet,
  FMPCashFlow,
  FMPProfile,
  CompanySearchResult,
} from "@/types/model";

const BASE_V3 = "https://financialmodelingprep.com/api/v3";
const BASE_STABLE = "https://financialmodelingprep.com/stable";

function buildUrl(base: string, path: string, params: Record<string, string> = {}): string {
  const key = process.env.FMP_API_KEY;
  if (!key || key === "your-fmp-api-key-here") throw new Error("FMP_API_KEY not configured");
  const q = new URLSearchParams({ ...params, apikey: key }).toString();
  return `${base}${path}?${q}`;
}

async function fmpFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`FMP error ${res.status}: ${url.split("?")[0].replace("https://financialmodelingprep.com", "")}`);
  return res.json();
}

async function fmpGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  // Try stable API first, fall back to v3
  try {
    return await fmpFetch<T>(buildUrl(BASE_STABLE, path, params));
  } catch (e1) {
    try {
      return await fmpFetch<T>(buildUrl(BASE_V3, path, params));
    } catch {
      throw e1;
    }
  }
}

export async function searchTicker(query: string): Promise<CompanySearchResult[]> {
  const params = { query, limit: "10" };
  // Try multiple search endpoints
  const paths = ["/search", "/search-ticker", "/search-name"];
  for (const path of paths) {
    try {
      const data = await fmpFetch<CompanySearchResult[]>(buildUrl(BASE_STABLE, path, params));
      if (Array.isArray(data)) return data;
    } catch { /* try next */ }
    try {
      const data = await fmpFetch<CompanySearchResult[]>(buildUrl(BASE_V3, path, params));
      if (Array.isArray(data)) return data;
    } catch { /* try next */ }
  }
  throw new Error("Search unavailable — enter the ticker symbol directly (e.g. AAPL, MSFT)");
}

export async function getProfile(ticker: string): Promise<FMPProfile> {
  // stable uses ?symbol=, v3 uses /profile/{ticker}
  try {
    const data = await fmpFetch<FMPProfile[]>(buildUrl(BASE_STABLE, "/profile", { symbol: ticker }));
    if (Array.isArray(data) && data[0]) return data[0];
    throw new Error("No profile data");
  } catch {
    const data = await fmpFetch<FMPProfile[]>(buildUrl(BASE_V3, `/profile/${ticker}`));
    return data[0];
  }
}

export async function getIncomeStatements(ticker: string, limit = 5): Promise<FMPIncomeStatement[]> {
  try {
    const data = await fmpFetch<FMPIncomeStatement[]>(
      buildUrl(BASE_STABLE, "/income-statement", { symbol: ticker, limit: String(limit) })
    );
    if (Array.isArray(data)) return data;
    throw new Error("empty");
  } catch {
    return fmpFetch<FMPIncomeStatement[]>(
      buildUrl(BASE_V3, `/income-statement/${ticker}`, { limit: String(limit) })
    );
  }
}

export async function getBalanceSheets(ticker: string, limit = 5): Promise<FMPBalanceSheet[]> {
  try {
    const data = await fmpFetch<FMPBalanceSheet[]>(
      buildUrl(BASE_STABLE, "/balance-sheet-statement", { symbol: ticker, limit: String(limit) })
    );
    if (Array.isArray(data)) return data;
    throw new Error("empty");
  } catch {
    return fmpFetch<FMPBalanceSheet[]>(
      buildUrl(BASE_V3, `/balance-sheet-statement/${ticker}`, { limit: String(limit) })
    );
  }
}

export async function getCashFlows(ticker: string, limit = 5): Promise<FMPCashFlow[]> {
  try {
    const data = await fmpFetch<FMPCashFlow[]>(
      buildUrl(BASE_STABLE, "/cash-flow-statement", { symbol: ticker, limit: String(limit) })
    );
    if (Array.isArray(data)) return data;
    throw new Error("empty");
  } catch {
    return fmpFetch<FMPCashFlow[]>(
      buildUrl(BASE_V3, `/cash-flow-statement/${ticker}`, { limit: String(limit) })
    );
  }
}

export async function getSharesOutstanding(ticker: string): Promise<number> {
  const profile = await getProfile(ticker);
  return profile.sharesOutstanding / 1e6;
}
