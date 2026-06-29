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
}

export function ModelCard({ id, ticker, companyName, activeScenario, updatedAt, aiNarrative }: Props) {
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

  const snippet = aiNarrative ? aiNarrative.slice(0, 120) + (aiNarrative.length > 120 ? "…" : "") : null;

  return (
    <div className="relative bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-400 hover:shadow-sm transition-all flex flex-col">
      <Link href={`/model/${id}`} className="block flex-1">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono font-bold text-blue-700 text-lg">{ticker}</p>
            <p className="text-sm text-gray-600 mt-0.5">{companyName}</p>
          </div>
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
            activeScenario === "bear" ? "bg-red-100 text-red-700" :
            activeScenario === "bull" ? "bg-green-100 text-green-700" :
            "bg-yellow-100 text-yellow-700"
          }`}>
            {activeScenario.charAt(0).toUpperCase() + activeScenario.slice(1)}
          </span>
        </div>

        {snippet && (
          <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <p className="text-xs text-blue-600 font-semibold mb-0.5">AI Analyst Note</p>
            <p className="text-xs text-gray-600 leading-relaxed">{snippet}</p>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3">
          Updated {new Date(updatedAt).toLocaleDateString()}
        </p>
      </Link>

      <div className="mt-3 flex justify-end">
        {confirm ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Sure?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded"
            >
              {deleting ? "Deleting..." : "Yes, Delete"}
            </button>
            <button
              onClick={(e) => { e.preventDefault(); setConfirm(false); }}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1 rounded border"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleDelete}
            className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
