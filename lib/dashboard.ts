import type { Occurrence } from "./domain";
export type SeriesItem = { name: string; id?: string; total: number };
export type TrendPoint = { name: string; total: number; pending: number; progress: number; resolved: number; average: number | null };
export type DashboardData = {
  from: string; to: string; grouping: "day" | "week" | "month";
  total: number; pending: number; progress: number; resolved: number; alerts: number;
  previous: { from: string; to: string; total: number; pending: number; progress: number; resolved: number };
  series: TrendPoint[]; errors: SeriesItem[]; shifts: SeriesItem[]; routing: SeriesItem[]; users: SeriesItem[];
  heatmap: { id: string; name: string; hour: number; total: number }[]; latest: Occurrence[];
};
export function comparison(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "Sem ocorrências nos dois períodos" : "Sem base anterior para comparação";
  const percent = (current - previous) / previous * 100;
  return `${percent > 0 ? "↑" : percent < 0 ? "↓" : "="} ${Math.abs(percent).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. período anterior`;
}
export function dateShift(day: string, delta: number) {
  const date = new Date(day + "T12:00:00Z"); date.setUTCDate(date.getUTCDate() + delta); return date.toISOString().slice(0,10);
}
export function occurrenceLink(query: string, key?: string, value?: string) {
  const params = new URLSearchParams(query); params.delete("grouping"); params.delete("page"); params.delete("page_size");
  if (key && value) params.set(key,value);
  return "/ocorrencias?" + params;
}
