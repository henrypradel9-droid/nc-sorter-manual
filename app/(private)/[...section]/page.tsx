import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { authorize, HttpError } from "@/lib/auth";
import { Dashboard } from "@/components/operational/dashboard";
import { AccessRequests } from "@/components/operational/access-requests";
import { OccurrenceList } from "@/components/operational/occurrence-list";
import {
  OccurrenceForm,
  OccurrenceDetail,
} from "@/components/operational/occurrence-form";
import { CatalogPage } from "@/components/operational/catalogs";
import { catalogNames } from "@/lib/domain";
import { Alerts } from "@/components/operational/alerts";
import {
  SettingsPage,
  UsersPage,
  AuditPage,
  AccountPage,
} from "@/components/operational/admin";
import { configured } from "@/lib/supabase";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  if (!configured()) redirect("/login");
  const session = await authorize().catch((e) => {
    if (e instanceof HttpError) redirect("/login");
    throw e;
  });
  const { profile } = session;
  const { section } = await params;
  const [page, id] = section;
  let content;
  if (profile.role !== "ADMIN" && !["ocorrencias", "alertas", "conta"].includes(page))
    redirect("/ocorrencias/nova");
  if (
    profile.role !== "ADMIN" &&
    ["usuarios", "auditoria", "configuracoes", "administracao"].includes(page)
  )
    redirect("/ocorrencias/nova");
  switch (page) {
    case "administracao":
      if (id !== "solicitacoes") notFound();
      content = <AccessRequests />;
      break;
    case "dashboard":
      content = <Dashboard />;
      break;
    case "ocorrencias":
      content =
        id === "nova" ? (
          <>
            <div className="page-heading">
              <div>
                <h1>Nova ocorrência</h1>
                <p>Preencha os dados observados na operação.</p>
              </div>
            </div>
            <OccurrenceForm role={profile.role} />
          </>
        ) : id ? (
          <OccurrenceDetail id={id} role={profile.role} />
        ) : (
          <OccurrenceList />
        );
      break;
    case "relatorios":
      content = <OccurrenceList report />;
      break;
    case "alertas":
      content = <Alerts key={id ?? "ativos"} historyMode={id === "historico"} canManage={profile.role === "ADMIN"} />;
      break;
    case "cadastros":
      if (!catalogNames[id]) notFound();
      content = <CatalogPage table={id} />;
      break;
    case "usuarios":
      content = <UsersPage />;
      break;
    case "auditoria":
      content = <AuditPage />;
      break;
    case "configuracoes":
      content = <SettingsPage />;
      break;
    case "conta":
      content = <AccountPage profile={profile} />;
      break;
    default:
      notFound();
  }
  return <Suspense fallback={<p>Carregando…</p>}>{content}</Suspense>;
}
