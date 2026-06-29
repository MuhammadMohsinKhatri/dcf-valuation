import { NextRequest, NextResponse } from "next/server";

const FMP_KEY = process.env.FMP_API_KEY ?? "";
const FMP = "https://financialmodelingprep.com/api";

export interface PeerMetrics {
  symbol: string;
  name: string;
  marketCap: number;
  peRatioTTM: number | null;
  evToEbitdaTTM: number | null;
  evToRevenueTTM: number | null;
  priceToBookRatioTTM: number | null;
  pfcfRatioTTM: number | null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  // 1. Get peer list
  const peersData = await fetchJson<Array<{ symbol: string; peersList: string[] }>>(
    `${FMP}/v4/stock_peers?symbol=${ticker}&apikey=${FMP_KEY}`
  );
  const peerSymbols: string[] = peersData?.[0]?.peersList?.slice(0, 8) ?? [];

  if (!peerSymbols.length) {
    return NextResponse.json({ peers: [] });
  }

  // 2. Fetch key metrics TTM + profile for each peer (parallel)
  const results = await Promise.allSettled(
    peerSymbols.map(async (sym): Promise<PeerMetrics> => {
      const [metrics, profile] = await Promise.all([
        fetchJson<Array<Record<string, number>>>(
          `${FMP}/v3/key-metrics-ttm/${sym}?apikey=${FMP_KEY}`
        ),
        fetchJson<Array<{ companyName: string; mktCap: number }>>(
          `${FMP}/v3/profile/${sym}?apikey=${FMP_KEY}`
        ),
      ]);

      const m = (metrics?.[0] ?? {}) as Record<string, number>;
      const p = (profile?.[0] ?? {}) as { companyName?: string; mktCap?: number };

      return {
        symbol: sym,
        name: p.companyName ?? sym,
        marketCap: (p.mktCap ?? 0) / 1e9, // in $B
        peRatioTTM: typeof m.peRatioTTM === "number" && isFinite(m.peRatioTTM) ? m.peRatioTTM : null,
        evToEbitdaTTM:
          typeof m.enterpriseValueOverEBITDATTM === "number" && isFinite(m.enterpriseValueOverEBITDATTM)
            ? m.enterpriseValueOverEBITDATTM
            : null,
        evToRevenueTTM:
          typeof m.evToSalesTTM === "number" && isFinite(m.evToSalesTTM) ? m.evToSalesTTM : null,
        priceToBookRatioTTM:
          typeof m.pbRatioTTM === "number" && isFinite(m.pbRatioTTM) ? m.pbRatioTTM : null,
        pfcfRatioTTM:
          typeof m.pfcfRatioTTM === "number" && isFinite(m.pfcfRatioTTM) ? m.pfcfRatioTTM : null,
      };
    })
  );

  const peers: PeerMetrics[] = results
    .filter((r): r is PromiseFulfilledResult<PeerMetrics> => r.status === "fulfilled")
    .map((r) => r.value);

  return NextResponse.json({ peers });
}
