import "server-only";
import { filterSchema } from "@/schemas";
import type { database } from "@/lib/supabase";
export const occurrenceSelect =
  "*,error_type:error_types(*),shift:shifts(*),canalizacao:canalizacoes(*),registered_by:profiles!registered_by_user_id(name)";
export function filtersFrom(url: URL) {
  const values = Object.fromEntries(
    [...url.searchParams].filter(([, value]) => value !== ""),
  );
  const parsed = filterSchema.parse(values);
  if (parsed.from && parsed.to && parsed.from > parsed.to)
    throw new Error("INVALID_PERIOD");
  return parsed;
}
export function occurrenceQuery(
  db: Awaited<ReturnType<typeof database>>,
  filters: ReturnType<typeof filtersFrom>,
) {
  return db
    .rpc("filtered_occurrences", { filters }, { count: "exact" })
    .select(occurrenceSelect)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false });
}
