import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const recipients = ["henrypradel9@gmail.com", "werles.ldias@mercadolivre.com", "amandafer.nascimento@mercadolivre.com"];
const escape = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]!);
const date = (v: string) => new Date(v).toLocaleString("pt-BR", { timeZone:"America/Sao_Paulo" });
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
type Row = Record<string, unknown>;
type Mail = {subject:string; html:string; attachments?: {filename:string; content:string}[]};
function db() {
 if (!process.env.SUPABASE_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
}
function transport() {
 if (!process.env.SMTP_USER || !process.env.SMTP_PASS) throw new Error("SMTP_NOT_CONFIGURED");
 return nodemailer.createTransport({host:"smtp.gmail.com",port:465,secure:true,
  auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS.replace(/\s/g,"")},
  connectionTimeout:15000,greetingTimeout:15000,socketTimeout:45000});
}
async function deliver(key:string, mail:Mail, targets=recipients) {
 const client=db();
 const smtp=transport();
 // Verify authentication before reserving delivery keys.
 await smtp.verify();
 let sent=0;
 for(const recipient of targets) {
  const deliveryKey=hash([key,recipient]);
  const messageId=`<nc-sorter-${deliveryKey}@gmail.com>`;
  const {error}=await client.from("email_deliveries").insert({delivery_key:deliveryKey,recipient,subject:mail.subject,message_id:messageId,state:"sending"});
  if(error?.code==="23505") {
   const existing=await client.from("email_deliveries").select("state").eq("delivery_key",deliveryKey).single();
   if(existing.error || existing.data.state!=="sent") throw new Error("EMAIL_REQUIRES_SENT_FOLDER_REVIEW");
   continue;
  }
  if(error) throw new Error("EMAIL_CLAIM_FAILED");
  try {
   const result=await smtp.sendMail({from:{name:"NC SORTER",address:process.env.SMTP_USER!},to:recipient,messageId,...mail});
   if(!result.accepted.map(String).includes(recipient)) throw new Error("RECIPIENT_NOT_ACCEPTED");
   const {error:saved}=await client.from("email_deliveries").update({state:"sent",sent_at:new Date().toISOString()}).eq("delivery_key",deliveryKey);
   if(saved) throw new Error("EMAIL_CONFIRMATION_NOT_SAVED");
   sent++;
  } catch {
   // SMTP may have accepted the message before a disconnect. Never blindly resend.
   await client.from("email_deliveries").update({state:"review_required"}).eq("delivery_key",deliveryKey);
   throw new Error("EMAIL_REQUIRES_SENT_FOLDER_REVIEW");
  }
 }
 return sent;
}
async function allRows(table:string, select:string, from?:string, to?:string) {
 const client=db(); const rows:Row[]=[];
 for(let offset=0;;offset+=500) {
  let query=client.from(table).select(select).order("id").range(offset,offset+499);
  if(from) query=query.gte("occurred_at",from);
  if(to) query=query.lt("occurred_at",to);
  const {data,error}=await query;
  if(error) throw new Error("REPORT_DATA_FETCH_FAILED");
  const page=data as unknown as Row[]; rows.push(...page);
  if(page.length<500) return rows;
 }
}
const named=(v:unknown) => (v && typeof v==="object" && "name" in v) ? String(v.name) : "Não informado";
function ranking(rows:Row[], field:(r:Row)=>string, packages=false) {
 const counts=new Map<string,number>();
 for(const row of rows) {const name=field(row); counts.set(name,(counts.get(name)??0)+(packages?Number(row.package_quantity):1));}
 return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}
function table(title:string, entries:[string,number][]) {
 return `<h2>${escape(title)}</h2><table border="1" cellpadding="8" cellspacing="0"><tr><th>Item</th><th>Quantidade</th></tr>${entries.map(([name,n])=>`<tr><td>${escape(name)}</td><td>${n}</td></tr>`).join("")}</table>`;
}
function csvCell(value:unknown) {
 let text=String(value??""); if(/^[\s]*[=+@-]/.test(text)) text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
export async function reportMail(from:string,to:string):Promise<Mail> {
 const [rows,alerts]=await Promise.all([
  allRows("occurrences","*,error_type:error_types(name),shift:shifts(name),registered_by:profiles!registered_by_user_id(name)",from,to),
  allRows("alerts","*")
 ]);
 const active=alerts.filter(a=>a.active && a.status!=="ACOMPANHAMENTO_REALIZADO");
 const pending=rows.filter(r=>r.status!=="RESOLVIDO");
 const totalPackages=rows.reduce((sum,r)=>sum+Number(r.package_quantity),0);
 const fields:[string,(r:Row)=>unknown][]=[
  ["ID",r=>r.id],["Data da ocorrência",r=>date(String(r.occurred_at))],["Colaborador",r=>r.occurrence_user],
  ["Tipo de erro",r=>named(r.error_type)],["Turno",r=>named(r.shift)],["Canalização",r=>r.canalizacao],
  ["Quantidade de pacotes",r=>r.package_quantity],["Status",r=>r.status],["HU",r=>r.hu],["ID pacote",r=>r.package_id],
  ["TT",r=>r.tt],["Observações",r=>r.observations],["Registrado por",r=>named(r.registered_by)],["Data do registro",r=>date(String(r.created_at))]
 ];
 const csv="\uFEFF"+[fields.map(([name])=>csvCell(name)).join(";"),...rows.map(r=>fields.map(([,read])=>csvCell(read(r))).join(";"))].join("\r\n");
 const html=`<h1>NC SORTER — Visão gerencial completa</h1><p>${escape(date(from))} até ${escape(date(to))} (fim exclusivo, Brasília)</p>
 <p><strong>${rows.length}</strong> ocorrências · <strong>${totalPackages}</strong> pacotes registrados · <strong>${pending.length}</strong> ocorrências não resolvidas no período · <strong>${active.length}</strong> alertas ativos atuais.</p>
 <p>Pacotes representam a soma informada nos registros, não pacotes únicos. Os rankings mostram quantidade de ocorrências, sem ajuste pelo volume de trabalho de cada colaborador.</p>
 ${table("Situação das ocorrências",ranking(rows,r=>String(r.status)))}
 ${table("Tipos de erro mais frequentes",ranking(rows,r=>named(r.error_type)))}
 ${table("Colaboradores com mais ocorrências",ranking(rows,r=>String(r.occurrence_user_normalized)))}
 ${table("Pacotes registrados por colaborador",ranking(rows,r=>String(r.occurrence_user_normalized),true))}
 ${table("Ocorrências por turno",ranking(rows,r=>named(r.shift)))}
 ${table("Ocorrências por canalização",ranking(rows,r=>String(r.canalizacao||"Não informada")))}
 <h2>Pendências do período</h2><ul>${pending.map(r=>`<li>${escape(r.occurrence_user)} — ${escape(named(r.error_type))} — ${escape(r.status)} — ${escape(date(String(r.occurred_at)))}</li>`).join("")||"<li>Nenhuma.</li>"}</ul>
 <h2>Alertas ativos no momento do envio</h2><ul>${active.map(a=>`<li>${escape(a.occurrence_user)} — marco ${escape(a.milestone)} — ${escape(a.occurrence_count)} ocorrências — ${escape(a.most_frequent_error)} — turnos ${escape((a.shifts as string[]).join(", "))} — ${escape(a.status)}</li>`).join("")||"<li>Nenhum.</li>"}</ul>
 <p>O CSV anexo contém todos os registros do período.</p>`;
 return {subject:`NC SORTER — Relatório gerencial semanal — ${date(to).split(",")[0]}`,html,attachments:[{filename:"nc-sorter-ocorrencias-completas.csv",content:csv}]};
}
export async function runEmailJob(mode:"scheduled"|"test"="scheduled") {
 if(mode==="test") {
  const end=new Date(); const start=new Date(end.getTime()-7*86400000);
  const mail=await reportMail(start.toISOString(),end.toISOString());
  mail.subject="TESTE EM NUVEM — "+mail.subject;
  return {sent:await deliver("cloud-test:"+(process.env.VERCEL_DEPLOYMENT_ID??"local-v1"),mail,["henrypradel9@gmail.com"])};
 }
 // Feature switch prevents sends until SMTP and the production test are verified.
 if(process.env.EMAIL_AUTOMATION_ENABLED!=="true") return {disabled:true,sent:0};
 let sent=0; let failures=0;
 const alerts=(await allRows("alerts","*")).filter(a=>a.active && a.status!=="ACOMPANHAMENTO_REALIZADO");
 for(const a of alerts) {
  const snapshot={id:a.id,collaborator:a.occurrence_user,milestone:a.milestone,count:a.occurrence_count,error:a.most_frequent_error,shifts:a.shifts,last:a.last_occurrence,status:a.status};
  try { sent+=await deliver("alert:"+hash(snapshot),{subject:`NC SORTER — Alerta: ${a.occurrence_user} — marco ${a.milestone}`,
   html:`<h1>Alerta de reincidência</h1><p>Colaborador: <strong>${escape(a.occurrence_user)}</strong></p><p>Marco: ${escape(a.milestone)} · Ocorrências: ${escape(a.occurrence_count)}</p><p>Erro mais frequente: ${escape(a.most_frequent_error)}</p><p>Turnos: ${escape((a.shifts as string[]).join(", "))}</p><p>Última ocorrência do marco: ${escape(date(String(a.last_occurrence)))}</p><p>Status: ${escape(a.status)}</p><p><a href="https://nc-sorter-manual.vercel.app/alertas">Abrir NC SORTER</a></p>`});
  } catch { failures++; }
 }
 // Brazil uses UTC-3. Run Sunday from 08:00 onward; stable key allows safe catch-up that day.
 const now=new Date(); const local=new Date(now.getTime()-3*3600000);
 if(local.getUTCDay()===0 && local.getUTCHours()>=8) {
  const end=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate(),11));
  const start=new Date(end.getTime()-7*86400000);
  try { sent+=await deliver("weekly:"+end.toISOString(),await reportMail(start.toISOString(),end.toISOString())); }
  catch { failures++; }
 }
 if(failures) throw new Error("EMAIL_DELIVERY_FAILURES_REVIEW_REQUIRED");
 return {sent};
}
