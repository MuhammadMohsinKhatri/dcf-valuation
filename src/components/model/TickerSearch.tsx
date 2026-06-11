"use client";
import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { CompanySearchResult } from "@/types/model";

interface Props {
  onSelect: (result: CompanySearchResult) => void;
}

export function TickerSearch({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (query.length < 1) { setResults([]); setOpen(false); return; }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/financials?action=search&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.slice(0, 8));
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, [query]);

  return (
    <div className="relative w-full max-w-md">
      <Input
        label="Company or Ticker"
        placeholder="Search AAPL, Microsoft, Tesla..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {loading && (
        <div className="absolute right-3 top-9 text-gray-400 text-xs">Searching...</div>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
          {results.map((r) => (
            <li
              key={r.symbol}
              className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-blue-50 text-sm"
              onMouseDown={() => { onSelect(r); setQuery(`${r.symbol} — ${r.name}`); setOpen(false); }}
            >
              <span>
                <span className="font-mono font-bold text-blue-700 mr-2">{r.symbol}</span>
                <span className="text-gray-700">{r.name}</span>
              </span>
              <span className="text-xs text-gray-400 ml-4">{r.exchangeShortName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
