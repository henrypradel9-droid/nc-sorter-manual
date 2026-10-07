"use client";
import { useState, type FormEvent } from "react";
import { operationalDate } from "@/lib/domain";
import { dateShift } from "@/lib/dashboard";
import { Pick, type Lookups } from "../operational/shared";
export function DashboardFilters({ value, onApply, lookups }: { value: string; onApply: (q:string)=>void; lookups?: Lookups }) {
  const initial=new URLSearchParams(value); const today=operationalDate(new Date());
  const [from,setFrom]=useState(initial.get("from")||today), [to,setTo]=useState(initial.get("to")||today), [shift,setShift]=useState(initial.get("shift_id")||""), [canal,setCanal]=useState(initial.get("canalizacao")||""), [group,setGroup]=useState(initial.get("grouping")||"day");
  const [error,setError]=useState("");
  function apply(e:FormEvent) {e.preventDefault(); if(from>to){setError("A data final deve ser igual ou posterior à inicial.");return;} setError(""); const p=new URLSearchParams(value); for(const [k,v] of Object.entries({from,to,shift_id:shift,canalizacao:canal,grouping:group})){if(v)p.set(k,v);else p.delete(k);} p.delete("from_at");p.delete("to_at");onApply(p.toString());}
  function preset(days:number) {setFrom(days===0?today.slice(0,7)+"-01":dateShift(today,1-days));setTo(today);}
  return <form className="panel dashboard-filters" onSubmit={apply}><div className="filter-presets">{[[1,"Hoje"],[7,"Últimos 7 dias"],[30,"Últimos 30 dias"],[0,"Este mês"]].map(([days,label])=><button type="button" key={label} onClick={()=>preset(Number(days))}>{label}</button>)}<span className="small muted">Ou personalize o período abaixo</span></div><div className="filters"><label>De<input type="date" required value={from} onChange={e=>setFrom(e.target.value)} /></label><label>Até<input type="date" required value={to} onChange={e=>setTo(e.target.value)} /></label><Pick label="Turno" value={shift} onChange={setShift} options={lookups?.shifts??[]} all="Todos" /><label>Canalização<input value={canal} maxLength={150} onChange={e=>setCanal(e.target.value)} placeholder="Todas ou digite a canalização" /></label><label>Agrupamento<select value={group} onChange={e=>setGroup(e.target.value)}><option value="day">Por dia</option><option value="week">Por semana</option><option value="month">Por mês</option></select></label><div className="filter-actions"><button className="primary">Aplicar filtros</button></div></div>{error&&<div className="error" role="alert">{error}</div>}</form>;
}
