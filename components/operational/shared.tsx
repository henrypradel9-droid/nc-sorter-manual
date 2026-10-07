"use client";
import { useEffect, useState, useCallback, type FormEvent } from "react";
import { SearchX, Circle, CircleCheck, Clock3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Empty as EmptyPrimitive,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { statusLabels, type Status, type Catalog } from "@/lib/domain";
export async function api<T>(
  url: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch("/api/" + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  });
  const data = (await r.json()) as { error?: string };
  if (!r.ok) throw new Error(data.error ?? "Não foi possível concluir.");
  return data as T;
}
export function useApi<T>(url: string, refreshMs = 0, enabled = true) {
  const [state, setState] = useState<{
    data?: T;
    error?: string;
    loading: boolean;
    source?: string;
  }>({ loading: true });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let live = true;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await api<T>(url, "GET", undefined, controller.signal);
        if (live) setState({ data, loading: false, source: url });
      } catch (e) {
        if (live)
          setState({
            error: e instanceof Error ? e.message : "Erro ao carregar",
            loading: false,
            source: url,
          });
      } finally { inFlight = false; }
    };
    void load();
    const timer = refreshMs
      ? setInterval(() => {
          if (document.visibilityState === "visible") void load();
        }, refreshMs)
      : null;
    return () => {
      live = false;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [url, revision, refreshMs, enabled]);
  return { ...(enabled && state.source === url ? state : { data: undefined, error: undefined, loading: enabled }), refresh };
}
export function State({
  loading,
  error,
  retry,
}: {
  loading?: boolean;
  error?: string;
  retry?: () => void;
}) {
  return loading ? (
    <Skeleton className="h-48 w-full" />
  ) : error ? (
    <div className="error" role="alert">
      {error} {retry && <button onClick={retry}>Tentar novamente</button>}
    </div>
  ) : null;
}
export function Empty({
  text = "Nenhum registro encontrado.",
}: {
  text?: string;
}) {
  return (
    <EmptyPrimitive className="empty">
      <EmptyHeader>
        <SearchX />
        <EmptyTitle>{text}</EmptyTitle>
        <EmptyDescription>
          Os registros aparecerão aqui conforme a operação.
        </EmptyDescription>
      </EmptyHeader>
    </EmptyPrimitive>
  );
}
export function Pick({
  label,
  value,
  onChange,
  options,
  all,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string }[];
  all?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <Select
        value={value || "__empty"}
        onValueChange={(v) => onChange(v === "__empty" ? "" : v)}
        required={required}
      >
        <SelectTrigger aria-label={label} className="select-field">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__empty">{all ?? "Selecione"}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
export function StatusBadge({ status }: { status: Status }) {
  const Icon =
    status === "RESOLVIDO"
      ? CircleCheck
      : status === "PENDENTE"
        ? Circle
        : Clock3;
  return (
    <span className={"badge " + status}>
      <Icon size={12} />
      {statusLabels[status]}
    </span>
  );
}
export function Pager({
  page,
  total,
  size = 25,
  onChange,
  onSize,
}: {
  page: number;
  total: number;
  size?: number;
  onChange: (page: number) => void;
  onSize?: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="pagination-bar">
      <span>
        {total} registros · Página {page} de {pages}
      </span>
      {onSize && (
        <Pick
          label="Por página"
          value={String(size)}
          onChange={(v) => onSize(Number(v) || 25)}
          options={[25, 50, 100].map((n) => ({
            id: String(n),
            name: String(n),
          }))}
        />
      )}
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <button disabled={page <= 1} onClick={() => onChange(page - 1)}>
              Anterior
            </button>
          </PaginationItem>
          <PaginationItem>
            <button disabled={page >= pages} onClick={() => onChange(page + 1)}>
              Próxima
            </button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
export type Lookups = {
  error_types: Catalog[];
  shifts: Catalog[];
  canalizacoes: Catalog[];
  profiles: { id: string; name: string }[];
};
export function Filters({
  value,
  onApply,
  lookups,
}: {
  value: string;
  onApply: (query: string) => void;
  lookups?: Lookups;
}) {
  const initial = Object.fromEntries(new URLSearchParams(value));
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const change = (key: string, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    onApply(
      new URLSearchParams(
        Object.entries(draft).filter(([, v]) => v),
      ).toString(),
    );
  }
  return (
    <form className="panel filters" onSubmit={submit}>
      {draft.from_at && (
        <p className="notice col-span-full">
          Período exato do alerta:{" "}
          {new Date(draft.from_at).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}{" "}
          até{" "}
          {new Date(draft.to_at).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}{" "}
          (fim exclusivo).
        </p>
      )}
      <label className="search">
        Busca
        <input
          placeholder="Package ID, HU, Usuário ou Canalização"
          value={draft.q ?? ""}
          onChange={(e) => change("q", e.target.value)}
        />
      </label>
      <label>
        De
        <input
          type="date"
          value={draft.from ?? ""}
          onChange={(e) => change("from", e.target.value)}
        />
      </label>
      <label>
        Até
        <input
          type="date"
          value={draft.to ?? ""}
          onChange={(e) => change("to", e.target.value)}
        />
      </label>
      <label>
        Usuário
        <input
          value={draft.occurrence_user ?? ""}
          onChange={(e) => change("occurrence_user", e.target.value)}
          placeholder="Usuário exato"
        />
      </label>
      {(["error_types", "shifts"] as const).map((table, i) => (
        <Pick
          key={table}
          label={["Tipo de erro", "Turno", "Canalização"][i]}
          value={
            draft[["error_type_id", "shift_id", "canalizacao_id"][i]] ?? ""
          }
          onChange={(v) =>
            change(["error_type_id", "shift_id", "canalizacao_id"][i], v)
          }
          options={lookups?.[table] ?? []}
          all="Todos"
        />
      ))}
      <label>Canalização<input value={draft.canalizacao ?? ""} maxLength={150} onChange={e=>change("canalizacao",e.target.value)} placeholder="Todas ou canalização exata" /></label>
      <Pick
        label="Status"
        value={draft.status ?? ""}
        onChange={(v) => change("status", v)}
        options={Object.entries(statusLabels).map(([id, name]) => ({
          id,
          name,
        }))}
        all="Todos"
      />
      <Pick
        label="Registrado por"
        value={draft.registered_by_user_id ?? ""}
        onChange={(v) => change("registered_by_user_id", v)}
        options={lookups?.profiles ?? []}
        all="Todos"
      />
      <div className="filter-actions">
        <button className="primary" type="submit">
          Aplicar filtros
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft({});
            onApply("");
          }}
        >
          Limpar
        </button>
      </div>
    </form>
  );
}
