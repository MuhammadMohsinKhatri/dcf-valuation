"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TickerSearch } from "@/components/model/TickerSearch";
import { Button } from "@/components/ui/Button";
import type { CompanySearchResult, FinancialPeriod, DCFAssumptions, DCFModel } from "@/types/model";

const DEFAULT_ASSUMPTIONS: DCFAssumptions = {
  revenueGrowthRates: [0.05, 0.05, 0.05, 0.05, 0.05],
  revenueGrowthBear: [0.02, 0.02, 0.02, 0.02, 0.02],
  revenueGrowthBase: [0.05, 0.05, 0.05, 0.04, 0.04],
  revenueGrowthBull: [0.1, 0.09, 0.08, 0.07, 0.06],
  ebitMarginBear: 0.1,
  ebitMarginBase: 0.15,
  ebitMarginBull: 0.2,
  taxRate: 0.21,
  depreciationPct: 0.04,
  capexPct: 0.05,
  nwcChangePct: 0.03,
  terminalGrowthRate: 0.025,
  waccBear: 0.11,
  waccBase: 0.09,
  waccBull: 0.08,
  projectionYears: 5,
  netDebt: 0,
  sharesOutstanding: 100,
  minorityInterest: 0,
};

export default function NewModelPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<CompanySearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function buildModel() {
    if (!selected) return;
    setLoading(true);
    setStatus("Loading financials...");

    const fin = await fetch(
      `/api/financials?action=load&ticker=${selected.symbol}`
    ).then((r) => r.json());

    setStatus("Generating AI assumptions...");

    const aiRes = await fetch("/api/assumptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: selected.symbol,
        companyName: selected.name,
        sector: fin.profile?.sector ?? "Unknown",
        industry: fin.profile?.industry ?? "Unknown",
        historicalPeriods: fin.periods,
      }),
    }).then((r) => r.json());

    const assumptions: DCFAssumptions = {
      ...DEFAULT_ASSUMPTIONS,
      ...aiRes.assumptions,
      netDebt: fin.netDebt / 1e6,
      sharesOutstanding: fin.sharesOutstanding,
    };

    setStatus("Saving model...");

    const model: Partial<DCFModel> = {
      ticker: selected.symbol,
      companyName: selected.name,
      currency: selected.currency ?? "USD",
      historicalPeriods: fin.periods,
      assumptions,
      assumptionSources: aiRes.sources ?? [],
      activeScenario: "base",
    };

    const save = await fetch("/api/model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(model),
    }).then((r) => r.json());

    router.push(`/model/${save.id}`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <span className="text-xl font-bold text-blue-700">Fable DCF</span>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-16 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">New DCF Model</h1>
        <p className="text-gray-500 mb-10">
          Search for a company to auto-load 5 years of financials and generate AI-assisted assumptions.
        </p>

        <div className="flex flex-col items-center gap-6">
          <TickerSearch onSelect={setSelected} />

          {selected && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 w-full max-w-md text-left">
              <p className="font-mono font-bold text-blue-700 text-xl">{selected.symbol}</p>
              <p className="text-gray-700 mt-1">{selected.name}</p>
              <p className="text-xs text-gray-400 mt-1">{selected.exchangeShortName}</p>
            </div>
          )}

          {status && (
            <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 px-4 py-2 rounded-full">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              {status}
            </div>
          )}

          <Button
            onClick={buildModel}
            disabled={!selected}
            loading={loading}
            size="lg"
            className="px-10"
          >
            Build Model →
          </Button>
        </div>
      </main>
    </div>
  );
}
