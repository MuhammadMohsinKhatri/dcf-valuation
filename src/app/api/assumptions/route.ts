import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateDCFAssumptions } from "@/lib/claude";
import type { FinancialPeriod } from "@/types/model";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker, companyName, sector, industry, historicalPeriods } =
    await req.json() as {
      ticker: string;
      companyName: string;
      sector: string;
      industry: string;
      historicalPeriods: FinancialPeriod[];
    };

  if (!ticker || !historicalPeriods?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const result = await generateDCFAssumptions(
    ticker,
    companyName,
    sector ?? "Unknown",
    industry ?? "Unknown",
    historicalPeriods
  );

  return NextResponse.json(result);
}
