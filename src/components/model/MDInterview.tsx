"use client";
import { useState, useMemo } from "react";
import type { DCFModel } from "@/types/model";

function calcIVPS(model: DCFModel, scenario: "bear" | "base" | "bull"): number {
  const a = model.assumptions;
  const hist = model.historicalPeriods;
  if (!hist.length) return 0;
  const growthKey = `revenueGrowth${scenario.charAt(0).toUpperCase() + scenario.slice(1)}` as keyof typeof a;
  const ebitMargin = scenario === "bear" ? a.ebitMarginBear : scenario === "bull" ? a.ebitMarginBull : a.ebitMarginBase;
  const wacc = scenario === "bear" ? a.waccBear : scenario === "bull" ? a.waccBull : a.waccBase;
  const growthRates = a[growthKey] as number[];
  let rev = hist[0].revenue / 1e6;
  const fcfs: number[] = [];
  const pvFcfs: number[] = [];
  for (let yr = 1; yr <= a.projectionYears; yr++) {
    rev *= (1 + growthRates[yr - 1]);
    const ebit = rev * ebitMargin;
    const nopat = ebit * (1 - a.taxRate);
    const fcf = nopat + rev * a.depreciationPct - rev * a.capexPct;
    fcfs.push(fcf);
    pvFcfs.push(fcf / Math.pow(1 + wacc, yr - 0.5));
  }
  if (wacc <= a.terminalGrowthRate) return 0;
  const tv = (fcfs[a.projectionYears - 1] * (1 + a.terminalGrowthRate)) / (wacc - a.terminalGrowthRate);
  const pvTV = tv / Math.pow(1 + wacc, a.projectionYears);
  const ev = pvFcfs.reduce((s, v) => s + v, 0) + pvTV;
  return (ev - a.netDebt - a.minorityInterest) / a.sharesOutstanding;
}

interface GradeResult {
  grade: string;
  score: number;
  correct: string[];
  missed: string[];
  idealAnswer: string;
  followUp: string;
}

const GRADE_COLOR: Record<string, string> = {
  A: "text-green-700 bg-green-50 border-green-300",
  B: "text-blue-700 bg-blue-50 border-blue-300",
  C: "text-yellow-700 bg-yellow-50 border-yellow-300",
  D: "text-orange-700 bg-orange-50 border-orange-300",
  F: "text-red-700 bg-red-50 border-red-300",
};

export function MDInterview({ model }: { model: DCFModel }) {
  const a = model.assumptions;
  const { baseIVPS } = useMemo(() => ({
    bearIVPS: calcIVPS(model, "bear"),
    baseIVPS: calcIVPS(model, "base"),
    bullIVPS: calcIVPS(model, "bull"),
  }), [model]);

  const questions = [
    `Why is your WACC ${(a.waccBase * 100).toFixed(1)}%? Walk me through the components.`,
    `Why did you choose ${(a.terminalGrowthRate * 100).toFixed(1)}% as your terminal growth rate?`,
    `Your base IVPS is $${baseIVPS.toFixed(2)} vs a current price of $${(model.currentPrice ?? 0).toFixed(2)}. How do you defend that?`,
    `Why is your EBIT margin ${(a.ebitMarginBase * 100).toFixed(1)}% in the base case? What drives margin expansion?`,
    `Why does your revenue growth ramp from ${(a.revenueGrowthBase[0] * 100).toFixed(1)}% to ${(a.revenueGrowthBase[a.projectionYears - 1] * 100).toFixed(1)}% over the projection period?`,
    `What's the single biggest risk to your base case? How have you reflected it in the model?`,
    `Why use a 5-year projection period? Why not 3 or 10 years?`,
    `Your CapEx is ${(a.capexPct * 100).toFixed(1)}% of revenue. Is that consistent with peers?`,
    `If free cash flow jumps significantly in year 3, what's driving that? Is it sustainable?`,
    `Why is Bear case only ${baseIVPS > 0 ? ((calcIVPS(model, "bear") - baseIVPS) / baseIVPS * 100).toFixed(0) : "X"}% below Base? Isn't that too narrow?`,
    `How sensitive is your valuation to WACC? Walk me through your sensitivity analysis.`,
    `Why isn't P/E ratio sufficient here? Why do you need a DCF at all?`,
  ];

  const [selectedQ, setSelectedQ] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Array<{ question: string; answer: string; grade: GradeResult }>>([]);
  const [sessionScore, setSessionScore] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);

  async function submitAnswer() {
    if (selectedQ === null || !answer.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "interview",
          ticker: model.ticker,
          companyName: model.companyName,
          question: questions[selectedQ],
          userAnswer: answer,
          modelStats: {
            wacc: a.waccBase, terminalGrowth: a.terminalGrowthRate, ebitMargin: a.ebitMarginBase,
            revenueGrowthBase: a.revenueGrowthBase, baseIVPS, currentPrice: model.currentPrice, ticker: model.ticker,
          },
        }),
      });
      const data = await res.json() as { result?: GradeResult; error?: string };
      if (data.error) { setError(data.error); return; }
      const g = data.result!;
      setGradeResult(g);
      setHistory((h) => [...h, { question: questions[selectedQ], answer, grade: g }]);
      setSessionScore((s) => s + g.score);
      setSessionCount((c) => c + 1);
    } catch { setError("AI request failed"); }
    finally { setLoading(false); }
  }

  function next() {
    setSelectedQ(null);
    setAnswer("");
    setGradeResult(null);
    setError("");
  }

  const avgScore = sessionCount > 0 ? Math.round(sessionScore / sessionCount) : 0;
  const sessionGrade = avgScore >= 90 ? "A" : avgScore >= 80 ? "B" : avgScore >= 70 ? "C" : avgScore >= 60 ? "D" : "F";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
        <div className="bg-gray-900 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base uppercase tracking-wide">MD Interview Mode</h2>
            <p className="text-gray-400 text-sm mt-1">
              Simulate a Managing Director grilling you on your {model.ticker} DCF model
            </p>
          </div>
          {sessionCount > 0 && (
            <div className={`flex flex-col items-center px-4 py-2 rounded-xl border ${GRADE_COLOR[sessionGrade]}`}>
              <span className="text-2xl font-bold">{sessionGrade}</span>
              <span className="text-xs">{avgScore}/100 avg</span>
              <span className="text-xs">{sessionCount} answered</span>
            </div>
          )}
        </div>
        <div className="bg-blue-900/20 border-b border-gray-200 px-6 py-3 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wide">Base IVPS</p>
            <p className="font-mono font-bold text-gray-900">${baseIVPS.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wide">Current Price</p>
            <p className="font-mono font-bold text-gray-900">${(model.currentPrice ?? 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wide">WACC (Base)</p>
            <p className="font-mono font-bold text-gray-900">{(a.waccBase * 100).toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Question selection */}
      {selectedQ === null && (
        <div>
          <p className="text-sm text-gray-500 mb-4">Select a question the MD would ask:</p>
          <div className="space-y-2">
            {questions.map((q, i) => {
              const answered = history.find((h) => h.question === q);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedQ(i)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 transition-colors group flex items-start gap-3"
                >
                  <span className="text-xs font-bold text-gray-400 mt-0.5 shrink-0">Q{i + 1}</span>
                  <span className="text-sm text-gray-800 flex-1">{q}</span>
                  {answered && (
                    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded border ${GRADE_COLOR[answered.grade.grade]}`}>
                      {answered.grade.grade}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active question */}
      {selectedQ !== null && !gradeResult && (
        <div className="space-y-4">
          <div className="bg-gray-900 text-white rounded-xl px-5 py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Managing Director asks:</p>
            <p className="text-base font-medium leading-relaxed">"{questions[selectedQ]}"</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide block mb-2">Your Answer</label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={6}
              placeholder="Type your answer here as you would explain it to an MD in a meeting…"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-400 outline-none resize-none"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button onClick={submitAnswer} disabled={!answer.trim() || loading}
              className="flex-1 bg-gray-900 text-white py-3 rounded-xl font-medium text-sm hover:bg-gray-700 disabled:opacity-40 transition-colors">
              {loading ? "Grading…" : "Submit Answer"}
            </button>
            <button onClick={next} className="px-6 py-3 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Grade result */}
      {gradeResult && (
        <div className="space-y-4">
          {/* Grade badge */}
          <div className={`rounded-xl border px-6 py-4 ${GRADE_COLOR[gradeResult.grade]}`}>
            <div className="flex items-center gap-4">
              <div className="text-5xl font-bold">{gradeResult.grade}</div>
              <div>
                <p className="font-bold text-base">{gradeResult.score}/100</p>
                <p className="text-sm opacity-80">
                  {gradeResult.score >= 85 ? "Excellent — ready to present to clients"
                    : gradeResult.score >= 70 ? "Good — minor gaps to address"
                    : gradeResult.score >= 55 ? "Needs work — review the key points"
                    : "Not ready — significant gaps in understanding"}
                </p>
              </div>
            </div>
          </div>

          {/* Question recap */}
          <div className="bg-gray-100 rounded-xl px-4 py-3 text-sm text-gray-700 italic">
            "{questions[selectedQ!]}"
          </div>

          {/* What they got right */}
          {gradeResult.correct?.length > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4">
              <p className="text-xs font-bold text-green-800 uppercase tracking-wide mb-2">What you got right</p>
              <ul className="space-y-1">
                {gradeResult.correct.map((c, i) => (
                  <li key={i} className="text-sm text-green-900 flex items-start gap-2">
                    <span className="text-green-500 shrink-0 mt-0.5">✓</span>{c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* What they missed */}
          {gradeResult.missed?.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
              <p className="text-xs font-bold text-red-800 uppercase tracking-wide mb-2">What you missed</p>
              <ul className="space-y-1">
                {gradeResult.missed.map((m, i) => (
                  <li key={i} className="text-sm text-red-900 flex items-start gap-2">
                    <span className="text-red-400 shrink-0 mt-0.5">✗</span>{m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Ideal answer */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
            <p className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2">Model Answer</p>
            <p className="text-sm text-blue-900 leading-relaxed">{gradeResult.idealAnswer}</p>
          </div>

          {/* Follow-up */}
          {gradeResult.followUp && (
            <div className="bg-gray-900 text-white rounded-xl px-5 py-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">MD Follow-up:</p>
              <p className="text-sm font-medium">"{gradeResult.followUp}"</p>
            </div>
          )}

          <button onClick={next} className="w-full bg-gray-900 text-white py-3 rounded-xl font-medium text-sm hover:bg-gray-700 transition-colors">
            Next Question
          </button>
        </div>
      )}

      {/* Session history */}
      {history.length > 0 && selectedQ === null && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Session History</p>
          <div className="space-y-2">
            {history.map((h, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className={`text-sm font-bold px-2 py-0.5 rounded border shrink-0 ${GRADE_COLOR[h.grade.grade]}`}>
                  {h.grade.grade}
                </span>
                <p className="text-sm text-gray-700">{h.question}</p>
                <span className="text-xs text-gray-400 shrink-0">{h.grade.score}/100</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
