"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { accessRequestSchema } from "@/schemas/access-request";
import { api } from "./operational/shared";
export function AccessRequestForm() {
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    const parsed = accessRequestSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) { setError("Verifique os campos: usuário deve conter apenas letras, números, ponto, hífen ou sublinhado; a senha deve ter 12 a 128 caracteres, maiúscula, minúscula e número. As senhas precisam ser iguais."); return; }
    setBusy(true);
    try { await api("access-requests", "POST", parsed.data); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao enviar."); }
    finally { setBusy(false); }
  }
  if (done) return <div className="stack" role="status"><CheckCircle2 size={36} /><h2>Solicitação enviada com sucesso.</h2><p>Seu cadastro precisa ser aprovado por um administrador antes que você possa acessar o NC SORTER.</p><Link className="button primary" href="/login">Voltar ao login</Link></div>;
  return <form className="stack" onSubmit={submit}>
    <label>Nome completo *<input name="name" required minLength={3} maxLength={150} autoComplete="name" /></label>
    <label>E-mail *<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
    <label>Usuário *<input name="username" required minLength={3} maxLength={50} pattern="[a-zA-Z0-9._\-]+" autoComplete="username" /><small className="muted">Seu identificador de conta. Não altera o usuário informado nas ocorrências.</small></label>
    <label>Senha *<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /><small className="muted">Pelo menos 12 caracteres, com maiúscula, minúscula e número.</small></label>
    <label>Confirmar senha *<input name="confirm_password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
    <label>Função desejada *<select name="requested_role" required defaultValue="OPERADOR"><option value="OPERADOR">OPERADOR</option><option value="LIDER">LIDER</option></select></label>
    {error && <div className="error" role="alert">{error}</div>}
    <button className="primary large" disabled={busy}>{busy ? "Enviando…" : "Solicitar acesso"}</button>
    <Link className="button" href="/login">Já tenho acesso — entrar</Link>
  </form>;
}
