"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Props {
  id: string;
  ticker: string;
  companyName: string;
  activeScenario: string;
  updatedAt: string;
  aiNarrative?: string;
  currentPrice?: number;
  sector?: string;
  baseIVPS?: number;
}

export function ModelCard({ id, ticker, companyName, activeScenario, updatedAt, aiNarrative, currentPrice, sector, baseIVPS }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm) { setConfirm(true); return; }
    setDeleting(true);
    await fetch(`/api/model?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  const upside = baseIVPS && currentPrice && currentPrice > 0
    ? ((baseIVPS - currentPrice) / currentPrice) * 100
    : null;

  const rec = baseIVPS && currentPrice && currentPrice > 0
    ? baseIVPS > currentPrice * 1.1 ? "BUY" : baseIVPS < currentPrice * 0.9 ? "SELL" : "HOLD"
    : null;

  const recStyle = rec === "BUY"
    ? "bg-green-700 text-white"
    : rec === "SELL"
    ? "bg-red-700 text-white"
    : rec === "HOLD"
    ? "bg-yellow-600 text-white"
    : "bg-gray-100 text-gray-500";

  const scenarioStyle = activeScenario === "bear"
    ? "bg-red-50 text-red-700 border border-red-200"
    : activeScenario === "bull"
    ? "bg-green-50 text-green-700 border border-green-200"
    : "bg-blue-50 text-[#1a3a5c] border border-blue-200";

  const snippet = aiNarrative ? aiNarrative.slice(0, 100) + (aiNarrative.length > 100 ? "…" : "") : null;

  return (
    <div className="relative bg-white rounded-xl border border-gray-200 hover:border-[#1a3a5c] hover:shadow-md transition-all flex flex-col overflow-hidden">
      {/* Card header */}
      <div className="bg-[#0f2744] px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-mono font-bold text-white text-base leading-tight">{ticker}</p>
          {sector && <p className="text-[10px] text-blue-300 uppercase tracking-widest mt-0.5">{sector}</p>}
        </div>
        {rec && (
          <span className={`text-xs font-bold px-2.5 py-1 rounded ${recStyle}`}>{rec}</span>
        )}
      </div>

      <Link href={`/model/${id}`} className="block flex-1 px-4 py-3">
        <p className="text-sm font-medium text-gray-700 mb-3">{companyName}</p>

        {/* Key metrics row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-gray-50 rounded px-2 py-1.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Price</p>
            <p className="text-xs font-mono font-semibold text-gray-800">
              {currentPrice ? `$${currentPrice.toFixed(2)}` : "—"}
            </p>
          </div>
          <div className="bg-gray-50 rounded px-2 py-1.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Base IVPS</p>
            <p className="text-xs font-mono font-semibold text-[#1a3a5c]">
              {baseIVPS ? `$${baseIVPS.toFixed(2)}` : "—"}
            </p>
          </div>
          <div className="bg-gray-50 rounded px-2 py-1.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Upside</p>
            <p className={`text-xs font-mono font-semibold ${upside === null ? "text-gray-400" : upside >= 0 ? "text-green-700" : "text-red-700"}`}>
              {upside !== null ? `${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>

        {snippet && (
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{snippet}</p>
        )}
      </Link>

      {/* Card footer */}
      <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${scenarioStyle}`}>
            {activeScenario.charAt(0).toUpperCase() + activeScenario.slice(1)}
          </span>
          <span className="text-[10px] text-gray-400 font-mono">
            {new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
        {confirm ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500">Delete?</span>
            <button onClick={handleDelete} disabled={deleting}
              className="text-[10px] font-medium text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded">
              {deleting ? "…" : "Yes"}
            </button>
            <button onClick={(e) => { e.preventDefault(); setConfirm(false); }}
              className="text-[10px] font-medium text-gray-500 hover:text-gray-700 px-2 py-0.5 rounded border">
              No
            </button>
          </div>
        ) : (
          <button onClick={handleDelete}
            className="text-[10px] text-gray-400 hover:text-red-600 transition-colors px-1 py-0.5 rounded">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
