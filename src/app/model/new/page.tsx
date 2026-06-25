"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { DCFAssumptions, DCFModel, CompanySearchResult } from "@/types/model";

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

// Common company name → ticker lookup (works without FMP search)
const NAME_MAP: Record<string, string> = {
  apple: "AAPL", microsoft: "MSFT", google: "GOOGL", alphabet: "GOOGL",
  amazon: "AMZN", meta: "META", facebook: "META", tesla: "TSLA",
  nvidia: "NVDA", netflix: "NFLX", salesforce: "CRM", adobe: "ADBE",
  intel: "INTC", amd: "AMD", qualcomm: "QCOM", broadcom: "AVGO",
  paypal: "PYPL", visa: "V", mastercard: "MA", jpmorgan: "JPM",
  "bank of america": "BAC", goldman: "GS", "morgan stanley": "MS",
  berkshire: "BRK.B", johnson: "JNJ", pfizer: "PFE", unitedhealth: "UNH",
  walmart: "WMT", disney: "DIS", nike: "NKE", cocacola: "KO",
  "coca cola": "KO", pepsi: "PEP", pepsico: "PEP", exxon: "XOM",
  chevron: "CVX", boeing: "BA", caterpillar: "CAT", "3m": "MMM",
  uber: "UBER", lyft: "LYFT", airbnb: "ABNB", spotify: "SPOT",
  twitter: "X", snap: "SNAP", pinterest: "PINS", shopify: "SHOP",
  square: "SQ", block: "SQ", palantir: "PLTR", snowflake: "SNOW",
  crowdstrike: "CRWD", datadog: "DDOG", twilio: "TWLO", zoom: "ZM",
  oracle: "ORCL", ibm: "IBM", cisco: "CSCO", dell: "DELL", hp: "HPQ",
  amc: "AMC", gamestop: "GME", rivian: "RIVN", lucid: "LCID",
};

function resolveInput(input: string): string | null {
  const lower = input.trim().toLowerCase();
  if (NAME_MAP[lower]) return NAME_MAP[lower];
  // Check if any key starts with the input
  for (const [name, sym] of Object.entries(NAME_MAP)) {
    if (name.startsWith(lower) && lower.length >= 3) return sym;
  }
  return null;
}

export default function NewModelPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ symbol: string; name: string }[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); setShowDrop(false); return; }

    // First: instant local lookup
    const lower = query.trim().toLowerCase();
    const local: { symbol: string; name: string }[] = [];
    for (const [name, sym] of Object.entries(NAME_MAP)) {
      if (name.includes(lower) || sym.toLowerCase().includes(lower)) {
        local.push({ symbol: sym, name: name.replace(/\b\w/g, (c) => c.toUpperCase()) });
      }
    }
    const seen = new Set<string>();
    const deduped = local.filter((s) => { if (seen.has(s.symbol)) return false; seen.add(s.symbol); return true; });
    if (deduped.length > 0) { setSuggestions(deduped.slice(0, 8)); setShowDrop(true); }

    // Then: try FMP search in background
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/financials?action=search&q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setSuggestions(data.slice(0, 8).map((d: CompanySearchResult) => ({ symbol: d.symbol, name: d.name })));
          setShowDrop(true);
        }
      } catch { /* FMP search unavailable, local results already shown */ }
    }, 400);
  }, [query]);

  function pickSuggestion(sym: string, name: string) {
    setQuery(`${sym} — ${name}`);
    setSelectedTicker(sym);
    setShowDrop(false);
  }

  async function buildModel() {
    // Resolve ticker: use selected, or local map, or treat input as direct ticker
    let sym = selectedTicker;
    if (!sym) {
      const resolved = resolveInput(query);
      sym = resolved ?? query.trim().toUpperCase().split(/[\s—]+/)[0];
    }
    if (!sym) return;

    setLoading(true);
    setError("");
    setStatus("Loading financials...");

    const finRes = await fetch(`/api/financials?action=load&ticker=${sym}`);
    const finText = await finRes.text();
    if (!finText) { setError("Empty response from server"); setLoading(false); setStatus(""); return; }
    let fin: Record<string, unknown>;
    try { fin = JSON.parse(finText); } catch { setError(`Invalid response: ${finText.slice(0, 200)}`); setLoading(false); setStatus(""); return; }
    if (fin.error) { setError(`Could not load financials: ${fin.error}`); setLoading(false); setStatus(""); return; }

    setStatus("Generating AI assumptions...");
    const aiRaw = await fetch("/api/assumptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: sym,
        companyName: (fin.profile as Record<string, unknown>)?.companyName ?? sym,
        sector: (fin.profile as Record<string, unknown>)?.sector ?? "Unknown",
        industry: (fin.profile as Record<string, unknown>)?.industry ?? "Unknown",
        historicalPeriods: fin.periods,
      }),
    });
    const aiRes = aiRaw.ok ? await aiRaw.json() : {};

    const assumptions: DCFAssumptions = {
      ...DEFAULT_ASSUMPTIONS,
      ...aiRes.assumptions,
      netDebt: (fin.netDebt as number) / 1e6,
      sharesOutstanding: fin.sharesOutstanding as number,
    };

    setStatus("Saving model...");
    const model: Partial<DCFModel> = {
      ticker: sym,
      companyName: (fin.profile as Record<string, unknown>)?.companyName as string ?? sym,
      currency: (fin.profile as Record<string, unknown>)?.currency as string ?? "USD",
      currentPrice: (fin.profile as Record<string, unknown>)?.price as number ?? 0,
      historicalPeriods: fin.periods as DCFModel["historicalPeriods"],
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
        <span className="text-xl font-bold text-blue-700">BOE DCF</span>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-16 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">New DCF Model</h1>
        <p className="text-gray-500 mb-10">
          Search by company name or ticker symbol.
        </p>

        <div className="flex flex-col items-center gap-6">
          <div className="w-full max-w-md relative">
            <Input
              label="Company Name or Ticker"
              placeholder="Apple, Tesla, MSFT, GOOGL..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelectedTicker(""); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !loading) { setShowDrop(false); buildModel(); } if (e.key === "Escape") setShowDrop(false); }}
              onFocus={() => suggestions.length > 0 && setShowDrop(true)}
              onBlur={() => setTimeout(() => setShowDrop(false), 150)}
            />
            {showDrop && suggestions.length > 0 && (
              <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
                {suggestions.map((s) => (
                  <li
                    key={s.symbol}
                    className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-blue-50 text-sm"
                    onMouseDown={() => pickSuggestion(s.symbol, s.name)}
                  >
                    <span className="font-mono font-bold text-blue-700 mr-3">{s.symbol}</span>
                    <span className="text-gray-700 flex-1 text-left">{s.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <div className="w-full max-w-md text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">
              {error}
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
            disabled={!query.trim()}
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
