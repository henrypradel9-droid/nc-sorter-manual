"use client";
import { useEffect } from "react";
import { useApi } from "./operational/shared";
export function AccessRequestCount() {
  const result = useApi<{ count: number }>("access-requests?status=PENDENTE", 30000);
  useEffect(() => { window.addEventListener("access-requests-updated", result.refresh); return () => window.removeEventListener("access-requests-updated", result.refresh); }, [result.refresh]);
  return result.data && result.data.count > 0 ? <span className="request-count" aria-label={`${result.data.count} solicitações pendentes`}>{result.data.count}</span> : null;
}
