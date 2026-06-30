"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface DashboardRow {
  id: string;
  ticker: string;
  companyName: string;
  sector?: string;
  activeScenario: string;
  updatedAt: string;
  currentPrice?: number;
  baseIVPS?: number;
  rec?: "BUY" | "SELL" | "HOLD";
  upside?: number;
}

type SortKey = "ticker" | "upside" | "currentPrice" | "baseIVPS" | "updatedAt" | "sector" | "rec";
type SortDir = "asc" | "desc";

const REC_COLORS = {
  BUY: "bg-green-700 text-white",
  SELL: "bg-red-700 text-white",
  HOLD: "bg-amber-600 text-white",
};

const SCENARIO_COLORS: Record<string, string> = {
  bear: "text-red-600 bg-red-50 border-red-200",
  base: "text-blue-700 bg-blue-50 border-blue-200",
  bull: "text-green-700 bg-green-50 border-green-200",
};

export function DashboardTable({ rows }: { rows: DashboardRow[] }) {
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<"table" | "cards">("table");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const router = useRouter();

  const sectors = useMemo(() => {
    const s = new Set(rows.map((r) => r.sector ?? "Unknown"));
    return ["All", ...Array.from(s).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (sector !== "All") r = r.filter((x) => (x.sector ?? "Unknown") === sector);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((x) => x.ticker.toLowerCase().includes(q) || x.companyName.toLowerCase().includes(q));
    }
    r = [...r].sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case "upside": va = a.upside ?? -999; vb = b.upside ?? -999; break;
        case "currentPrice": va = a.currentPrice ?? 0; vb = b.currentPrice ?? 0; break;
        case "baseIVPS": va = a.baseIVPS ?? 0; vb = b.baseIVPS ?? 0; break;
        case "updatedAt": va = a.updatedAt; vb = b.updatedAt; break;
        case "ticker": va = a.ticker; vb = b.ticker; break;
        case "sector": va = a.sector ?? ""; vb = b.sector ?? ""; break;
        case "rec": va = a.rec ?? ""; vb = b.rec ?? ""; break;
        default: va = a.updatedAt; vb = b.updatedAt;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return r;
  }, [rows, sector, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/model?id=${id}`, { method: "DELETE" });
    router.refresh();
    setDeletingId(null);
    setConfirmId(null);
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-400 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const Th = ({ label, k, className = "" }: { label: string; k: SortKey; className?: string }) => (
    <th
      className={`px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-gray-700 transition-colors ${className}`}
      onClick={() => toggleSort(k)}
    >
      {label}<SortIcon k={k} />
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ticker or company…"
            className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 w-56 transition-all"
          />
        </div>

        {/* Sector filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {sectors.map((s) => (
            <button
              key={s}
              onClick={() => setSector(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap ${
                sector === s
                  ? "bg-[#0f2744] text-white border-[#0f2744]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="ml-auto flex items-center border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setView("table")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "table" ? "bg-[#0f2744] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            Table
          </button>
          <button
            onClick={() => setView("cards")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "cards" ? "bg-[#0f2744] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            Cards
          </button>
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-gray-400">
        {filtered.length} of {rows.length} model{rows.length !== 1 ? "s" : ""}
        {search || sector !== "All" ? " (filtered)" : ""}
      </p>

      {/* TABLE VIEW */}
      {view === "table" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <Th label="Ticker" k="ticker" className="w-24" />
                  <Th label="Company" k="ticker" className="min-w-48" />
                  <Th label="Rating" k="rec" className="w-24" />
                  <Th label="Target (Base)" k="baseIVPS" className="w-32" />
                  <Th label="Current Price" k="currentPrice" className="w-32" />
                  <Th label="Upside" k="upside" className="w-28" />
                  <Th label="Sector" k="sector" className="w-36" />
                  <Th label="Scenario" k="rec" className="w-24" />
                  <Th label="Last Updated" k="updatedAt" className="w-32" />
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-gray-400 text-sm">No models match your filters.</td>
                  </tr>
                )}
                {filtered.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`group hover:bg-blue-50/50 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/model/${row.id}`}>
                        <span className="font-mono font-bold text-[#0f2744] hover:underline">{row.ticker}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-medium">{row.companyName}</td>
                    <td className="px-4 py-3">
                      {row.rec ? (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${REC_COLORS[row.rec]}`}>{row.rec}</span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#1a3a5c] font-semibold">
                      {row.baseIVPS ? `$${row.baseIVPS.toFixed(2)}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-700">
                      {row.currentPrice ? `$${row.currentPrice.toFixed(2)}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {row.upside !== undefined ? (
                        <span className={`font-mono font-semibold text-sm ${row.upside >= 0 ? "text-green-700" : "text-red-700"}`}>
                          {row.upside >= 0 ? "+" : ""}{row.upside.toFixed(1)}%
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{row.sector ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${SCENARIO_COLORS[row.activeScenario] ?? "text-gray-500"}`}>
                        {row.activeScenario}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                      {new Date(row.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {confirmId === row.id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => handleDelete(row.id)}
                            disabled={deletingId === row.id}
                            className="text-[10px] font-medium text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded"
                          >
                            {deletingId === row.id ? "…" : "Yes"}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="text-[10px] text-gray-500 hover:text-gray-700 px-2 py-0.5 rounded border"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmId(row.id)}
                          className="text-[10px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-400">
              Click any column header to sort · Click ticker to open model
            </div>
          )}
        </div>
      )}

      {/* CARD VIEW */}
      {view === "cards" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 && (
            <div className="col-span-3 py-12 text-center text-gray-400 text-sm">No models match your filters.</div>
          )}
          {filtered.map((row) => (
            <div key={row.id} className="group relative bg-white rounded-xl border border-gray-200 hover:border-[#1a3a5c] hover:shadow-md transition-all flex flex-col overflow-hidden">
              <div className="bg-[#0f2744] px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-mono font-bold text-white text-base">{row.ticker}</p>
                  {row.sector && <p className="text-[10px] text-blue-300 uppercase tracking-widest mt-0.5">{row.sector}</p>}
                </div>
                {row.rec && <span className={`text-xs font-bold px-2.5 py-1 rounded ${REC_COLORS[row.rec]}`}>{row.rec}</span>}
              </div>
              <Link href={`/model/${row.id}`} className="block flex-1 px-4 py-3">
                <p className="text-sm font-medium text-gray-700 mb-3">{row.companyName}</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Price", value: row.currentPrice ? `$${row.currentPrice.toFixed(2)}` : "—", color: "text-gray-800" },
                    { label: "Base IVPS", value: row.baseIVPS ? `$${row.baseIVPS.toFixed(2)}` : "—", color: "text-[#1a3a5c]" },
                    { label: "Upside", value: row.upside !== undefined ? `${row.upside >= 0 ? "+" : ""}${row.upside.toFixed(1)}%` : "—", color: row.upside !== undefined ? row.upside >= 0 ? "text-green-700" : "text-red-700" : "text-gray-400" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-gray-50 rounded px-2 py-1.5">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                      <p className={`text-xs font-mono font-semibold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </Link>
              <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${SCENARIO_COLORS[row.activeScenario] ?? "text-gray-500"}`}>
                    {row.activeScenario}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    {new Date(row.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                {confirmId === row.id ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleDelete(row.id)} disabled={deletingId === row.id}
                      className="text-[10px] font-medium text-white bg-red-600 px-2 py-0.5 rounded">
                      {deletingId === row.id ? "…" : "Yes"}
                    </button>
                    <button onClick={() => setConfirmId(null)}
                      className="text-[10px] text-gray-500 px-2 py-0.5 rounded border">No</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmId(row.id)}
                    className="text-[10px] text-gray-400 hover:text-red-600 transition-colors">Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
