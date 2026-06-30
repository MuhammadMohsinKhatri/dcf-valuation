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
    const nopat = rev * ebitMargin * (1 - a.taxRate);
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

const MEMO_SECTIONS = [
  { key: "Recommendation",         accent: "border-green-500",  label: "REC"  },
  { key: "Investment Thesis",       accent: "border-[#0f2744]",  label: "THESIS" },
  { key: "Business Overview",       accent: "border-slate-500",  label: "BIZ"  },
  { key: "Catalysts",               accent: "border-blue-500",   label: "CAT"  },
  { key: "Financial Forecast",      accent: "border-indigo-500", label: "FIN"  },
  { key: "DCF Summary",             accent: "border-[#1a3a5c]",  label: "DCF"  },
  { key: "Comparable Valuation",    accent: "border-purple-500", label: "COMP" },
  { key: "Scenario Analysis",       accent: "border-amber-500",  label: "SCEN" },
  { key: "Key Risks",               accent: "border-red-500",    label: "RISK" },
  { key: "ESG Considerations",      accent: "border-emerald-500",label: "ESG"  },
  { key: "Management",              accent: "border-gray-500",   label: "MGMT" },
  { key: "Appendix",                accent: "border-gray-400",   label: "APP"  },
] as const;

type SectionKey = typeof MEMO_SECTIONS[number]["key"];

interface ParsedMemo {
  sections: { key: SectionKey; body: string }[];
  raw: string;
}

function parseMemo(text: string): ParsedMemo {
  const result: { key: SectionKey; body: string }[] = [];
  const keys = MEMO_SECTIONS.map((s) => s.key);

  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(?:##\\s*${escaped}|\\*\\*${escaped}\\*\\*)\\s*\\n([\\s\\S]*?)(?=##\\s*(?:${keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})|\\*\\*(?:${keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\*\\*|$)`,
      "i"
    );
    const m = text.match(re);
    if (m?.[1]?.trim()) {
      result.push({ key, body: m[1].trim() });
    }
  }

  return { sections: result, raw: text };
}

function MemoSection({ sectionKey, body }: { sectionKey: SectionKey; body: string }) {
  const meta = MEMO_SECTIONS.find((s) => s.key === sectionKey)!;
  const lines = body.split("\n").filter(Boolean);

  return (
    <div className={`border-l-4 ${meta.accent} pl-5 py-1`}>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[9px] font-bold tracking-widest text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{meta.label}</span>
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest">{sectionKey}</h3>
      </div>
      <div className="space-y-1.5">
        {lines.map((line, i) => {
          const isBullet = line.startsWith("•") || line.startsWith("-") || line.startsWith("*");
          const cleaned = isBullet ? line.replace(/^[•\-\*]\s*/, "") : line.replace(/\*\*(.*?)\*\*/g, "$1");
          if (isBullet) {
            return (
              <div key={i} className="flex items-start gap-2">
                <span className="text-gray-300 mt-1 text-xs shrink-0">▸</span>
                <p className="text-sm text-gray-700 leading-relaxed">{cleaned}</p>
              </div>
            );
          }
          return <p key={i} className="text-sm text-gray-700 leading-relaxed">{cleaned}</p>;
        })}
      </div>
    </div>
  );
}

export function InvestmentMemo({ model }: { model: DCFModel }) {
  const [loading, setLoading] = useState(false);
  const [memo, setMemo] = useState<ParsedMemo | null>(null);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<SectionKey | "all">("all");

  const { bearIVPS, baseIVPS, bullIVPS } = useMemo(() => ({
    bearIVPS: calcIVPS(model, "bear"),
    baseIVPS: calcIVPS(model, "base"),
    bullIVPS: calcIVPS(model, "bull"),
  }), [model]);

  const currentPrice = model.currentPrice ?? 0;
  const upside = currentPrice > 0 ? ((baseIVPS - currentPrice) / currentPrice * 100) : null;
  const rec = baseIVPS > currentPrice * 1.1 ? "BUY" : baseIVPS < currentPrice * 0.9 ? "SELL" : "HOLD";
  const recColors = { BUY: "bg-green-700", SELL: "bg-red-700", HOLD: "bg-amber-600" };

  async function generate() {
    setLoading(true);
    setError("");
    setMemo(null);
    try {
      const res = await fetch("/api/ai-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "memo",
          ticker: model.ticker,
          companyName: model.companyName,
          sector: model.sector,
          industry: model.industry,
          currentPrice,
          bearIVPS, baseIVPS, bullIVPS,
          assumptions: model.assumptions,
          historicalPeriods: model.historicalPeriods,
        }),
      });
      const data = await res.json() as { result?: string; error?: string };
      if (data.error) { setError(data.error); return; }
      setMemo(parseMemo(data.result ?? ""));
      setActiveSection("all");
    } catch { setError("AI request failed"); }
    finally { setLoading(false); }
  }

  function printMemo() {
    if (!memo) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${model.ticker} — Investment Memorandum</title>
<style>
  body { font-family: Calibri, sans-serif; max-width: 820px; margin: 48px auto; padding: 0 48px; font-size: 12px; line-height: 1.65; color: #111; }
  .header { border-bottom: 3px solid #0f2744; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { font-size: 20px; margin: 0 0 4px; color: #0f2744; }
  .header p { margin: 2px 0; color: #555; font-size: 11px; }
  .badge { display: inline-block; padding: 3px 12px; border-radius: 4px; font-weight: bold; font-size: 13px; color: white; }
  .buy { background: #166534; } .sell { background: #991b1b; } .hold { background: #92400e; }
  .stats { display: flex; gap: 32px; background: #f8fafc; padding: 12px 16px; border-radius: 6px; margin: 16px 0; }
  .stat p { margin: 0; } .stat .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; }
  .stat .val { font-size: 14px; font-weight: bold; color: #0f2744; font-family: monospace; }
  .section { margin: 20px 0; padding-left: 16px; border-left: 3px solid #0f2744; }
  .section h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #0f2744; margin: 0 0 6px; }
  .section p { margin: 4px 0; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; }
</style></head><body>
<div class="header">
  <p style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.1em">BOE Group — Equity Research</p>
  <h1>${model.companyName} (${model.ticker})</h1>
  <p>${model.sector ?? ""}${model.industry ? " · " + model.industry : ""}</p>
  <p style="margin-top:8px"><span class="badge ${rec.toLowerCase()}">${rec}</span></p>
</div>
<div class="stats">
  <div class="stat"><p class="label">Bear IVPS</p><p class="val" style="color:#991b1b">$${bearIVPS.toFixed(2)}</p></div>
  <div class="stat"><p class="label">Base IVPS</p><p class="val">$${baseIVPS.toFixed(2)}</p></div>
  <div class="stat"><p class="label">Bull IVPS</p><p class="val" style="color:#166534">$${bullIVPS.toFixed(2)}</p></div>
  <div class="stat"><p class="label">Current Price</p><p class="val" style="color:#374151">$${currentPrice.toFixed(2)}</p></div>
  ${upside !== null ? `<div class="stat"><p class="label">Upside</p><p class="val" style="color:${upside >= 0 ? "#166534" : "#991b1b"}">${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%</p></div>` : ""}
</div>
${memo.sections.map((s) => `<div class="section"><h3>${s.key}</h3>${s.body.split("\n").filter(Boolean).map((l) => `<p>${l.replace(/^[•\-\*]\s*/, "").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</p>`).join("")}</div>`).join("")}
<div class="footer">Generated by BOE DCF Platform · BOE AI Engine · For internal research purposes only · Not investment advice · ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
</body></html>`);
    w.document.close();
    w.print();
  }

  const visibleSections = memo
    ? activeSection === "all"
      ? memo.sections
      : memo.sections.filter((s) => s.key === activeSection)
    : [];

  return (
    <div className="space-y-5">

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-[#0f2744] px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">BOE Group — Equity Research</p>
            <h2 className="text-white font-bold text-base mt-0.5">{model.companyName} ({model.ticker})</h2>
            <p className="text-blue-300 text-xs mt-0.5">{model.sector}{model.industry ? ` · ${model.industry}` : ""}</p>
          </div>
          <span className={`${recColors[rec as keyof typeof recColors]} text-white font-bold text-xl px-6 py-2.5 rounded-xl`}>{rec}</span>
        </div>

        {/* Stats strip */}
        <div className="bg-white px-6 py-3.5 flex items-center gap-6 flex-wrap border-b border-gray-100">
          {[
            { label: "Bear IVPS",    value: `$${bearIVPS.toFixed(2)}`,  color: "text-red-700"   },
            { label: "Base IVPS",    value: `$${baseIVPS.toFixed(2)}`,  color: "text-[#0f2744]" },
            { label: "Bull IVPS",    value: `$${bullIVPS.toFixed(2)}`,  color: "text-green-700" },
            { label: "Current",      value: `$${currentPrice.toFixed(2)}`, color: "text-gray-700" },
            ...(upside !== null ? [{ label: "Upside", value: `${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%`, color: upside >= 0 ? "text-green-700" : "text-red-700" }] : []),
            { label: "WACC (Base)",  value: `${(model.assumptions.waccBase * 100).toFixed(1)}%`, color: "text-gray-700" },
            { label: "TGR",          value: `${(model.assumptions.terminalGrowthRate * 100).toFixed(1)}%`, color: "text-gray-700" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
              <p className={`text-sm font-bold font-mono ${color}`}>{value}</p>
            </div>
          ))}
          <div className="ml-auto flex gap-2">
            <button
              onClick={generate}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#0f2744] text-white rounded-lg hover:bg-[#1a3a5c] disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />Generating…</>
              ) : memo ? "Regenerate" : "Generate Memo"}
            </button>
            {memo && (
              <button onClick={printMemo} className="px-4 py-2 text-xs font-semibold border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                Print / PDF
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">{error}</div>}

      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-[#0f2744] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">BOE AI Engine generating 12-section investment memorandum…</p>
        </div>
      )}

      {memo && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Section nav */}
          <div className="border-b border-gray-100 px-5 py-3 flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveSection("all")}
              className={`flex-shrink-0 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full transition-colors ${activeSection === "all" ? "bg-[#0f2744] text-white" : "text-gray-500 hover:text-gray-700 bg-gray-100"}`}
            >
              All Sections
            </button>
            {memo.sections.map((s) => {
              const meta = MEMO_SECTIONS.find((m) => m.key === s.key)!;
              return (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(s.key)}
                  className={`flex-shrink-0 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full transition-colors ${activeSection === s.key ? "bg-[#0f2744] text-white" : "text-gray-500 hover:text-gray-700 bg-gray-100"}`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>

          {/* Memo content */}
          <div className="px-8 py-6">
            {/* Letterhead */}
            {activeSection === "all" && (
              <div className="border-b-2 border-[#0f2744] pb-5 mb-7">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">BOE Group — Equity Research · Investment Memorandum</p>
                <h1 className="text-2xl font-bold text-gray-900 mt-1">{model.companyName} ({model.ticker})</h1>
                <p className="text-sm text-gray-500 mt-0.5">{model.sector}{model.industry ? ` · ${model.industry}` : ""}</p>
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  <span className={`${recColors[rec as keyof typeof recColors]} text-white text-xs font-bold px-3 py-1 rounded`}>{rec}</span>
                  <span className="text-sm text-gray-600">Base Target: <strong className="text-[#0f2744]">${baseIVPS.toFixed(2)}</strong></span>
                  {upside !== null && (
                    <span className="text-sm text-gray-600">Upside: <strong className={upside >= 0 ? "text-green-700" : "text-red-700"}>{upside >= 0 ? "+" : ""}{upside.toFixed(1)}%</strong></span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto">BOE AI Engine · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                </div>
              </div>
            )}

            <div className="space-y-7">
              {visibleSections.map((s) => (
                <MemoSection key={s.key} sectionKey={s.key} body={s.body} />
              ))}
            </div>

            {activeSection === "all" && (
              <div className="mt-8 pt-5 border-t border-gray-100 text-xs text-gray-400">
                This memorandum was generated by BOE DCF Platform using BOE AI Engine. It is for internal research purposes only and does not constitute investment advice or a solicitation to buy or sell securities. All projections are estimates and subject to material uncertainty.
              </div>
            )}
          </div>
        </div>
      )}

      {!memo && !loading && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-500 mb-1">12-Section Investment Memorandum</p>
          <p className="text-xs text-gray-400 mb-5 max-w-md mx-auto">
            Generates a Goldman Sachs-style research note covering Recommendation, Investment Thesis, Business Overview, Catalysts, Financial Forecast, DCF Summary, Comparable Valuation, Scenario Analysis, Key Risks, ESG, Management, and Appendix.
          </p>
          <button
            onClick={generate}
            className="px-5 py-2.5 text-sm font-semibold bg-[#0f2744] text-white rounded-lg hover:bg-[#1a3a5c] transition-colors"
          >
            Generate Memo
          </button>
        </div>
      )}
    </div>
  );
}
