"use client";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { type Alert, type FollowUp, displayDate } from "@/lib/domain";
import { api, useApi, State, Empty, Pager } from "./shared";
const labels = {
  NOVO: "Novo",
  VISUALIZADO: "Visualizado",
  ACOMPANHAMENTO_REALIZADO: "Acompanhamento realizado",
};
function AlertDetail({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const result = useApi<{ alert: Alert; notes: FollowUp[] }>("alerts/" + id),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      await api("followups", "POST", {
        alert_id: id,
        note: new FormData(form).get("note"),
      });
      form.reset();
      toast.success("Acompanhamento registrado.");
      result.refresh();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  const a = result.data?.alert;
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Acompanhamento operacional</DialogTitle>
          <DialogDescription>
            Registre a ação ou orientação realizada para este período.
          </DialogDescription>
        </DialogHeader>
        <State
          loading={result.loading}
          error={result.error}
          retry={result.refresh}
        />
        {a && (
          <>
            <strong>
              {a.occurrence_user} · {a.occurrence_count} ocorrências
            </strong>
            <p className="small muted">
              {displayDate(a.period_start)} até {displayDate(a.period_end)} ·{" "}
              {labels[a.status]}
            </p>
            <Link
              className="button"
              href={
                "/ocorrencias?" +
                new URLSearchParams({
                  occurrence_user: a.occurrence_user,
                  from_at: a.period_start,
                  to_at: a.period_end,
                })
              }
            >
              Ver ocorrências
            </Link>
            <form onSubmit={save} className="stack">
              <label>
                Observação do acompanhamento *
                <textarea name="note" required minLength={3} maxLength={4000} />
              </label>
              {error && <p className="error">{error}</p>}
              <button className="primary" disabled={busy}>
                {busy ? "Salvando…" : "Registrar acompanhamento"}
              </button>
            </form>
            <h3>Histórico de acompanhamentos</h3>
            {result.data?.notes.length ? (
              result.data.notes.map((n) => (
                <article className="history-entry" key={n.id}>
                  <p>{n.note}</p>
                  <small>
                    {n.responsible?.name} · {displayDate(n.created_at)}
                  </small>
                </article>
              ))
            ) : (
              <p className="muted small">Nenhum acompanhamento registrado.</p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function Alerts() {
  const search = useSearchParams(),
    [page, setPage] = useState(1),
    [history, setHistory] = useState(false),
    [selected, setSelected] = useState<string>(),
    [from, setFrom] = useState(search.get("from") ?? ""),
    [to, setTo] = useState(search.get("to") ?? "");
  const query = new URLSearchParams({
    page: String(page),
    history: String(history),
    from,
    to,
  }).toString();
  const result = useApi<{ data: Alert[]; count: number }>(
    "alerts?" + query,
    30000,
  );
  async function open(a: Alert) {
    try {
      if (a.status === "NOVO")
        await api("alerts/" + a.id + "/view", "POST", {});
      setSelected(a.id);
      result.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir.");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Alertas de reincidência</h1>
          <p>Identifique situações que precisam de acompanhamento.</p>
        </div>
      </div>
      <div className="panel filters">
        <label>
          De
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="flex-row items-center">
          <Switch
            checked={history}
            onCheckedChange={(v) => {
              setHistory(v);
              setPage(1);
            }}
          />
          Incluir alertas fora do limite
        </label>
      </div>
      <State
        loading={result.loading}
        error={result.error}
        retry={result.refresh}
      />
      {result.data && (
        <>
          <div className="alert-grid">
            {result.data.data.map((a) => (
              <article className="panel alert-card" key={a.id}>
                <div className="flex justify-between gap-4">
                  <strong>{a.occurrence_user}</strong>
                  <span className="badge PENDENTE">{labels[a.status]}</span>
                </div>
                <span>
                  {a.occurrence_count} ocorrências no período{" "}
                  {!a.active && "· Fora do limite atual"}
                </span>
                <div className="alert-meta">
                  <span>
                    Erro mais frequente
                    <br />
                    <strong className="text-sm!">
                      {a.most_frequent_error}
                    </strong>
                  </span>
                  <span>
                    Turnos
                    <br />
                    {a.shifts.join(", ")}
                  </span>
                </div>
                <small className="muted">
                  Período: {displayDate(a.period_start)} –{" "}
                  {displayDate(a.period_end)}
                  <br />
                  Última ocorrência: {displayDate(a.last_occurrence)}
                </small>
                <button onClick={() => open(a)}>
                  Abrir histórico e acompanhar
                </button>
              </article>
            ))}
          </div>
          {!result.data.data.length && (
            <Empty text="Nenhum usuário acima do limite no período." />
          )}
          <Pager page={page} total={result.data.count} onChange={setPage} />
        </>
      )}
      {selected && (
        <AlertDetail
          id={selected}
          onClose={() => setSelected(undefined)}
          onSaved={result.refresh}
        />
      )}
    </>
  );
}
