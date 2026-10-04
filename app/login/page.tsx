import { Brand } from "@/components/brand";
import { SorterIllustration } from "@/components/sorter-illustration";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { configured } from "@/lib/supabase";
import { CheckCircle2, ScanLine, ListChecks, ShieldCheck } from "lucide-react";
export const dynamic = "force-dynamic";
export default function Login() {
  return (
    <main className="login">
      <section className="login-story">
        <Brand />
        <div className="login-message">
          <span className="eyebrow">PRECISÃO EM CADA ETAPA</span>
          <h1>
            Sua operação.
            <br />
            Sob controle.
          </h1>
          <p>
            Registre ocorrências, acompanhe a operação e transforme informação
            em ação.
          </p>
          <SorterIllustration />
          <div className="login-points">
            <span>
              <ScanLine />
              Registro rápido e organizado
            </span>
            <span>
              <ListChecks />
              Acompanhamento em um só lugar
            </span>
            <span>
              <ShieldCheck />
              Histórico e acesso por perfil
            </span>
          </div>
        </div>
        <footer>
          NC SORTER <span>Registro · Acompanhamento · Melhoria</span>
        </footer>
      </section>
      <section className="login-entry">
        <div className="login-box">
          <span className="eyebrow blue">
            <CheckCircle2 size={17} /> ACESSO À OPERAÇÃO
          </span>
          <h2>Bem-vindo de volta</h2>
          <p className="muted">Entre com sua conta para continuar.</p>
          <LoginForm configured={configured()} />
          <div className="access-link"><p>Ainda não possui acesso?</p><Link className="button" href="/solicitar-acesso">Solicitar acesso</Link></div>
          <div className="login-foot">
            Ambiente operacional · Acesso autorizado
          </div>
        </div>
      </section>
    </main>
  );
}
