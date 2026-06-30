"use client";
import { useState, useRef, useEffect } from "react";
import type { DCFModel } from "@/types/model";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  model: DCFModel;
  baseIVPS: number | null;
  bearIVPS: number | null;
  bullIVPS: number | null;
}


const SUGGESTED = [
  "Why is WACC set at this level?",
  "Explain the terminal value assumptions.",
  "What drives the bull case vs bear case?",
  "Challenge my revenue growth assumptions.",
  "What would Goldman Sachs question about this model?",
  "What are the key risks to the Base Case?",
  "How sensitive is IVPS to EBIT margin changes?",
  "Generate a one-sentence investment thesis.",
];

export function AnalystCopilot({ model, baseIVPS, bearIVPS, bullIVPS }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput("");
    const next: Message[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setLoading(true);

    try {
      const res = await fetch("/api/ai-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "copilot",
          ticker: model.ticker,
          companyName: model.companyName,
          sector: model.sector ?? "",
          industry: model.industry ?? "",
          question: q,
          history: next.slice(-6),
          modelSnapshot: {
            currentPrice: model.currentPrice ?? 0,
            baseIVPS,
            bearIVPS,
            bullIVPS,
            wacc: model.assumptions.waccBase,
            waccBear: model.assumptions.waccBear,
            waccBull: model.assumptions.waccBull,
            terminalGrowthRate: model.assumptions.terminalGrowthRate,
            ebitMarginBase: model.assumptions.ebitMarginBase,
            ebitMarginBear: model.assumptions.ebitMarginBear,
            ebitMarginBull: model.assumptions.ebitMarginBull,
            revenueGrowthBase: model.assumptions.revenueGrowthBase,
            taxRate: model.assumptions.taxRate,
            capexPct: model.assumptions.capexPct,
            depreciationPct: model.assumptions.depreciationPct,
            netDebt: model.assumptions.netDebt,
            sharesOutstanding: model.assumptions.sharesOutstanding,
            projectionYears: model.assumptions.projectionYears,
            latestRevenue: model.historicalPeriods[0]?.revenue ?? 0,
            latestEBIT: model.historicalPeriods[0]?.ebit ?? 0,
          },
        }),
      });
      const data = await res.json() as { result?: string; error?: string };
      setMessages([...next, { role: "assistant", content: data.result ?? data.error ?? "No response." }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Request failed. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-xl text-white text-sm font-semibold transition-all ${open ? "opacity-0 pointer-events-none" : "opacity-100"} bg-[#0f2744] hover:bg-[#1a3a5c]`}
      >
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
        BOE Analyst
      </button>

      {/* Sidebar panel */}
      <div className={`fixed inset-y-0 right-0 z-50 flex flex-col bg-white border-l border-gray-200 shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`} style={{ width: 400 }}>
        {/* Header */}
        <div className="bg-[#0f2744] px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-white font-bold text-sm">BOE Analyst Copilot</p>
            <p className="text-blue-300 text-xs mt-0.5">{model.ticker} · {model.companyName}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
              Live
            </span>
            <button onClick={() => setOpen(false)} className="text-blue-300 hover:text-white text-xl leading-none">×</button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="bg-[#1a3a5c] px-5 py-2 flex items-center gap-4 text-xs text-blue-200 flex-shrink-0">
          {baseIVPS && <span>Base IVPS <strong className="text-white">${baseIVPS.toFixed(2)}</strong></span>}
          {(model.currentPrice ?? 0) > 0 && <span>Price <strong className="text-white">${(model.currentPrice ?? 0).toFixed(2)}</strong></span>}
          {baseIVPS && (model.currentPrice ?? 0) > 0 && (
            <span className={baseIVPS >= (model.currentPrice ?? 0) ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
              {(((baseIVPS - (model.currentPrice ?? 0)) / (model.currentPrice ?? 0)) * 100).toFixed(1)}% upside
            </span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-4">
              <div className="bg-[#0f2744] rounded-xl px-4 py-3">
                <p className="text-white text-sm font-medium">Hello. I am your BOE Analyst Copilot.</p>
                <p className="text-blue-200 text-xs mt-1">I have full context on the {model.ticker} DCF model. Ask me anything about the assumptions, valuation, risks, or scenarios.</p>
              </div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Suggested questions</p>
              <div className="space-y-2">
                {SUGGESTED.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="w-full text-left text-xs text-gray-700 bg-gray-50 hover:bg-blue-50 hover:text-[#1a3a5c] border border-gray-200 hover:border-blue-200 rounded-lg px-3 py-2 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="w-6 h-6 rounded-full bg-[#0f2744] flex items-center justify-center text-white text-[9px] font-bold mr-2 mt-0.5 flex-shrink-0">
                  BOE
                </div>
              )}
              <div className={`max-w-[85%] rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-[#0f2744] text-white rounded-br-sm"
                  : "bg-gray-100 text-gray-800 rounded-bl-sm"
              }`}>
                <FormattedResponse text={m.content} isUser={m.role === "user"} />
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#0f2744] flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                BOE
              </div>
              <div className="bg-gray-100 rounded-xl px-4 py-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggested follow-ups (after first exchange) */}
        {messages.length > 0 && !loading && (
          <div className="px-4 pb-2 flex gap-2 overflow-x-auto flex-shrink-0">
            {["Key risks?", "Bull case drivers?", "Sensitivity?", "Compare to peers?"].map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="flex-shrink-0 text-xs border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-700 rounded-full px-3 py-1 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 pt-2 flex-shrink-0 border-t border-gray-100">
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about this model…"
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="flex-shrink-0 w-7 h-7 rounded-lg bg-[#0f2744] text-white flex items-center justify-center disabled:opacity-30 transition-opacity hover:bg-[#1a3a5c]"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">BOE AI Engine · For internal use only</p>
        </div>
      </div>

      {/* Overlay */}
      {open && <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setOpen(false)} />}
    </>
  );
}

function FormattedResponse({ text, isUser }: { text: string; isUser: boolean }) {
  if (isUser) return <span>{text}</span>;

  const lines = text.split("\n");
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (line.startsWith("• ") || line.startsWith("- ")) {
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[#1a3a5c] mt-0.5 shrink-0 text-xs">▸</span>
              <span>{line.slice(2)}</span>
            </div>
          );
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return <p key={i} className="font-bold text-gray-900">{line.slice(2, -2)}</p>;
        }
        if (line === "") return <div key={i} className="h-1" />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}
