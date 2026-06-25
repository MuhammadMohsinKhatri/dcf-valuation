import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  searchTicker,
  getProfile,
  getIncomeStatements,
  getBalanceSheets,
  getCashFlows,
} from "@/lib/fmp";
import type { FinancialPeriod } from "@/types/model";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");
    const ticker = searchParams.get("ticker");

    if (action === "search") {
      const query = searchParams.get("q");
      if (!query) return NextResponse.json({ error: "Missing q" }, { status: 400 });
      const results = await searchTicker(query);
      return NextResponse.json(results);
    }

    if (action === "load" && ticker) {
      const [profile, income, balance, cashflow] = await Promise.all([
        getProfile(ticker),
        getIncomeStatements(ticker, 5),
        getBalanceSheets(ticker, 5),
        getCashFlows(ticker, 5),
      ]);

      const periods: FinancialPeriod[] = income.map((is, i) => {
        const bs = balance[i] ?? balance[0];
        const cf = cashflow[i] ?? cashflow[0];
        return {
          year: new Date(is.date).getFullYear(),
          revenue: is.revenue,
          cogs: is.costOfRevenue,
          grossProfit: is.grossProfit,
          operatingExpenses: is.operatingExpenses,
          ebit: is.operatingIncome,
          interestExpense: Math.abs(is.interestExpense),
          taxExpense: is.incomeTaxExpense,
          netIncome: is.netIncome,
          cash: bs.cashAndCashEquivalents,
          accountsReceivable: bs.netReceivables,
          inventory: bs.inventory,
          totalCurrentAssets: bs.totalCurrentAssets,
          ppe: bs.propertyPlantEquipmentNet,
          totalAssets: bs.totalAssets,
          accountsPayable: bs.accountPayables,
          shortTermDebt: bs.shortTermDebt,
          totalCurrentLiabilities: bs.totalCurrentLiabilities,
          longTermDebt: bs.longTermDebt,
          totalLiabilities: bs.totalLiabilities,
          equity: bs.totalStockholdersEquity,
          depreciationAmortization: is.depreciationAndAmortization,
          capex: Math.abs(cf.capitalExpenditure),
          changeInWorkingCapital: 0,
          operatingCashFlow: cf.operatingCashFlow,
          freeCashFlow: cf.freeCashFlow,
        };
      });

      const profileRaw = profile as unknown as Record<string, unknown>;
      console.log("=== FMP PROFILE RAW ===", JSON.stringify(profile));
      console.log("=== sharesOutstanding field ===", profileRaw.sharesOutstanding);
      console.log("=== mktCap field ===", profileRaw.mktCap);
      console.log("=== price field ===", profileRaw.price);

      const rawShares =
        (profileRaw.sharesOutstanding as number) ||
        (profileRaw.shares as number) ||
        (profileRaw.commonStock as number) ||
        0;

      const marketCap = (profileRaw.marketCap as number) || (profileRaw.mktCap as number) || 0;
      const price = (profileRaw.price as number) || 0;

      const sharesOutstandingM = rawShares > 1e6
        ? rawShares / 1e6
        : rawShares > 0
          ? rawShares
          : (marketCap && price ? (marketCap / price) / 1e6 : 0);

      console.log("=== sharesOutstandingM (final) ===", sharesOutstandingM, "marketCap:", marketCap, "price:", price);

      return NextResponse.json({
        profile,
        periods,
        netDebt: balance[0]?.netDebt ?? 0,
        sharesOutstanding: sharesOutstandingM,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Financials API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
