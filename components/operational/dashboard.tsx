"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Bell } from "lucide-react";
import { operationalDate } from "@/lib/domain";
import { occurrenceLink, type DashboardData } from "@/lib/dashboard";
import { useApi, State, Empty, type Lookups } from "./shared";
import { DashboardFilters } from "../dashboard/filters";
import { DashboardKpiCard, OccurrenceTrendChart, DistributionChart, BreakdownChart, OccurrenceUserRanking, OccurrenceHeatmap } from "../dashboard/charts";
import { OccurrenceTable } from "./occurrence-list";
export function Dashboard() {
  const params=useSearchParams();
  const [query,setQuery]=useState(()=> {const p=new URLSearchParams(params); const today=operationalDate(new Date()); if(!p.get("from"))p.set("from",today);if(!p.get("to"))p.set("to",today);return p.toString();});
  const result=useApi<DashboardData>("dashboard-v2?"+query,30000),lookups=useApi<Lookups>("lookups");
  const d=result.data;
  return <><div className="page-heading"><div><span className="eyebrow blue">NC SORTER · INTELIGÊNCIA OPERACIONAL</span><h1>Visão operacional</h1><p>Dados reais para acompanhar a operação e direcionar ações.</p></div><Link className="button primary" href="/ocorrencias/nova"><Plus size={17}/>Nova ocorrência</Link></div>
    <DashboardFilters key={query} value={query} onApply={setQuery} lookups={lookups.data}/>
    <State loading={result.loading} error={result.error ?? lookups.error} retry={()=>{result.refresh();lookups.refresh();}}/>
    {d && <><p className="small muted">Período: {d.from.split('-').reverse().join('/')} a {d.to.split('-').reverse().join('/')} · Comparação: {d.previous.from.split('-').reverse().join('/')} a {d.previous.to.split('-').reverse().join('/')} · Mesmos filtros nos dois períodos.</p>
      <div className="stats dashboard-kpis">{([['Total de ocorrências','total',''],['Pendentes','pending','PENDENTE'],['Em andamento','progress','EM_ANDAMENTO'],['Resolvidas','resolved','RESOLVIDO']] as const).map(([title,key,status])=><DashboardKpiCard key={key} title={title} value={d[key]} previous={d.previous[key]} field={key} series={d.series} href={occurrenceLink(query,status?'status':undefined,status)}/>)}<section className="stat"><span>Taxa de resolvidas</span><strong>{d.total?`${(d.resolved/d.total*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`:'—'}</strong><small>{d.total?`${d.resolved} de ${d.total} no período`:'Sem ocorrências no período'}</small></section></div>
      <Link className="notice flex gap-3 items-center mb-5" href={'/alertas?'+query}><Bell size={19}/><strong>{d.alerts} usuários em alerta no período</strong><span>Acompanhar alertas</span></Link>
      <OccurrenceTrendChart series={d.series} grouping={d.grouping}/>
      <div className="charts dashboard-charts"><DistributionChart title="Ocorrências por tipo de erro" data={d.errors} query={query} filterKey="error_type_id"/><DistributionChart title="Status das ocorrências" data={[{id:'PENDENTE',name:'Pendentes',total:d.pending},{id:'EM_ANDAMENTO',name:'Em andamento',total:d.progress},{id:'RESOLVIDO',name:'Resolvidas',total:d.resolved}]} query={query} filterKey="status"/><BreakdownChart title="Ocorrências por turno" data={d.shifts} query={query} filterKey="shift_id"/><BreakdownChart title="Ocorrências por canalização" data={d.routing} query={query} filterKey="canalizacao_id"/><OccurrenceUserRanking data={d.users} query={query}/><OccurrenceTrendChart series={d.series} grouping={d.grouping} historical/></div>
      <OccurrenceHeatmap data={d.heatmap}/>
      <section className="panel table-panel dashboard-latest"><div className="panel-heading"><h2>Últimas ocorrências registradas</h2><Link className="button" href={occurrenceLink(query)}>Ver todas</Link></div>{d.latest.length?<OccurrenceTable rows={d.latest}/>:<Empty text="Nenhuma ocorrência encontrada para os filtros selecionados."/>}</section>
    </>}
  </>;
}
