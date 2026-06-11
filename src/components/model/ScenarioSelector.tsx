"use client";
import { cn } from "@/lib/utils";
import type { Scenario } from "@/types/model";

interface Props {
  value: Scenario;
  onChange: (s: Scenario) => void;
}

const scenarios: { value: Scenario; label: string; bg: string; text: string; ring: string }[] = [
  { value: "bear", label: "Bear", bg: "bg-red-50", text: "text-red-700", ring: "ring-red-400" },
  { value: "base", label: "Base", bg: "bg-yellow-50", text: "text-yellow-700", ring: "ring-yellow-400" },
  { value: "bull", label: "Bull", bg: "bg-green-50", text: "text-green-700", ring: "ring-green-400" },
];

export function ScenarioSelector({ value, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {scenarios.map((s) => (
        <button
          key={s.value}
          onClick={() => onChange(s.value)}
          className={cn(
            "px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition-all",
            s.bg,
            s.text,
            value === s.value
              ? `ring-2 ${s.ring} border-transparent shadow`
              : "border-transparent opacity-60 hover:opacity-90"
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
