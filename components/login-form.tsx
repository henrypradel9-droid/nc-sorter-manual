"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LockKeyhole, LoaderCircle } from "lucide-react";
export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(data.error);
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível entrar.");
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="stack">
      <label>
        E-mail
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="seu.email@empresa.com"
          disabled={busy}
        />
      </label>
      <label>
        Senha
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="Digite sua senha"
          disabled={busy}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!configured && (
        <div className="notice">
          O ambiente está em preparação. O acesso será liberado após a
          configuração do banco e do primeiro administrador.
        </div>
      )}
      <button className="primary large" disabled={busy || !configured}>
        {busy ? (
          <LoaderCircle className="animate-spin" size={18} />
        ) : (
          <LockKeyhole size={18} />
        )}
        Entrar no NC SORTER
      </button>
      <p className="muted small">
        O acesso de novas contas depende da aprovação de um administrador.
      </p>
    </form>
  );
}
