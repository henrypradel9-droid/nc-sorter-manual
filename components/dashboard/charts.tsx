"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers3, Clock3, Activity, CircleCheck, ArrowUpRight } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Empty } from "../operational/shared";
import { comparison, occurrenceLink, type DashboardData, type SeriesItem, type TrendPoint } from "@/lib/dashboard";
const colors = ["#2d2d72", "#edbd12", "#147d68", "#756dc3", "#b66422", "#337da3", "#a54779"];
const emptyText = "Nenhuma ocorrência encontrada para os filtros selecionados.";
const dateLabel = (day: string) => day.split("-").reverse().join("/");

export function DashboardKpiCard({ title, value, previous, series, field, href }: { title: string; value: number; previous: number; series: TrendPoint[]; field: "total" | "pending" | "progress" | "resolved"; href: string }) {
  const Icon = { total: Layers3, pending: Clock3, progress: Activity, resolved: CircleCheck }[field];
  return <Link className="stat kpi" href={href}><div className="kpi-heading"><span className="kpi-icon"><Icon size={18} aria-hidden="true" /></span><ArrowUpRight className="kpi-arrow" size={16} aria-hidden="true" /></div><span>{title}</span><strong>{value.toLocaleString("pt-BR")}</strong><small>{comparison(value, previous)}</small>{series.length > 1 && series.some(x => x[field] > 0) && <div className="sparkline" aria-hidden><ResponsiveContainer width="100%" height="100%"><AreaChart data={series}><Area type="linear" dataKey={field} stroke="#2d2d72" fill="#2d2d7220" isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>}</Link>;
}

export function OccurrenceTrendChart({ series, historical = false, grouping }: { series: TrendPoint[]; historical?: boolean; grouping: string }) {
  const hasData = series.some(x => x.total > 0);
  return <section className="panel"><h2>{historical ? "Tendência de ocorrências" : "Evolução de ocorrências"}</h2><p className="small muted">{historical ? "Histórico real. Média móvel de 7 intervalos quando há pelo menos 7 intervalos; não é previsão." : `Agrupamento por ${grouping === "day" ? "dia" : grouping === "week" ? "semana (início na segunda-feira)" : "mês"}. Status atual das ocorrências em cada intervalo.`}</p>{hasData ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={series}><CartesianGrid stroke="#e5e5ef" vertical={false} /><XAxis dataKey="name" tickFormatter={value => dateLabel(String(value)).slice(0, 5)} minTickGap={24} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} width={40} /><Tooltip contentStyle={{borderRadius: 12, borderColor: "#e7e7ef", boxShadow: "0 8px 28px #2d2d7212", fontSize: 12}} labelFormatter={v => dateLabel(String(v))} /><Legend wrapperStyle={{fontSize: 11, paddingTop: 12}} /><Line isAnimationActive={false} dataKey="total" name="Total" stroke={colors[0]} strokeWidth={3} dot={series.length < 15} type="linear" />{historical ? <Line isAnimationActive={false} dataKey="average" name="Média de 7 intervalos" stroke={colors[1]} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} /> : <><Line isAnimationActive={false} dataKey="pending" name="Pendentes" stroke="#b77700" dot={false} /><Line isAnimationActive={false} dataKey="progress" name="Em andamento" stroke="#527ab9" dot={false} /><Line isAnimationActive={false} dataKey="resolved" name="Resolvidas" stroke="#147d68" dot={false} /></>}</LineChart></ResponsiveContainer></div> : <Empty text={emptyText} />}</section>;
}

export function DistributionChart({ title, data, query, filterKey }: { title: string; data: SeriesItem[]; query: string; filterKey: string }) {
  const router = useRouter(); const total = data.reduce((n,x)=>n+x.total,0);
  return <section className="panel"><h2>{title}</h2>{total ? <><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={data} dataKey="total" nameKey="name" innerRadius="53%" outerRadius="85%" paddingAngle={2} onClick={(_, index) => { const row = data[index]; if(row) router.push(occurrenceLink(query,filterKey,row.id ?? row.name)); }} style={{cursor:"pointer"}}>{data.map((x,i)=><Cell key={x.id ?? x.name} fill={colors[i%colors.length]} />)}</Pie><Tooltip contentStyle={{borderRadius: 12, borderColor: "#e7e7ef", boxShadow: "0 8px 28px #2d2d7212", fontSize: 12}} formatter={(value) => [`${Number(value)} ocorrências · ${(Number(value)/total*100).toLocaleString("pt-BR",{maximumFractionDigits:1})}%`, "Quantidade"]} /></PieChart></ResponsiveContainer><div className="donut-total" aria-hidden><strong>{total}</strong><small>ocorrências</small></div></div><div className="chart-legend">{data.map((row,i)=><Link href={occurrenceLink(query,filterKey,row.id ?? row.name)} key={row.id ?? row.name} title={`${row.name}: ${row.total} ocorrências`}><span className="legend-dot" style={{background:colors[i%colors.length]}} /><span>{row.name}</span><strong>{row.total}</strong><small>{(row.total/total*100).toLocaleString("pt-BR",{maximumFractionDigits:1})}%</small></Link>)}</div></> : <Empty text={emptyText} />}</section>;
}

export function BreakdownChart({ title, data, query, filterKey }: { title: string; data: SeriesItem[]; query: string; filterKey: string }) {
  const router = useRouter();
  return <section className="panel"><h2>{title}</h2>{data.length ? <><div className="bar-scroll"><div style={{height:Math.max(220,data.length*42)}}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{right:25}}><CartesianGrid horizontal={false} stroke="#e5e5ef" /><XAxis type="number" allowDecimals={false} /><YAxis dataKey="name" type="category" width={115} tick={{fontSize:12}} /><Tooltip contentStyle={{borderRadius: 12, borderColor: "#e7e7ef", boxShadow: "0 8px 28px #2d2d7212", fontSize: 12}} formatter={v=>[`${v} ocorrências`,"Quantidade"]} /><Bar isAnimationActive={false} dataKey="total" fill="#edbd12" radius={[0,5,5,0]} onClick={(_,i)=>{const row=data[i]; if(row) router.push(occurrenceLink(query,filterKey,row.id ?? row.name));}} style={{cursor:"pointer"}} /></BarChart></ResponsiveContainer></div></div><details className="chart-data"><summary>Ver dados e abrir ocorrências</summary>{data.map(row=><Link key={row.id ?? row.name} href={occurrenceLink(query,filterKey,row.id ?? row.name)}>{row.name}<strong>{row.total}</strong></Link>)}</details></> : <Empty text={emptyText} />}</section>;
}

export function OccurrenceUserRanking({ data, query }: { data: SeriesItem[]; query: string }) {
  const max = Math.max(1,...data.map(x=>x.total));
  return <section className="panel"><h2>Usuários com mais ocorrências</h2><p className="small muted">Top 10 pelo usuário informado na ocorrência, normalizado.</p>{data.length ? <ol className="user-ranking">{data.map((row,i)=><li key={row.name}><Link href={occurrenceLink(query,"occurrence_user",row.name)}><span className="rank-number">{i+1}</span><div><div className="rank-label"><span>{row.name}</span><strong>{row.total}</strong></div><div className="rank-track"><span style={{width:`${row.total/max*100}%`}} /></div></div></Link></li>)}</ol> : <Empty text={emptyText} />}</section>;
}

export function OccurrenceHeatmap({ data }: { data: DashboardData["heatmap"] }) {
  const channels = [...new Map(data.map(x=>[x.id,{id:x.id,name:x.name}])).values()];
  const counts = new Map(data.map(x=>[`${x.id}:${x.hour}`,x.total]));
  const max = Math.max(1,...data.map(x=>x.total)); const hours=Array.from({length:12},(_,i)=>i*2);
  return <section className="panel"><h2>Mapa de calor de ocorrências</h2><p className="small muted">Faixas de 2 horas · Horário de São Paulo · Valores reais do período</p>{data.length ? <div className="table-scroll heatmap"><table><thead><tr><th>Canalização</th>{hours.map(h=><th key={h}>{String(h).padStart(2,"0")}h</th>)}</tr></thead><tbody>{channels.map(c=><tr key={c.id}><th scope="row">{c.name}</th>{hours.map(h=>{const n=counts.get(`${c.id}:${h}`)??0; const text=`Canalização: ${c.name} · Faixa: ${h}h–${h+2}h · Ocorrências: ${n}`; return <td key={h}><span tabIndex={0} title={text} aria-label={text} style={{background:n ? `rgba(45,45,114,${.12+.88*n/max})` : "#f4f4f8",color:n/max>.5?"white":"#2d2d72"}}>{n}<span className="heat-tooltip">{text}</span></span></td>;})}</tr>)}</tbody></table></div> : <Empty text={emptyText} />}<div className="heat-scale">Menor concentração <span /> Maior concentração</div></section>;
}

