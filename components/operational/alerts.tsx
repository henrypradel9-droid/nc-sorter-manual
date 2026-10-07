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
import { type Alert, type FollowUp, displayDate } from "@/lib/domain";
import { api, useApi, State, Empty, Pager, type Lookups } from "./shared";
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
      window.dispatchEvent(new Event("alerts-updated"));
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
export function Alerts({historyMode=false,canManage=true}:{historyMode?:boolean;canManage?:boolean}) {
  const search=useSearchParams();
  const [page,setPage]=useState(1),[history,setHistory]=useState(historyMode),[selected,setSelected]=useState<string>();
  const [filters,setFilters]=useState(()=>({from:search.get("from")??"",to:search.get("to")??"",occurrence_user:search.get("occurrence_user")??"",status:"",responsible:""}));
  const query=new URLSearchParams({...filters,page:String(page),history:String(history)}).toString();
  const result=useApi<{data:Alert[];count:number}>("alerts?"+query,30000);
  const lookups=useApi<Lookups>("lookups",0,canManage);
  function change(key:keyof typeof filters,value:string){setFilters(v=>({...v,[key]:value}));setPage(1);}
  async function open(a:Alert){try{if(!canManage)return;if(a.status==="NOVO")await api("alerts/"+a.id+"/view","POST",{});setSelected(a.id);result.refresh();}catch(e){toast.error(e instanceof Error?e.message:"Não foi possível abrir.");}}
  return <><div className="page-heading"><div><h1>Alertas de reincidência</h1><p>Acompanhe situações atuais e consulte os registros anteriores.</p></div></div>
    <div className="flex gap-3 mb-5"><button className={!history?"primary":""} aria-pressed={!history} onClick={()=>{setHistory(false);setPage(1);}}>Ativos</button><button className={history?"primary":""} aria-pressed={history} onClick={()=>{setHistory(true);setPage(1);}}>Histórico</button></div>
    <div className="panel filters"><label>Usuário<input value={filters.occurrence_user} maxLength={100} placeholder="Usuário exato" onChange={e=>change("occurrence_user",e.target.value)}/></label><label>De<input type="date" value={filters.from} onChange={e=>change("from",e.target.value)}/></label><label>Até<input type="date" value={filters.to} onChange={e=>change("to",e.target.value)}/></label><label>Status<select value={filters.status} onChange={e=>change("status",e.target.value)}><option value="">Todos</option>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>{canManage && <label>Responsável pelo acompanhamento<select value={filters.responsible} onChange={e=>change("responsible",e.target.value)}><option value="">Todos</option>{lookups.data?.profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}</div>
    <State loading={result.loading} error={result.error} retry={result.refresh}/>
    {result.data&&<><div className="alert-grid">{result.data.data.map(a=>{const latest=[...(a.follow_ups??[])].sort((x,y)=>y.created_at.localeCompare(x.created_at))[0];return <article className="panel alert-card" key={a.id}><div className="flex justify-between gap-4"><strong>{a.occurrence_user}</strong><span className="badge PENDENTE">{labels[a.status]}</span></div><span>{a.occurrence_count} ocorrências no período</span><div className="alert-meta"><span>Erro mais frequente<br/><strong className="text-sm!">{a.most_frequent_error}</strong></span><span>Turnos<br/>{a.shifts.join(", ")}</span></div><small className="muted">Data do alerta: {displayDate(a.created_at)}<br/>Período: {displayDate(a.period_start)} – {displayDate(a.period_end)}<br/>{canManage && (latest?<>Acompanhamento: {displayDate(latest.created_at)}<br/>Responsável: {latest.responsible?.name??"—"}</>:"Sem acompanhamento registrado.")}</small>{canManage && <button onClick={()=>open(a)}>Ver detalhes e acompanhamento</button>}</article>;})}</div>{!result.data.data.length&&<Empty text={history?"Nenhum alerta no histórico para estes filtros.":"Nenhum alerta aguardando acompanhamento."}/>}<Pager page={page} total={result.data.count} onChange={setPage}/></>}
    {canManage&&selected&&<AlertDetail id={selected} onClose={()=>setSelected(undefined)} onSaved={result.refresh}/>}</>;
}
