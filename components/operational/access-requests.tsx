"use client";
import { useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useApi, api, State, Empty, Pager } from "./shared";
import type { AccessRequest } from "@/lib/access-request-types";
import { displayDate } from "@/lib/domain";
export function AccessRequests() {
  const [status, setStatus] = useState("PENDENTE"), [filter, setFilter] = useState(""), [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AccessRequest | null>(null), [mode, setMode] = useState<"details" | "approve" | "reject">("details");
  const [role, setRole] = useState<"OPERADOR">("OPERADOR"), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const result = useApi<{ data: AccessRequest[]; count: number }>(`access-requests?${filter}&status=${status}&page=${page}`, 30000);
  function apply(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setFilter(new URLSearchParams(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>).toString()); setPage(1); }
  function open(r: AccessRequest) { setSelected(r); setMode("details"); setRole("OPERADOR"); setReason(""); setError(""); }
  async function decide() {
    if (!selected) return; setBusy(true); setError("");
    try { await api(`access-requests/${selected.id}`, "POST", mode === "approve" ? { decision: "APROVADO", approved_role: role } : { decision: "RECUSADO", reason }); setSelected(null); result.refresh(); window.dispatchEvent(new Event("access-requests-updated")); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir."); }
    finally { setBusy(false); }
  }
  return <><div className="page-heading"><div><h1>Solicitações de acesso</h1><p>Revise os dados e libere somente o perfil necessário.</p></div></div>
    <div className="filter-presets" role="tablist" aria-label="Status da solicitação">{[["PENDENTE", "Pendentes"], ["APROVADO", "Aprovadas"], ["RECUSADO", "Recusadas"], ["", "Todas"]].map(([value, label]) => <button role="tab" aria-selected={status === value} className={status === value ? "primary" : ""} key={value} onClick={() => { setStatus(value); setPage(1); }}>{label}</button>)}</div>
    <form className="panel filters" onSubmit={apply}><label className="search">Buscar nome, e-mail ou usuário<input name="q" maxLength={100} /></label><label>Função solicitada<select name="role"><option value="">Todas</option><option>OPERADOR</option></select></label><label>De<input type="date" name="from" /></label><label>Até<input type="date" name="to" /></label><button className="primary">Aplicar filtros</button></form>
    <State loading={result.loading} error={result.error} retry={result.refresh} />
    {result.data && <section className="panel table-panel"><div className="table-scroll"><table className="request-table"><thead><tr>{["Nome", "Usuário", "E-mail", "Função solicitada", "Data", "Status", "Ações"].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{result.data.data.map(r => <tr key={r.id}><td>{r.name}</td><td>{r.username}</td><td>{r.email}</td><td>{r.requested_role}</td><td>{displayDate(r.created_at)}</td><td><span className={`badge ${r.status}`}>{r.status}</span></td><td><button onClick={() => open(r)}>Analisar detalhes</button></td></tr>)}</tbody></table></div>{!result.data.count && <Empty text="Nenhuma solicitação encontrada." />}<Pager page={page} total={result.data.count} onChange={setPage} /></section>}
    <Dialog open={!!selected} onOpenChange={v => { if (!busy && !v) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>{mode === "approve" ? "Aprovar acesso" : mode === "reject" ? "Recusar solicitação" : "Detalhes da solicitação"}</DialogTitle><DialogDescription>Confira a identidade e a função antes de decidir.</DialogDescription></DialogHeader>
      {selected && <div className="stack"><dl className="detail-grid">{Object.entries({ Nome: selected.name, Usuário: selected.username, "E-mail": selected.email, "Função solicitada": selected.requested_role, Data: displayDate(selected.created_at), Status: selected.status, ...(selected.approved_role ? { "Função aprovada": selected.approved_role, "Aprovado em": displayDate(selected.approved_at!) } : {}), ...(selected.rejection_reason ? { Motivo: selected.rejection_reason, "Recusado em": displayDate(selected.rejected_at!) } : {}) }).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
      {mode === "approve" && <label>Função aprovada<select aria-label="Função aprovada" value={role} onChange={e => setRole(e.target.value as "OPERADOR")}><option>OPERADOR</option></select></label>}
      {mode === "reject" && <label>Motivo da recusa<textarea value={reason} minLength={3} maxLength={2000} onChange={e => setReason(e.target.value)} /></label>}
      {error && <div className="error" role="alert">{error}</div>}
      {selected.status === "PENDENTE" && <div className="form-actions">{mode === "details" ? <><button onClick={() => setMode("reject")}>Recusar</button><button className="primary" onClick={() => setMode("approve")}>Aprovar</button></> : <><button disabled={busy} onClick={() => setMode("details")}>Cancelar</button><button className="primary" disabled={busy || (mode === "reject" && reason.trim().length < 3)} onClick={decide}>{busy ? "Salvando…" : mode === "approve" ? "Aprovar acesso" : "Recusar solicitação"}</button></>}</div>}</div>}
    </DialogContent></Dialog>
  </>;
}

