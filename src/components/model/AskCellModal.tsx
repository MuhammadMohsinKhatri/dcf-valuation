"use client";
import { useState } from "react";

interface Props {
  ticker: string;
  companyName: string;
  cellLabel: string;
  cellValue: string;
  modelContext?: Record<string, unknown>;
  children: React.ReactNode;
}

export function AskCell({ ticker, companyName, cellLabel, cellValue, modelContext, children }: Props) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Array<{ q: string; a: string }>>([]);

  async function ask(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ask_cell", ticker, companyName, question: q, cellLabel, cellValue, modelContext }),
      });
      const data = await res.json() as { result?: string; error?: string };
      if (data.error) { setError(data.error); return; }
      const a = data.result ?? "";
      setHistory((h) => [...h, { q, a }]);
      setAnswer(a);
      setQuestion("");
    } catch { setError("AI request failed"); }
    finally { setLoading(false); }
  }

  const suggested = [
    `Why is ${cellLabel} this value?`,
    `What drives ${cellLabel} higher or lower?`,
    `How does ${cellLabel} compare to industry?`,
    `What would change ${cellLabel} in the bull case?`,
  ];

  return (
    <>
      <span className="group relative inline-flex items-center gap-1">
        {children}
        <button
          onClick={() => setOpen(true)}
          title={`Ask AI about ${cellLabel}`}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-600 text-xs ml-0.5"
        >
          💬
        </button>
      </span>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gray-900 px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-white font-bold text-sm">💬 {cellLabel}</p>
                <p className="text-blue-300 font-mono text-xs">{cellValue}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>

            {/* Chat history */}
            <div className="px-5 py-3 max-h-72 overflow-y-auto space-y-4">
              {history.length === 0 && !loading && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Suggested questions</p>
                  <div className="flex flex-wrap gap-2">
                    {suggested.map((s) => (
                      <button key={s} onClick={() => ask(s)} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1 hover:bg-blue-100 transition-colors text-left">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {history.map(({ q, a }, i) => (
                <div key={i} className="space-y-2">
                  <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-900 font-medium">{q}</div>
                  <div className="text-sm text-gray-700 leading-relaxed pl-2 border-l-2 border-gray-200">{a}</div>
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Analyzing…
                </div>
              )}
              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>

            {/* Input */}
            <div className="px-5 pb-4 flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ask(question)}
                placeholder="Ask anything about this number…"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
              />
              <button
                onClick={() => ask(question)}
                disabled={!question.trim() || loading}
                className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-40 transition-colors"
              >
                Ask
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
