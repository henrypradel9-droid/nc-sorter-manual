"use client";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  LayoutDashboard,
  Plus,
  Rows3,
  Bell,
  ChartNoAxesCombined,
  Tags,
  Clock3,
  Route,
  Users,
  History,
  Settings,
  LogOut,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Brand } from "./brand";
import { AlertCount } from "./alert-count";
import { AccessRequestCount } from "./access-request-count";
import type { Profile } from "@/lib/domain";
import { Toaster, toast } from "sonner";
const nav = [
  {
    label: "Operação",
    items: [
      ["Dashboard", "/dashboard", LayoutDashboard, "leader"],
      ["Nova ocorrência", "/ocorrencias/nova", Plus, "all"],
      ["Todas as ocorrências", "/ocorrencias", Rows3, "all"],
      ["Alertas", "/alertas", Bell, "leader"],
      ["Relatórios", "/relatorios", ChartNoAxesCombined, "leader"],
    ],
  },
  {
    label: "Cadastros",
    items: [
      ["Tipos de erro", "/cadastros/error_types", Tags, "leader"],
      ["Turnos", "/cadastros/shifts", Clock3, "leader"],
      ["Canalizações", "/cadastros/canalizacoes", Route, "leader"],
    ],
  },
  {
    label: "Administração",
    items: [
      ["Solicitações de acesso", "/administracao/solicitacoes", Users, "admin"],
      ["Usuários", "/usuarios", Users, "admin"],
      ["Auditoria", "/auditoria", History, "admin"],
      ["Configurações", "/configuracoes", Settings, "admin"],
    ],
  },
] as const;
export function Shell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const path = usePathname(),
    [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      const r = await fetch("/api/auth/logout", { method: "POST" });
      if (!r.ok) throw new Error();
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Não foi possível sair. Tente novamente.");
      setBusy(false);
    }
  }
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link
            href={profile.role === "OPERADOR" ? "/ocorrencias" : "/dashboard"}
          >
            <Brand />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          {nav.map((group) => {
            const items = group.items.filter(
              (i) =>
                i[3] === "all" ||
                (i[3] === "leader" && profile.role !== "OPERADOR") ||
                profile.role === "ADMIN",
            );
            return (
              items.length > 0 && (
                <SidebarGroup key={group.label}>
                  <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                  <SidebarMenu>
                    {items.map(([name, href, Icon]) => (
                      <SidebarMenuItem key={href}>
                        <SidebarMenuButton
                          asChild
                          isActive={path === href}
                          tooltip={name}
                        >
                          <Link href={href}>
                            <Icon />
                            <span>{name}</span>
                            {href === "/alertas" && <AlertCount />}
                            {href === "/administracao/solicitacoes" && <AccessRequestCount />}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroup>
              )
            );
          })}
        </SidebarContent>
        <SidebarFooter>
          <div className="sidebar-foot">
            Dados da operação
            <br />
            <strong>Uma fonte. Uma visão.</strong>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div>
            <SidebarTrigger />
            <span className="topbar-label">CENTRAL OPERACIONAL</span>
          </div>
          <div>
            <Link className="account-link" href="/conta">
              <span className="avatar">
                {profile.name.slice(0, 2).toUpperCase()}
              </span>
              <span>
                {profile.name}
                <small>{profile.role}</small>
              </span>
            </Link>
            <button
              className="icon-button"
              aria-label="Sair"
              disabled={busy}
              onClick={logout}
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <main className="workspace">{children}</main>
        <footer className="workspace-footer">
          NC SORTER <span>Controle operacional de sorting</span>
        </footer>
      </SidebarInset>
      <Toaster richColors position="top-right" />
    </SidebarProvider>
  );
}
