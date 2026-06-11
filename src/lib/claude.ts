import Anthropic from "@anthropic-ai/sdk";
import type { DCFAssumptions, AssumptionSource, FinancialPeriod } from "@/types/model";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface AssumptionsResponse {
  assumptions: DCFAssumptions;
  sources: AssumptionSource[];
  narrative: string;
}

export async function generateDCFAssumptions(
  ticker: string,
  companyName: string,
  sector: string,
  industry: string,
  historicalPeriods: FinancialPeriod[]
): Promise<AssumptionsResponse> {
  const historicalSummary = historicalPeriods
    .slice(0, 3)
    .map((p) => ({
      year: p.year,
      revenue: p.revenue,
      ebitMargin: p.ebit / p.revenue,
      revenueGrowth: undefined as number | undefined,
    }))
    .map((p, i, arr) => {
      if (i > 0) p.revenueGrowth = (arr[i - 1].revenue - arr[i].revenue) / arr[i].revenue;
      return p;
    });

  const latestPeriod = historicalPeriods[0];
  const avgRevenueGrowth =
    historicalPeriods.length > 1
      ? historicalPeriods.slice(0, -1).reduce((acc, p, i) => {
          const growth = (p.revenue - historicalPeriods[i + 1].revenue) / historicalPeriods[i + 1].revenue;
          return acc + growth;
        }, 0) / (historicalPeriods.length - 1)
      : 0.05;

  const prompt = `You are a senior equity research analyst building a DCF model for ${companyName} (${ticker}).

Company details:
- Sector: ${sector}
- Industry: ${industry}
- Latest revenue: $${(latestPeriod.revenue / 1e6).toFixed(0)}M
- Latest EBIT margin: ${((latestPeriod.ebit / latestPeriod.revenue) * 100).toFixed(1)}%
- 3-year avg revenue growth: ${(avgRevenueGrowth * 100).toFixed(1)}%
- Historical data: ${JSON.stringify(historicalSummary, null, 2)}

Generate realistic, defensible DCF assumptions for Bear/Base/Bull scenarios with 5-year projections.

Return ONLY valid JSON matching this exact schema:
{
  "assumptions": {
    "revenueGrowthBear": [number, number, number, number, number],
    "revenueGrowthBase": [number, number, number, number, number],
    "revenueGrowthBull": [number, number, number, number, number],
    "ebitMarginBear": number,
    "ebitMarginBase": number,
    "ebitMarginBull": number,
    "taxRate": number,
    "depreciationPct": number,
    "capexPct": number,
    "nwcChangePct": number,
    "terminalGrowthRate": number,
    "waccBear": number,
    "waccBase": number,
    "waccBull": number,
    "projectionYears": 5,
    "netDebt": number,
    "sharesOutstanding": number,
    "minorityInterest": 0,
    "revenueGrowthRates": [0,0,0,0,0]
  },
  "sources": [
    {
      "field": "string (field name)",
      "value": number,
      "source": "string (e.g., 'Company 10-K FY2023', 'Sector consensus', 'Bloomberg analyst estimates')",
      "rationale": "string (1-2 sentence explanation)"
    }
  ],
  "narrative": "string (2-3 paragraph analyst narrative explaining key assumptions and risks)"
}

All rates should be decimals (e.g., 0.05 for 5%). EBIT margins and growth rates must be realistic for the sector.
netDebt in millions. sharesOutstanding in millions.`;

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude did not return valid JSON");

  return JSON.parse(jsonMatch[0]) as AssumptionsResponse;
}
