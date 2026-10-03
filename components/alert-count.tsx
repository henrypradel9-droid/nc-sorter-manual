"use client";
import { useApi } from "./operational/shared";
export function AlertCount() {
  const result = useApi<{ count: number }>("alerts?page_size=25", 30000);
  return result.data && result.data.count > 0 ? (
    <span
      className="ml-auto rounded bg-yellow-300 px-2 text-xs font-bold text-slate-900"
      aria-label={result.data.count + " alertas"}
    >
      {result.data.count}
    </span>
  ) : null;
}
