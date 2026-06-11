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

    // Merge into unified FinancialPeriod objects
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
        changeInWorkingCapital: 0, // derived
        operatingCashFlow: cf.operatingCashFlow,
        freeCashFlow: cf.freeCashFlow,
      };
    });

    return NextResponse.json({
      profile,
      periods,
      netDebt: balance[0]?.netDebt ?? 0,
      sharesOutstanding: (profile.sharesOutstanding ?? 0) / 1e6,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
