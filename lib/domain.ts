export const statuses = ["PENDENTE", "EM_ANDAMENTO", "RESOLVIDO"] as const;
export const roles = ["ADMIN", "LIDER", "OPERADOR"] as const;
export type Role = (typeof roles)[number];
export type Status = (typeof statuses)[number];
export const statusLabels: Record<Status, string> = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  RESOLVIDO: "Resolvido",
};
export function normalizeUser(value: string) {
  return value.trim().toLowerCase();
}
export function exceedsLimit(count: number, limit: number) {
  return count > limit;
}
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function operationalDate(instant: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}
export function displayDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
export type Profile = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  created_at: string;
};
export type Catalog = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  start_time?: string | null;
  end_time?: string | null;
};
export type Occurrence = {
  id: string;
  occurred_at: string;
  package_id: string;
  hu: string;
  occurrence_user: string;
  occurrence_user_normalized: string;
  package_quantity: number;
  error_type_id: string;
  shift_id: string;
  canalizacao_id: string;
  status: Status;
  tt: string | null;
  observations: string | null;
  registered_by_user_id: string;
  created_at: string;
  updated_at: string;
  version: number;
  error_type: Catalog;
  shift: Catalog;
  canalizacao: Catalog;
  registered_by: Pick<Profile, "name">;
};
export type Audit = {
  id: string;
  actor_id: string;
  action: string;
  entity: string;
  record_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
};
export type Alert = {
  id: string;
  occurrence_user: string;
  occurrence_count: number;
  period_start: string;
  period_end: string;
  most_frequent_error: string;
  last_occurrence: string;
  shifts: string[];
  status: "NOVO" | "VISUALIZADO" | "ACOMPANHAMENTO_REALIZADO";
  active: boolean;
};
export type FollowUp = {
  id: string;
  note: string;
  created_at: string;
  responsible: { name: string };
};

export const catalogNames: Record<string, string> = {
  error_types: "Tipos de erro",
  shifts: "Turnos",
  canalizacoes: "Canalizações",
};
