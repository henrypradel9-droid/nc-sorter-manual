import { Brand } from "@/components/brand";
import { AccessRequestForm } from "@/components/access-request-form";
export default function RequestAccess() {
  return <main className="request-access"><header><Brand /></header><section className="panel request-card"><span className="eyebrow blue">FAÇA PARTE DA OPERAÇÃO</span><h1>Solicitar acesso</h1><p className="muted">Preencha seus dados. Um administrador analisará sua solicitação antes de liberar o acesso.</p><AccessRequestForm /></section></main>;
}
