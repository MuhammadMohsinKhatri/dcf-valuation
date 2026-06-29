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
        const text = await deepSeek(`You are a senior equity research analyst at Goldman Sachs. Write a professional one-page Investment Memo.

COMPANY: ${companyName} (${ticker}) | ${sector} | ${industry}
CURRENT PRICE: $${currentPrice} | BASE DCF: $${(baseIVPS as number).toFixed(2)} | UPSIDE: ${(upside * 100).toFixed(1)}%
BEAR / BASE / BULL IVPS: $${(bearIVPS as number).toFixed(2)} / $${(baseIVPS as number).toFixed(2)} / $${(bullIVPS as number).toFixed(2)}
LATEST REVENUE: $${(latest.revenue / 1e6).toFixed(0)}M | EBIT MARGIN: ${((latest.ebit / latest.revenue) * 100).toFixed(1)}%
WACC (BASE): ${(a.waccBase * 100).toFixed(1)}% | TERMINAL GROWTH: ${(a.terminalGrowthRate * 100).toFixed(1)}%

Write using these exact headers (markdown ## headers):
## Executive Summary
## Company Overview
## Investment Thesis
## Financial Performance & Outlook
## DCF Valuation
## Scenario Analysis
## Key Risks
## Catalysts
## Recommendation

Be specific, cite the numbers, write like a real Goldman Sachs analyst note. 600-800 words.`, 3000);
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

      default:
        return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI error" }, { status: 500 });
  }
}
