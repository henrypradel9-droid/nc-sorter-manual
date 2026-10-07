"use client";
import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { Clock3, CheckCircle2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  type Occurrence,
  type Audit,
  type Role,
  type Catalog,
  statusLabels,
  displayDate,
} from "@/lib/domain";
import { api, useApi, State, Pick, type Lookups } from "./shared";
import { CatalogEditor } from "./catalogs";
type Values = {
  occurred: string;
  package_id: string;
  hu: string;
  occurrence_user: string;
  package_quantity: string;
  error_type_id: string;
  shift_id: string;
  canalizacao: string;
  status: string;
  tt: string;
  observations: string;
};
function localDate(value: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
  return parts.replace(" ", "T");
}
function initial(item?: Occurrence): Values {
  return {
    occurred: item ? localDate(new Date(item.occurred_at)) : "",
    package_id: item?.package_id ?? "",
    hu: item?.hu ?? "",
    occurrence_user: item?.occurrence_user ?? "",
    package_quantity: String(item?.package_quantity ?? 1),
    error_type_id: item?.error_type_id ?? "",
    shift_id: item?.shift_id ?? "",
    canalizacao: item?.canalizacao ?? "",
    status: item?.status ?? "PENDENTE",
    tt: item?.tt ?? "",
    observations: item?.observations ?? "",
  };
}
export function OccurrenceForm({
  role,
  item,
  onSaved,
}: {
  role: Role;
  item?: Occurrence;
  onSaved?: () => void;
}) {
  const lookups = useApi<Lookups>("lookups"),
    [values, setValues] = useState<Values>(() => initial(item)),
    [id, setId] = useState(() => item?.id ?? crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [newError, setNewError] = useState(false),
    [addedErrors, setAddedErrors] = useState<Catalog[]>([]),
    [keep, setKeep] = useState(false),
    [suggestions, setSuggestions] = useState<{ name: string }[]>([]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      if (values.occurrence_user.trim().length >= 2)
        void api<{ name: string }[]>(
          "suggestions?q=" + encodeURIComponent(values.occurrence_user),
        )
          .then((v) => {
            if (live) setSuggestions(v);
          })
          .catch(() => {});
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [values.occurrence_user]);
  const change = (key: keyof Values, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (!values.error_type_id || !values.shift_id || !values.canalizacao) {
      setError("Selecione o tipo de erro e o turno e digite a canalização.");
      return;
    }
    setBusy(true);
    try {
      await api(
        "occurrences" + (item ? "/" + id : ""),
        item ? "PATCH" : "POST",
        {
          ...Object.fromEntries(
            Object.entries(values).filter(([key]) => key !== "occurred"),
          ),
          id,
          occurred_at: new Date(values.occurred + ":00-03:00").toISOString(),
          package_quantity: Number(values.package_quantity),
          version: item?.version,
        },
      );
      toast.success(
        item ? "Ocorrência atualizada." : "Ocorrência registrada com sucesso.",
      );
      if (item) onSaved?.();
      else setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Verifique a data e os campos.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (saved)
    return (
      <div className="panel success-panel">
        <CheckCircle2 size={42} />
        <h2>Ocorrência registrada com sucesso.</h2>
        <p className="muted">
          O registro foi salvo no banco e está disponível na central.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            className="primary"
            onClick={() => {
              const next = initial();
              if (keep) {
                next.shift_id = values.shift_id;
                next.canalizacao = values.canalizacao;
              }
              setValues(next);
              setId(crypto.randomUUID());
              setSaved(false);
            }}
          >
            Registrar outra
          </button>
          {<Link className="button" href={"/ocorrencias/" + id}>
            Ver ocorrência
          </Link>}
        </div>
      </div>
    );
  const errors = [...(lookups.data?.error_types ?? []), ...addedErrors].filter(
    (v, i, a) => a.findIndex((x) => x.id === v.id) === i,
  );
  const options = (data: Catalog[], chosen: string) =>
    data
      .filter((x) => x.active || x.id === chosen)
      .map((x) => ({
        id: x.id,
        name: x.name + (x.active ? "" : " (desativado)"),
      }));
  return (
    <>
      <State
        loading={lookups.loading}
        error={lookups.error}
        retry={lookups.refresh}
      />
      <form onSubmit={submit} className="stack">
        <fieldset disabled={busy || !lookups.data} className="panel">
          <div className="panel-heading">
            <h2>Dados da ocorrência</h2>
            <button
              type="button"
              onClick={() => change("occurred", localDate(new Date()))}
            >
              <Clock3 size={15} />
              Usar data/hora atual
            </button>
          </div>
          <div className="form-grid">
            <label>
              Data e hora *
              <input
                type="datetime-local"
                required
                value={values.occurred}
                onChange={(e) => change("occurred", e.target.value)}
              />
              <small className="muted">Horário de São Paulo</small>
            </label>
            <label>
              Package ID (opcional)
              <input
                maxLength={100}
                value={values.package_id}
                onChange={(e) => change("package_id", e.target.value)}
                autoFocus
              />
            </label>
            <label>
              HU (opcional)
              <input
                maxLength={100}
                value={values.hu}
                onChange={(e) => change("hu", e.target.value)}
              />
            </label>
            <label>
              Usuário *
              <input
                required
                maxLength={100}
                value={values.occurrence_user}
                onChange={(e) => change("occurrence_user", e.target.value)}
                list="occurrence-users"
                autoComplete="off"
                placeholder="Digite o usuário da ocorrência"
              />
              <datalist id="occurrence-users">
                {suggestions.map((x) => (
                  <option key={x.name} value={x.name} />
                ))}
              </datalist>
              <small className="muted">
                Pode ser um usuário ainda não registrado.
              </small>
            </label>
            <label>
              Quantidade de pacotes *
              <input
                type="number"
                min={1}
                max={1000000}
                required
                value={values.package_quantity}
                onChange={(e) => change("package_quantity", e.target.value)}
              />
            </label>
          </div>
        </fieldset>
        <fieldset disabled={busy || !lookups.data} className="panel">
          <h2>Classificação</h2>
          <div className="form-grid">
            <div>
              <Pick
                label="Tipo de erro *"
                value={values.error_type_id}
                options={options(errors, values.error_type_id)}
                onChange={(v) => change("error_type_id", v)}
                required
              />
              {role === "ADMIN" && (
                <button
                  type="button"
                  className="mt-2"
                  onClick={() => setNewError(true)}
                >
                  <Plus size={14} />
                  Novo tipo de erro
                </button>
              )}
            </div>
            <Pick
              label="Turno *"
              value={values.shift_id}
              options={options(lookups.data?.shifts ?? [], values.shift_id)}
              onChange={(v) => change("shift_id", v)}
              required
            />
            <label>Canalização *<input required maxLength={150} value={values.canalizacao} onChange={e => change("canalizacao", e.target.value)} placeholder="Digite a canalização" /></label>
            <Pick
              label="Status *"
              value={values.status}
              options={Object.entries(statusLabels).map(([id, name]) => ({
                id,
                name,
              }))}
              onChange={(v) => change("status", v)}
              required
            />
          </div>
        </fieldset>
        <fieldset disabled={busy} className="panel">
          <h2>Informações adicionais</h2>
          <div className="form-grid">
            <label>
              TT
              <input
                maxLength={200}
                value={values.tt}
                onChange={(e) => change("tt", e.target.value)}
              />
            </label>
            <label className="wide">
              Observações
              {errors.find(x => x.id === values.error_type_id)?.name.trim().toLowerCase() === "outro" && <strong className="notice">Descreva o tipo de erro encontrado.</strong>}
              <textarea
                maxLength={4000}
                value={values.observations}
                onChange={(e) => change("observations", e.target.value)}
                placeholder={errors.find(x => x.id === values.error_type_id)?.name.trim().toLowerCase() === "outro" ? "Descreva o tipo de erro encontrado." : "Descreva o contexto necessário para o acompanhamento."}
              />
            </label>
          </div>
          {!item && (
            <label className="flex-row items-center mt-4">
              <Checkbox
                checked={keep}
                onCheckedChange={(v) => setKeep(v === true)}
              />
              Manter turno e canalização ao registrar outra
            </label>
          )}
          {error && (
            <p className="error mt-4" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            {<Link className="button" href="/ocorrencias">
              Voltar à central
            </Link>}
            <button className="primary" disabled={busy || !lookups.data}>
              {busy
                ? "Salvando…"
                : item
                  ? "Salvar alterações"
                  : "Registrar ocorrência"}
            </button>
          </div>
        </fieldset>
      </form>
      {newError && (
        <CatalogEditor
          table="error_types"
          onClose={() => setNewError(false)}
          onSaved={(x) => {
            setAddedErrors((a) => [...a, x]);
            change("error_type_id", x.id);
            setNewError(false);
            lookups.refresh();
          }}
        />
      )}
    </>
  );
}
export function OccurrenceDetail({ id, role }: { id: string; role: Role }) {
  const result = useApi<{ occurrence: Occurrence; history: Audit[]; alert_count: number }>(
      "occurrences/" + id,
    ),
    [editing, setEditing] = useState(false);
  const o = result.data?.occurrence;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Detalhes da ocorrência</h1>
          <p>Dados do registro e histórico de alterações.</p>
        </div>
        {role === "ADMIN" && (
          <button onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancelar edição" : "Editar ocorrência"}
          </button>
        )}
      </div>
      <State
        loading={result.loading}
        error={result.error}
        retry={result.refresh}
      />
      {o &&
        (editing ? (
          <OccurrenceForm
            key={o.version}
            role={role}
            item={o}
            onSaved={() => {
              setEditing(false);
              result.refresh();
            }}
          />
        ) : (
          <section className="panel">
            <dl className="detail-grid">
              {Object.entries({
                "Data / Hora": displayDate(o.occurred_at),
                "Package ID": o.package_id,
                HU: o.hu,
                Usuário: o.occurrence_user,
                "Tipo de erro": o.error_type?.name,
                Turno: o.shift?.name,
                Canalização: o.canalizacao,
                Quantidade: o.package_quantity,
                Status: statusLabels[o.status],
                TT: o.tt || "—",
                "Registrado por": o.registered_by?.name,
                "Criado em": displayDate(o.created_at),
                "Última alteração": displayDate(o.updated_at),
                Observações: o.observations || "—",
              }).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      {role === "ADMIN" && !!result.data?.alert_count && <Link className="button mt-5" href={"/alertas/historico?occurrence_user="+encodeURIComponent(o?.occurrence_user_normalized??"")}>Histórico de alertas: {result.data.alert_count}</Link>}
      {role === "ADMIN" && result.data && (
        <section className="panel mt-5">
          <h2>Histórico de alterações</h2>
          <p className="muted small">Últimas 100 alterações deste registro.</p>
          {result.data.history.map((a) => (
            <details className="history-entry" key={a.id}>
              <summary>
                {a.action} · {displayDate(a.created_at)}
              </summary>
              <p className="small">Responsável: {a.actor_id}</p>
              <pre>
                {JSON.stringify(
                  { anterior: a.old_data, novo: a.new_data },
                  null,
                  2,
                )}
              </pre>
            </details>
          ))}
        </section>
      )}
    </>
  );
}
