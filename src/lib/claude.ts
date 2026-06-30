import type { DCFAssumptions, AssumptionSource, FinancialPeriod } from "@/types/model";
import { deriveDriversFromHistory } from "@/lib/projection";

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
  const derivedDrivers = deriveDriversFromHistory(historicalPeriods);
  const avgRevenueGrowth =
    historicalPeriods.length > 1
      ? historicalPeriods.slice(0, -1).reduce((acc, p, i) => {
          const growth = (p.revenue - historicalPeriods[i + 1].revenue) / historicalPeriods[i + 1].revenue;
          return acc + growth;
        }, 0) / (historicalPeriods.length - 1)
      : 0.05;

  const latestDebt = ((latestPeriod.shortTermDebt ?? 0) + (latestPeriod.longTermDebt ?? 0)) / 1e6;
  const latestCash = (latestPeriod.cash ?? 0) / 1e6;

  const prompt = `You are a senior equity research analyst at Goldman Sachs building an institutional DCF model for ${companyName} (${ticker}).

COMPANY: ${sector} / ${industry}
LATEST REVENUE: $${(latestPeriod.revenue / 1e6).toFixed(0)}M
LATEST EBIT MARGIN: ${((latestPeriod.ebit / latestPeriod.revenue) * 100).toFixed(1)}%
3Y AVG REVENUE GROWTH: ${(avgRevenueGrowth * 100).toFixed(1)}%
TOTAL DEBT: $${latestDebt.toFixed(0)}M | CASH: $${latestCash.toFixed(0)}M
HISTORICAL DATA: ${JSON.stringify(historicalSummary, null, 2)}

AUTO-DERIVED DRIVERS FROM HISTORICAL DATA (use as starting point, adjust for outlook):
- AR Days: ${derivedDrivers.arDays} | AP Days: ${derivedDrivers.apDays} | Inventory Days: ${derivedDrivers.inventoryDays}
- CapEx %: ${((derivedDrivers.capexPct ?? 0) * 100).toFixed(1)}% | D&A %: ${((derivedDrivers.depreciationPct ?? 0) * 100).toFixed(1)}%
- Tax Rate: ${((derivedDrivers.taxRate ?? 0) * 100).toFixed(1)}% | Interest Rate: ${((derivedDrivers.interestRate ?? 0) * 100).toFixed(1)}%

Generate institutional-quality Bear/Base/Bull DCF assumptions. Return ONLY valid JSON:
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
    "revenueGrowthRates": [0,0,0,0,0],
    "arDays": number,
    "apDays": number,
    "inventoryDays": number,
    "openingDebt": number,
    "interestRate": number,
    "debtRepaymentPct": number,
    "newDebtPct": number,
    "openingPPE": number,
    "dividendPctNI": number,
    "buybackPctNI": number,
    "openingCash": number,
    "openingAR": number,
    "openingInventory": number,
    "openingAP": number,
    "openingOtherAssets": number,
    "openingOtherLiabilities": number,
    "openingEquity": number
  },
  "sources": [
    { "field": "string", "value": number, "source": "string", "rationale": "string" }
  ],
  "narrative": "string — structured with these exact bold headers on separate lines: **Business Overview** **Investment Thesis** **Revenue Drivers** **Margin Outlook** **Capital Allocation** **Key Risks** **Valuation Summary** **Why Bull Case** **Why Bear Case** — each followed by 2-3 sentences of institutional-quality equity research analysis"
}

Rules:
- All rates as decimals (0.05 = 5%)
- netDebt, openingDebt, openingPPE, openingCash, openingAR, openingInventory, openingAP, openingOtherAssets, openingOtherLiabilities, openingEquity all in $M
- sharesOutstanding in millions
- debtRepaymentPct: annual % of debt repaid (typically 0.05–0.10)
- dividendPctNI: dividends as % of net income (0 if no dividend history)
- buybackPctNI: buybacks as % of net income (check historical capital returns)
- Narrative must sound like Goldman Sachs equity research, not generic commentary`;

  // --- Claude (commented out, using DeepSeek) ---
  // const { default: Anthropic } = await import("@anthropic-ai/sdk");
  // const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // const message = await client.messages.create({
  //   model: "claude-opus-4-8",
  //   max_tokens: 4000,
  //   messages: [{ role: "user", content: prompt }],
  // });
  // const text = message.content[0].type === "text" ? message.content[0].text : "";

  // --- DeepSeek ---
  console.log("=== AI PROVIDER: DeepSeek | Model: deepseek-chat | Key:", process.env.DEEPSEEK_API_KEY?.slice(0, 8) + "..." + " ===");
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${err}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  const text = data.choices?.[0]?.message?.content ?? "";

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("DeepSeek did not return valid JSON");
  const jsonStr = text.slice(start, end + 1);

  let parsed: AssumptionsResponse;
  try {
    parsed = JSON.parse(jsonStr) as AssumptionsResponse;
  } catch {
    const safe = jsonStr.replace(/"narrative"\s*:\s*"[\s\S]*?"(?=\s*[},])/, '"narrative": ""');
    parsed = JSON.parse(safe) as AssumptionsResponse;
    parsed.narrative = "AI narrative unavailable — assumptions generated successfully.";
  }

  // Merge derived drivers as fallback for any missing fields
  parsed.assumptions = {
    ...derivedDrivers,
    ...parsed.assumptions,
  } as typeof parsed.assumptions;

  return parsed;
}
