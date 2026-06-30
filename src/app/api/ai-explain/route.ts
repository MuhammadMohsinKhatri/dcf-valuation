import { NextRequest, NextResponse } from "next/server";

async function deepSeek(prompt: string, maxTokens = 2000): Promise<string> {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Record<string, unknown>;
  const { mode } = body as { mode: string };

  try {
    switch (mode) {
      // ── 1. Explain a specific assumption ────────────────────────────────────
      case "explain_assumption": {
        const { ticker, companyName, sector, assumptionKey, value, bearValue, bullValue, historicalAvg } = body as Record<string, string | number>;
        const text = await deepSeek(`You are a senior equity research analyst at Goldman Sachs.

Explain why this DCF assumption is set to the given value for ${companyName} (${ticker}, ${sector}).

Assumption: ${assumptionKey}
Base Value: ${value}
Bear Value: ${bearValue ?? "N/A"}
Bull Value: ${bullValue ?? "N/A"}
Historical Average: ${historicalAvg ?? "N/A"}

Return ONLY a JSON object:
{
  "summary": "one sentence bottom line",
  "bullets": ["bullet 1", "bullet 2", "bullet 3", "bullet 4"],
  "confidence": 85,
  "confidenceReason": "one sentence why confidence is this level"
}`);
        const s = text.indexOf("{"), e = text.lastIndexOf("}");
        if (s !== -1 && e !== -1) {
          try { return NextResponse.json({ result: JSON.parse(text.slice(s, e + 1)) }); } catch { /**/ }
        }
        return NextResponse.json({ result: { summary: text, bullets: [], confidence: 75, confidenceReason: "" } });
      }

      // ── 2. Ask about any cell ────────────────────────────────────────────────
      case "ask_cell": {
        const { ticker, companyName, question, cellLabel, cellValue, modelContext } = body as Record<string, unknown>;
        const text = await deepSeek(`You are a senior equity research analyst at Goldman Sachs.

A user is asking about a metric in the DCF model for ${companyName} (${ticker}):
Metric: ${cellLabel}
Value: ${cellValue}
Question: "${question}"

Model context: ${JSON.stringify(modelContext)}

Answer in 3-5 sentences, specifically referencing the numbers. Be direct and analytical.`);
        return NextResponse.json({ result: text });
      }

      // ── 3. MD Interview — grade an answer ───────────────────────────────────
      case "interview": {
        const { ticker, companyName, question, userAnswer, modelStats } = body as Record<string, unknown>;
        const text = await deepSeek(`You are a Managing Director at Goldman Sachs grading a junior analyst's answer about their DCF for ${companyName} (${ticker}).

Model: ${JSON.stringify(modelStats)}
MD Question: "${question}"
Analyst Answer: "${userAnswer}"

Return ONLY JSON:
{
  "grade": "A"|"B"|"C"|"D"|"F",
  "score": 0-100,
  "correct": ["what they got right..."],
  "missed": ["what they missed..."],
  "idealAnswer": "2-3 sentence model answer",
  "followUp": "one harder follow-up question"
}`, 1500);
        const s = text.indexOf("{"), e = text.lastIndexOf("}");
        if (s !== -1 && e !== -1) {
          try { return NextResponse.json({ result: JSON.parse(text.slice(s, e + 1)) }); } catch { /**/ }
        }
        return NextResponse.json({ result: { grade: "B", score: 70, correct: [], missed: [], idealAnswer: text, followUp: "" } });
      }

      // ── 4. Generate investment memo ──────────────────────────────────────────
      case "memo": {
        const { ticker, companyName, sector, industry, currentPrice, bearIVPS, baseIVPS, bullIVPS, assumptions, historicalPeriods } = body as Record<string, unknown>;
        const hist = historicalPeriods as Array<{ revenue: number; ebit: number; year: number }>;
        const latest = hist[0];
        const a = assumptions as Record<string, number>;
        const upside = ((baseIVPS as number) - (currentPrice as number)) / (currentPrice as number);
        const text = await deepSeek(`You are a senior equity research analyst at Goldman Sachs writing a full institutional investment memorandum.

COMPANY: ${companyName} (${ticker}) | ${sector} | ${industry}
CURRENT PRICE: $${currentPrice} | BASE DCF: $${(baseIVPS as number).toFixed(2)} | UPSIDE: ${(upside * 100).toFixed(1)}%
BEAR / BASE / BULL IVPS: $${(bearIVPS as number).toFixed(2)} / $${(baseIVPS as number).toFixed(2)} / $${(bullIVPS as number).toFixed(2)}
LATEST REVENUE: $${(latest.revenue / 1e6).toFixed(0)}M | EBIT MARGIN: ${((latest.ebit / latest.revenue) * 100).toFixed(1)}%
WACC (BASE): ${(a.waccBase * 100).toFixed(1)}% | TERMINAL GROWTH: ${(a.terminalGrowthRate * 100).toFixed(1)}%
REV GROWTH (BASE YR1): ${((assumptions as { revenueGrowthBase: number[] }).revenueGrowthBase[0] * 100).toFixed(1)}% | TAX RATE: ${(a.taxRate * 100).toFixed(1)}%

Write the memo using EXACTLY these 12 section headers on their own lines (use ## prefix):
## Recommendation
## Investment Thesis
## Business Overview
## Catalysts
## Financial Forecast
## DCF Summary
## Comparable Valuation
## Scenario Analysis
## Key Risks
## ESG Considerations
## Management
## Appendix

Rules:
- Each section 3-6 sentences or bullet points
- Reference specific numbers from the data above
- Write like a Goldman Sachs analyst note — direct, data-driven, no filler
- Use bullet points (starting with •) where appropriate
- Total 800-1000 words`, 4000);
        return NextResponse.json({ result: text });
      }

      // ── 5. QC review ────────────────────────────────────────────────────────
      case "qc": {
        const { ticker, companyName, assumptions, historicalPeriods, bearIVPS, baseIVPS, bullIVPS, currentPrice } = body as Record<string, unknown>;
        const hist = historicalPeriods as Array<{ revenue: number; ebit: number; year: number }>;
        const latest = hist[0];
        const a = assumptions as Record<string, number | number[]>;
        const text = await deepSeek(`You are a DCF model auditor. Review this model and find issues.

${companyName} (${ticker})
Current Price: $${currentPrice} | Bear: $${(bearIVPS as number).toFixed(2)} | Base: $${(baseIVPS as number).toFixed(2)} | Bull: $${(bullIVPS as number).toFixed(2)}
Revenue: $${(latest.revenue / 1e6).toFixed(0)}M | EBIT Margin: ${((latest.ebit / latest.revenue) * 100).toFixed(1)}%
Revenue Growth Base: ${(a.revenueGrowthBase as number[]).map((v) => (v * 100).toFixed(1) + "%").join(", ")}
EBIT: Bear ${((a.ebitMarginBear as number) * 100).toFixed(1)}% / Base ${((a.ebitMarginBase as number) * 100).toFixed(1)}% / Bull ${((a.ebitMarginBull as number) * 100).toFixed(1)}%
WACC: Bear ${((a.waccBear as number) * 100).toFixed(1)}% / Base ${((a.waccBase as number) * 100).toFixed(1)}% / Bull ${((a.waccBull as number) * 100).toFixed(1)}%
Terminal Growth: ${((a.terminalGrowthRate as number) * 100).toFixed(1)}% | Tax: ${((a.taxRate as number) * 100).toFixed(1)}%
CapEx: ${((a.capexPct as number) * 100).toFixed(1)}% | D&A: ${((a.depreciationPct as number) * 100).toFixed(1)}%

Return ONLY JSON:
{
  "score": 0-100,
  "grade": "A"|"B"|"C"|"D"|"F",
  "critical": [{"issue": "string", "detail": "string"}],
  "warnings": [{"issue": "string", "detail": "string"}],
  "passed": ["string"],
  "recommendations": ["string"]
}`, 2000);
        const s = text.indexOf("{"), e = text.lastIndexOf("}");
        if (s !== -1 && e !== -1) {
          try { return NextResponse.json({ result: JSON.parse(text.slice(s, e + 1)) }); } catch { /**/ }
        }
        return NextResponse.json({ result: { score: 75, grade: "B", critical: [], warnings: [], passed: [], recommendations: [text] } });
      }

      // ── 6. Scenario difference explanation ──────────────────────────────────
      case "scenario_diff": {
        const { ticker, companyName, assumptions, bearIVPS, baseIVPS, bullIVPS } = body as Record<string, unknown>;
        const a = assumptions as Record<string, number | number[]>;
        const text = await deepSeek(`You are a senior equity analyst. Explain the scenario differences for ${companyName} (${ticker}).

Bear: $${(bearIVPS as number).toFixed(2)} | Base: $${(baseIVPS as number).toFixed(2)} | Bull: $${(bullIVPS as number).toFixed(2)}
Key drivers:
- Revenue growth Yr1: Bear ${((a.revenueGrowthBear as number[])[0] * 100).toFixed(1)}% / Base ${((a.revenueGrowthBase as number[])[0] * 100).toFixed(1)}% / Bull ${((a.revenueGrowthBull as number[])[0] * 100).toFixed(1)}%
- EBIT margin: Bear ${((a.ebitMarginBear as number) * 100).toFixed(1)}% / Base ${((a.ebitMarginBase as number) * 100).toFixed(1)}% / Bull ${((a.ebitMarginBull as number) * 100).toFixed(1)}%
- WACC: Bear ${((a.waccBear as number) * 100).toFixed(1)}% / Base ${((a.waccBase as number) * 100).toFixed(1)}% / Bull ${((a.waccBull as number) * 100).toFixed(1)}%

Return JSON:
{
  "bear": {"headline": "string", "drivers": ["string", "string", "string"]},
  "base": {"headline": "string", "drivers": ["string", "string", "string"]},
  "bull": {"headline": "string", "drivers": ["string", "string", "string"]},
  "keySwing": "one sentence about the single biggest swing factor"
}`);
        const s = text.indexOf("{"), e = text.lastIndexOf("}");
        if (s !== -1 && e !== -1) {
          try { return NextResponse.json({ result: JSON.parse(text.slice(s, e + 1)) }); } catch { /**/ }
        }
        return NextResponse.json({ result: text });
      }

      // ── 7. Explain a full financial statement section ───────────────────────
      case "explain_statement": {
        const { ticker, companyName, sector, section, keyMetrics } = body as Record<string, unknown>;
        const sectionPrompts: Record<string, string> = {
          income_statement: `Explain the income statement for ${companyName} (${ticker}, ${sector}). Cover: revenue growth drivers, gross margin trend, EBIT margin quality, and what the net income trajectory signals about the business. Key metrics: ${JSON.stringify(keyMetrics)}`,
          balance_sheet: `Explain the balance sheet for ${companyName} (${ticker}, ${sector}). Cover: liquidity position, leverage and debt structure, working capital health, and capital allocation signals. Key metrics: ${JSON.stringify(keyMetrics)}`,
          cash_flow: `Explain the cash flow statement for ${companyName} (${ticker}, ${sector}). Cover: FCF conversion quality vs net income, capex intensity and what it signals, operating cash flow sustainability, and cash generation trend. Key metrics: ${JSON.stringify(keyMetrics)}`,
          dcf: `Explain the DCF valuation for ${companyName} (${ticker}, ${sector}). Cover: why these FCF projections are reasonable, WACC justification, terminal value as % of EV and what it implies, and the key risks to the valuation. Key metrics: ${JSON.stringify(keyMetrics)}`,
          per_share: `Explain the per share summary for ${companyName} (${ticker}, ${sector}). Cover: earnings power per share trend, FCF yield vs current price, book value vs intrinsic value, and what the per share metrics signal about shareholder value creation. Key metrics: ${JSON.stringify(keyMetrics)}`,
        };
        const prompt = `You are a senior equity research analyst at Goldman Sachs.

${sectionPrompts[section as string] ?? `Analyze ${section} for ${companyName} (${ticker})`}

Return ONLY a JSON object:
{
  "summary": "one strong analytical sentence — the key takeaway",
  "bullets": ["bullet 1", "bullet 2", "bullet 3", "bullet 4"],
  "confidence": 85,
  "confidenceReason": "one sentence why confidence is this level"
}`;
        const text = await deepSeek(prompt);
        const s = text.indexOf("{"), e = text.lastIndexOf("}");
        if (s !== -1 && e !== -1) {
          try { return NextResponse.json({ result: JSON.parse(text.slice(s, e + 1)) }); } catch { /**/ }
        }
        return NextResponse.json({ result: { summary: text, bullets: [], confidence: 75, confidenceReason: "" } });
      }

      // ── 8. DCF Executive Summary ────────────────────────────────────────────
      case "executive_summary": {
        const { ticker, companyName, sector, industry, currentPrice, baseIVPS, bearIVPS, bullIVPS, upside, recommendation, wacc, terminalGrowthRate, ebitMarginBase, revenueGrowthAvg, latestRevenue, latestEBITMargin, projectionYears } = body as Record<string, unknown>;
        const text = await deepSeek(`You are a senior equity research analyst at Goldman Sachs writing the executive summary section of an institutional research note.

Company: ${companyName} (${ticker}) | ${sector} | ${industry}
Current Price: $${currentPrice} | Base IVPS: $${(baseIVPS as number).toFixed(2)} | Bear: $${(bearIVPS as number).toFixed(2)} | Bull: $${(bullIVPS as number).toFixed(2)}
Implied Upside: ${upside !== null ? (upside as number).toFixed(1) : "N/A"}% | Model Recommendation: ${recommendation}
WACC: ${((wacc as number) * 100).toFixed(1)}% | Terminal Growth: ${((terminalGrowthRate as number) * 100).toFixed(1)}%
EBIT Margin (Base): ${((ebitMarginBase as number) * 100).toFixed(1)}% | Rev Growth (Avg): ${((revenueGrowthAvg as number) * 100).toFixed(1)}%
Latest Revenue: $${(latestRevenue as number).toFixed(0)}M | Latest EBIT Margin: ${(latestEBITMargin as number).toFixed(1)}%
Projection Period: ${projectionYears} years

Return ONLY a JSON object with exactly these fields:
{
  "investmentView": "2-3 sentence analytical investment view — specific, data-driven, referencing the numbers. Write like a Goldman analyst note opening.",
  "recommendation": "${recommendation}",
  "conviction": "High" or "Medium" or "Low",
  "keyDrivers": ["driver 1 (concise)", "driver 2", "driver 3", "driver 4"],
  "keyRisks": ["risk 1 (concise)", "risk 2", "risk 3", "risk 4"]
}`, 800);
        const s = text.indexOf("{"), e = text.lastIndexOf("}");
        if (s !== -1 && e !== -1) {
          try { return NextResponse.json({ result: JSON.parse(text.slice(s, e + 1)) }); } catch { /**/ }
        }
        return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
      }

      // ── 9. Analyst Copilot ──────────────────────────────────────────────────
      case "copilot": {
        const { ticker, companyName, sector, industry, question, history, modelSnapshot } = body as Record<string, unknown>;
        const snap = modelSnapshot as Record<string, unknown>;
        const hist = (history as Array<{ role: string; content: string }> ?? []);

        const systemPrompt = `You are a senior equity research analyst at Goldman Sachs, acting as an AI copilot for the BOE DCF platform. You have deep expertise in DCF modeling, financial statement analysis, and institutional equity research.

You are analyzing ${companyName} (${ticker}), sector: ${sector}, industry: ${industry}.

Current model snapshot:
- Current Price: $${snap.currentPrice}
- Base IVPS: $${typeof snap.baseIVPS === "number" ? (snap.baseIVPS as number).toFixed(2) : "N/A"}
- Bear IVPS: $${typeof snap.bearIVPS === "number" ? (snap.bearIVPS as number).toFixed(2) : "N/A"}
- Bull IVPS: $${typeof snap.bullIVPS === "number" ? (snap.bullIVPS as number).toFixed(2) : "N/A"}
- Base WACC: ${typeof snap.wacc === "number" ? ((snap.wacc as number) * 100).toFixed(1) : "N/A"}%
- Bear/Bull WACC: ${typeof snap.waccBear === "number" ? ((snap.waccBear as number) * 100).toFixed(1) : "N/A"}% / ${typeof snap.waccBull === "number" ? ((snap.waccBull as number) * 100).toFixed(1) : "N/A"}%
- Terminal Growth Rate: ${typeof snap.terminalGrowthRate === "number" ? ((snap.terminalGrowthRate as number) * 100).toFixed(1) : "N/A"}%
- EBIT Margin (Bear/Base/Bull): ${typeof snap.ebitMarginBear === "number" ? ((snap.ebitMarginBear as number) * 100).toFixed(1) : "N/A"}% / ${typeof snap.ebitMarginBase === "number" ? ((snap.ebitMarginBase as number) * 100).toFixed(1) : "N/A"}% / ${typeof snap.ebitMarginBull === "number" ? ((snap.ebitMarginBull as number) * 100).toFixed(1) : "N/A"}%
- Revenue Growth (Base, Yr1): ${Array.isArray(snap.revenueGrowthBase) ? (((snap.revenueGrowthBase as number[])[0]) * 100).toFixed(1) : "N/A"}%
- Tax Rate: ${typeof snap.taxRate === "number" ? ((snap.taxRate as number) * 100).toFixed(1) : "N/A"}%
- CapEx %: ${typeof snap.capexPct === "number" ? ((snap.capexPct as number) * 100).toFixed(1) : "N/A"}%
- D&A %: ${typeof snap.depreciationPct === "number" ? ((snap.depreciationPct as number) * 100).toFixed(1) : "N/A"}%
- Net Debt: $${snap.netDebt}M
- Shares Outstanding: ${snap.sharesOutstanding}M
- Projection Years: ${snap.projectionYears}
- Latest Revenue: $${typeof snap.latestRevenue === "number" ? ((snap.latestRevenue as number) / 1e6).toFixed(0) : "N/A"}M
- Latest EBIT Margin: ${typeof snap.latestEBIT === "number" && typeof snap.latestRevenue === "number" && (snap.latestRevenue as number) > 0 ? (((snap.latestEBIT as number) / (snap.latestRevenue as number)) * 100).toFixed(1) : "N/A"}%

Respond like a Goldman Sachs analyst — direct, precise, data-driven. Reference specific numbers from the model. Use bullet points (•) for lists. Keep responses under 200 words unless the question demands depth. Do not hedge excessively. Give a definitive analytical view.`;

        const messages = [
          { role: "system", content: systemPrompt },
          ...hist.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: question as string },
        ];

        const res = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
          body: JSON.stringify({ model: "deepseek-chat", max_tokens: 600, messages }),
        });
        if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
        const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
        return NextResponse.json({ result: data.choices?.[0]?.message?.content ?? "" });
      }

      default:
        return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI error" }, { status: 500 });
  }
}
