"use client";
import { cn } from "@/lib/utils";
import type { Scenario } from "@/types/model";

interface Props {
  value: Scenario;
  onChange: (s: Scenario) => void;
}

const scenarios: { value: Scenario; label: string; active: string; inactive: string }[] = [
  { value: "bear", label: "Bear", active: "bg-red-600 text-white border-red-600", inactive: "bg-white text-red-600 border-red-200 hover:border-red-400" },
  { value: "base", label: "Base", active: "bg-[#0f2744] text-white border-[#0f2744]", inactive: "bg-white text-gray-600 border-gray-200 hover:border-gray-400" },
  { value: "bull", label: "Bull", active: "bg-green-700 text-white border-green-700", inactive: "bg-white text-green-700 border-green-200 hover:border-green-400" },
];

export function ScenarioSelector({ value, onChange }: Props) {
  return (
    <div className="flex border border-gray-200 rounded-lg overflow-hidden divide-x divide-gray-200">
      {scenarios.map((s) => (
        <button
          key={s.value}
          onClick={() => onChange(s.value)}
          className={cn(
            "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
            value === s.value ? s.active : s.inactive
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
