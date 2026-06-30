import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { DashboardTable, type DashboardRow } from "@/components/model/DashboardTable";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const models = await prisma.dCFModel.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  const rows: DashboardRow[] = models.map((m) => {
    let currentPrice: number | undefined;
    let sector: string | undefined;
    let baseIVPS: number | undefined;

    try {
      const data = JSON.parse(m.modelData as string) as {
        currentPrice?: number;
        sector?: string;
        assumptions?: {
          revenueGrowthBase: number[];
          ebitMarginBase: number;
          taxRate: number;
          depreciationPct: number;
          capexPct: number;
          waccBase: number;
          terminalGrowthRate: number;
          projectionYears: number;
          netDebt: number;
          minorityInterest: number;
          sharesOutstanding: number;
        };
        historicalPeriods?: { revenue: number }[];
      };
      currentPrice = data.currentPrice;
      sector = data.sector;

      const a = data.assumptions;
      const hist = data.historicalPeriods;
      if (a && hist?.length) {
        let rev = hist[0].revenue / 1e6;
        const fcfs: number[] = [];
        const pvFcfs: number[] = [];
        for (let yr = 1; yr <= a.projectionYears; yr++) {
          rev *= (1 + a.revenueGrowthBase[yr - 1]);
          const nopat = rev * a.ebitMarginBase * (1 - a.taxRate);
          const fcf = nopat + rev * a.depreciationPct - rev * a.capexPct;
          fcfs.push(fcf);
          pvFcfs.push(fcf / Math.pow(1 + a.waccBase, yr - 0.5));
        }
        if (a.waccBase > a.terminalGrowthRate) {
          const tv = (fcfs[a.projectionYears - 1] * (1 + a.terminalGrowthRate)) / (a.waccBase - a.terminalGrowthRate);
          const pvTV = tv / Math.pow(1 + a.waccBase, a.projectionYears);
          const ev = pvFcfs.reduce((s, v) => s + v, 0) + pvTV;
          baseIVPS = (ev - a.netDebt - a.minorityInterest) / a.sharesOutstanding;
        }
      }
    } catch { /* skip */ }

    const upside = baseIVPS && currentPrice && currentPrice > 0
      ? ((baseIVPS - currentPrice) / currentPrice) * 100
      : undefined;

    const rec = baseIVPS && currentPrice && currentPrice > 0
      ? baseIVPS > currentPrice * 1.1 ? "BUY" as const
      : baseIVPS < currentPrice * 0.9 ? "SELL" as const
      : "HOLD" as const
      : undefined;

    return {
      id: m.id,
      ticker: m.ticker,
      companyName: m.companyName,
      sector,
      activeScenario: m.activeScenario,
      updatedAt: m.updatedAt.toISOString(),
      currentPrice,
      baseIVPS,
      rec,
      upside,
    };
  });

  const buyCount = rows.filter((r) => r.rec === "BUY").length;
  const sellCount = rows.filter((r) => r.rec === "SELL").length;
  const holdCount = rows.filter((r) => r.rec === "HOLD").length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-[#0f2744] tracking-tight">BOE DCF</span>
          <span className="text-gray-300 text-sm">|</span>
          <span className="text-xs text-gray-400 font-medium uppercase tracking-widest">Equity Valuation Platform</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">{session.user.name ?? session.user.email}</span>
          <Link href="/api/auth/signout">
            <Button variant="ghost" size="sm">Sign Out</Button>
          </Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Page header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Coverage Universe</h1>
            <p className="text-xs text-gray-400 mt-0.5 uppercase tracking-widest">BOE Group — Equity Research</p>
          </div>
          <Link href="/model/new">
            <Button size="sm">+ New Model</Button>
          </Link>
        </div>

        {/* Summary stats bar */}
        {rows.length > 0 && (
          <div className="bg-[#0f2744] rounded-xl px-6 py-4 mb-6 flex items-center gap-8 flex-wrap">
            <div>
              <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Models</p>
              <p className="text-2xl font-bold text-white font-mono">{rows.length}</p>
            </div>
            <div className="border-l border-blue-700 pl-8">
              <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Buy</p>
              <p className="text-2xl font-bold text-green-400 font-mono">{buyCount}</p>
            </div>
            <div className="border-l border-blue-700 pl-8">
              <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Hold</p>
              <p className="text-2xl font-bold text-amber-400 font-mono">{holdCount}</p>
            </div>
            <div className="border-l border-blue-700 pl-8">
              <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Sell</p>
              <p className="text-2xl font-bold text-red-400 font-mono">{sellCount}</p>
            </div>
            {rows.filter((r) => r.upside !== undefined).length > 0 && (
              <div className="border-l border-blue-700 pl-8">
                <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">Avg Upside</p>
                <p className={`text-2xl font-bold font-mono ${
                  (rows.reduce((s, r) => s + (r.upside ?? 0), 0) / rows.filter((r) => r.upside !== undefined).length) >= 0
                    ? "text-green-400" : "text-red-400"
                }`}>
                  {(() => {
                    const valid = rows.filter((r) => r.upside !== undefined);
                    const avg = valid.reduce((s, r) => s + (r.upside ?? 0), 0) / valid.length;
                    return `${avg >= 0 ? "+" : ""}${avg.toFixed(1)}%`;
                  })()}
                </p>
              </div>
            )}
            <div className="ml-auto text-right">
              <p className="text-[10px] text-blue-400 uppercase tracking-widest">BOE Group</p>
              <p className="text-[10px] text-blue-500">For Internal Use Only</p>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-16 text-center">
            <p className="text-gray-400 text-base mb-2 font-medium">No models yet</p>
            <p className="text-gray-300 text-sm mb-6">Build your first DCF to start coverage.</p>
            <Link href="/model/new">
              <Button>Build your first DCF</Button>
            </Link>
          </div>
        ) : (
          <DashboardTable rows={rows} />
        )}
      </main>
    </div>
  );
}
