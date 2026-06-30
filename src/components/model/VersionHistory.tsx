"use client";
import { useEffect, useState, useCallback } from "react";
import type { DCFModel } from "@/types/model";

interface VersionMeta {
  id: string;
  versionNum: number;
  label: string | null;
  baseIVPS: number | null;
  bearIVPS: number | null;
  bullIVPS: number | null;
  createdAt: string;
}

interface AssumptionChange {
  id: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedAt: string;
}

// Human-readable field labels
const FIELD_LABELS: Record<string, string> = {
  waccBase: "WACC (Base)", waccBear: "WACC (Bear)", waccBull: "WACC (Bull)",
  terminalGrowthRate: "Terminal Growth Rate",
  ebitMarginBase: "EBIT Margin (Base)", ebitMarginBear: "EBIT Margin (Bear)", ebitMarginBull: "EBIT Margin (Bull)",
  taxRate: "Tax Rate", depreciationPct: "D&A % Revenue", capexPct: "CapEx % Revenue",
  netDebt: "Net Debt ($M)", sharesOutstanding: "Shares Outstanding (M)",
  arDays: "AR Days", apDays: "AP Days", inventoryDays: "Inventory Days",
  interestRate: "Interest Rate", debtRepaymentPct: "Debt Repayment %",
  dividendPctNI: "Dividend % NI", buybackPctNI: "Buyback % NI",
};

function fieldLabel(f: string) {
  return FIELD_LABELS[f] ?? f.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

function fmtVal(field: string, v: string) {
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  const pctFields = ["wacc", "Margin", "Rate", "Pct", "Growth", "Days"];
  if (pctFields.some((k) => field.toLowerCase().includes(k.toLowerCase()))) {
    return n < 1 ? `${(n * 100).toFixed(2)}%` : `${n.toFixed(1)}%`;
  }
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function DeltaBadge({ old: o, nw: n }: { old: string; nw: string }) {
  const ov = parseFloat(o);
  const nv = parseFloat(n);
  if (isNaN(ov) || isNaN(nv)) return null;
  const up = nv > ov;
  return (
    <span className={`text-[10px] font-bold px-1 py-0.5 rounded font-mono ml-1 ${up ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
      {up ? "▲" : "▼"}
    </span>
  );
}

interface Props {
  model: DCFModel;
  onRestore: (restoredModel: DCFModel) => void;
  currentBaseIVPS?: number | null;
  currentBearIVPS?: number | null;
  currentBullIVPS?: number | null;
}

export function VersionHistory({ model, onRestore, currentBaseIVPS, currentBearIVPS, currentBullIVPS }: Props) {
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [changes, setChanges] = useState<AssumptionChange[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [loadingChanges, setLoadingChanges] = useState(true);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"versions" | "audit">("versions");

  const loadVersions = useCallback(() => {
    setLoadingVersions(true);
    fetch(`/api/versions?modelId=${model.id}`)
      .then((r) => r.json())
      .then(setVersions)
      .finally(() => setLoadingVersions(false));
  }, [model.id]);

  const loadChanges = useCallback(() => {
    setLoadingChanges(true);
    fetch(`/api/audit?modelId=${model.id}`)
      .then((r) => r.json())
      .then(setChanges)
      .finally(() => setLoadingChanges(false));
  }, [model.id]);

  useEffect(() => { loadVersions(); loadChanges(); }, [loadVersions, loadChanges]);

  async function saveVersion() {
    setSaving(true);
    await fetch("/api/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId: model.id,
        label: label.trim() || undefined,
        modelData: JSON.stringify(model),
        baseIVPS: currentBaseIVPS ?? undefined,
        bearIVPS: currentBearIVPS ?? undefined,
        bullIVPS: currentBullIVPS ?? undefined,
      }),
    });
    setLabel("");
    setSaving(false);
    loadVersions();
  }

  async function restoreVersion(id: string) {
    setRestoring(id);
    const res = await fetch(`/api/versions/${id}`);
    const data = await res.json() as { modelData: string };
    const restored = JSON.parse(data.modelData) as DCFModel;
    onRestore(restored);
    setRestoring(null);
  }

  async function deleteVersion(id: string) {
    setDeleting(id);
    await fetch(`/api/versions/${id}`, { method: "DELETE" });
    setDeleting(null);
    loadVersions();
  }

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 bg-[#0f2744] rounded" />
        <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">Version History & Audit Trail</h2>
      </div>

      {/* Save snapshot */}
      <div className="bg-[#0f2744] rounded-xl p-5 flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-[10px] font-bold text-blue-300 uppercase tracking-widest mb-1.5">
            Save Current Snapshot
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Post-earnings update, Q3 guidance revision…"
            className="w-full bg-[#1a3a5c] text-white text-sm rounded-lg px-3 py-2 border border-blue-700 placeholder-blue-400 focus:outline-none focus:border-blue-400"
          />
        </div>
        <button
          onClick={saveVersion}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-lg transition-colors whitespace-nowrap"
        >
          {saving ? "Saving…" : "Save Version"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(["versions", "audit"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            className={`px-5 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
              activeSection === s ? "border-[#0f2744] text-[#0f2744]" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {s === "versions" ? `Saved Versions (${versions.length})` : `Audit Trail (${changes.length})`}
          </button>
        ))}
      </div>

      {/* Versions panel */}
      {activeSection === "versions" && (
        <div className="space-y-3">
          {loadingVersions ? (
            <div className="text-sm text-gray-400 py-6 text-center">Loading versions…</div>
          ) : versions.length === 0 ? (
            <div className="text-sm text-gray-400 bg-gray-50 rounded-xl px-5 py-8 text-center">
              No saved versions yet. Save a snapshot above to track changes over time.
            </div>
          ) : (
            versions.map((v) => (
              <div key={v.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
                {/* Version badge */}
                <div className="w-10 h-10 rounded-full bg-[#0f2744] flex items-center justify-center text-white text-xs font-bold shrink-0">
                  v{v.versionNum}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-gray-900">
                      {v.label ?? `Version ${v.versionNum}`}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">{fmtDate(v.createdAt)}</span>
                  </div>
                  {/* IVPS row */}
                  {(v.baseIVPS || v.bearIVPS || v.bullIVPS) && (
                    <div className="flex items-center gap-4 mt-1">
                      {v.bearIVPS && (
                        <span className="text-[10px] text-red-600 font-mono">
                          Bear <strong>${v.bearIVPS.toFixed(2)}</strong>
                        </span>
                      )}
                      {v.baseIVPS && (
                        <span className="text-[10px] text-[#0f2744] font-mono">
                          Base <strong>${v.baseIVPS.toFixed(2)}</strong>
                        </span>
                      )}
                      {v.bullIVPS && (
                        <span className="text-[10px] text-green-600 font-mono">
                          Bull <strong>${v.bullIVPS.toFixed(2)}</strong>
                        </span>
                      )}
                      {currentBaseIVPS && v.baseIVPS && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                          currentBaseIVPS > v.baseIVPS ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}>
                          {currentBaseIVPS > v.baseIVPS ? "▲" : "▼"} ${Math.abs(currentBaseIVPS - v.baseIVPS).toFixed(2)} vs now
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => restoreVersion(v.id)}
                    disabled={restoring === v.id}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {restoring === v.id ? "Restoring…" : "Restore"}
                  </button>
                  <button
                    onClick={() => deleteVersion(v.id)}
                    disabled={deleting === v.id}
                    className="text-xs font-semibold text-gray-400 hover:text-red-600 px-2 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {deleting === v.id ? "…" : "✕"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Audit trail panel */}
      {activeSection === "audit" && (
        <div>
          {loadingChanges ? (
            <div className="text-sm text-gray-400 py-6 text-center">Loading audit trail…</div>
          ) : changes.length === 0 ? (
            <div className="text-sm text-gray-400 bg-gray-50 rounded-xl px-5 py-8 text-center">
              No assumption changes recorded yet. Changes are logged automatically when you save the model.
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm border-collapse bg-white">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Time</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Assumption</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Old Value</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">New Value</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c, i) => (
                    <tr key={c.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-2 text-[10px] text-gray-400 font-mono whitespace-nowrap">
                        {fmtDate(c.changedAt)}
                      </td>
                      <td className="px-4 py-2 text-xs font-semibold text-gray-800">
                        {fieldLabel(c.field)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-red-600 line-through">
                        {fmtVal(c.field, c.oldValue)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-green-700 font-bold">
                        {fmtVal(c.field, c.newValue)}
                        <DeltaBadge old={c.oldValue} nw={c.newValue} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
