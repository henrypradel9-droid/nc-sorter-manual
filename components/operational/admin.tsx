"use client";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Trash2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { type Profile, type Audit, displayDate, roles } from "@/lib/domain";
import { api, useApi, State, Pager, Pick, Empty } from "./shared";
type Settings = { recurrence_limit: number; operational_start_hour: number };
function SettingsForm({ settings }: { settings: Settings }) {
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("settings", "PATCH", {
        recurrence_limit: Number(f.get("limit")),
        operational_start_hour: Number(f.get("hour")),
      });
      toast.success("Configurações salvas e alertas recalculados.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="panel stack max-w-2xl">
      <h2>Reincidência por dia operacional</h2>
      <p className="muted">
        Um alerta é gerado quando a quantidade de ocorrências é maior que o
        limite. A contagem considera o Usuário da ocorrência.
      </p>
      <label>
        Limite de reincidência
        <input
          name="limit"
          type="number"
          min={1}
          max={10000}
          required
          defaultValue={settings.recurrence_limit}
        />
      </label>
      <label>
        Hora de início do dia operacional
        <input
          name="hour"
          type="number"
          min={0}
          max={23}
          required
          defaultValue={settings.operational_start_hour}
        />
      </label>
      <p className="notice">
        Fuso: America/Sao_Paulo. Alterar a regra recalcula os alertas e preserva
        os acompanhamentos anteriores.
      </p>
      <button className="primary" disabled={busy}>
        {busy ? "Recalculando…" : "Salvar configurações"}
      </button>
    </form>
  );
}
export function SettingsPage() {
  const result = useApi<Settings>("settings");
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Configurações</h1>
          <p>Regras de acompanhamento da operação.</p>
        </div>
      </div>
      <State
        loading={result.loading}
        error={result.error}
        retry={result.refresh}
      />
      {result.data && <SettingsForm settings={result.data} />}
    </>
  );
}
function UserEditor({
  item,
  onClose,
  onSaved,
}: {
  item?: Profile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState(item?.role ?? "OPERADOR"),
    [active, setActive] = useState(item?.active ?? true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api(
        "users",
        item ? "PATCH" : "POST",
        item
          ? { id: item.id, name: f.get("name"), role, active }
          : { name: f.get("name"), email: f.get("email"), role },
      );
      toast.success(item ? "Usuário atualizado." : "Convite enviado.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {item ? "Editar acesso" : "Convidar usuário"}
          </DialogTitle>
          <DialogDescription>
            {item
              ? "O bloqueio é aplicado também às sessões existentes."
              : "Um e-mail será enviado para que a pessoa configure sua senha."}
          </DialogDescription>
        </DialogHeader>
        <form className="stack" onSubmit={save}>
          <label>
            Nome
            <input
              name="name"
              required
              maxLength={150}
              defaultValue={item?.name}
            />
          </label>
          {!item && (
            <label>
              E-mail
              <input name="email" type="email" required />
            </label>
          )}
          <Pick
            label="Perfil"
            value={role}
            onChange={(v) => setRole(v as Profile["role"])}
            options={roles.map((r) => ({ id: r, name: r }))}
            required
          />
          {item && (
            <label className="flex-row items-center">
              <Switch checked={active} onCheckedChange={setActive} />
              Acesso ativo
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy}>
            {busy ? "Salvando…" : item ? "Salvar acesso" : "Enviar convite"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function UserDeletion({ item, onClose, onDeleted }: { item: Profile; onClose: () => void; onDeleted: () => void }) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("users", "DELETE", { id: item.id, confirmation_email: confirmation.trim() });
      toast.success("Usuário excluído. O histórico foi preservado.");
      onDeleted();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível excluir o usuário."); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Excluir usuário?</DialogTitle><DialogDescription><strong>{item.name}</strong> perderá o acesso e sairá da lista de usuários. As ocorrências e a auditoria serão preservadas. O acesso excluído não poderá ser reativado nesta tela.</DialogDescription></DialogHeader><form className="stack" onSubmit={remove}><p className="small muted">Para confirmar, digite <strong>{item.email}</strong>.</p><label>E-mail de confirmação<input type="email" required autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} /></label>{error && <p className="error" role="alert">{error}</p>}<div className="form-actions"><button type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="danger-button" disabled={busy || confirmation.trim().toLowerCase() !== item.email.trim().toLowerCase()}><Trash2 size={16} />{busy ? "Excluindo…" : "Excluir usuário"}</button></div></form></DialogContent></Dialog>;
}
export function UsersPage() {
  const [page, setPage] = useState(1),
    [edit, setEdit] = useState<Profile | null | undefined>();
  const [remove, setRemove] = useState<Profile | null>(null);
  const result = useApi<{ data: Profile[]; count: number; primary_admin_id: string; can_delete: boolean }>(
    "users?page=" + page,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Usuários do sistema</h1>
          <p>Pessoas autorizadas a entrar no NC SORTER.</p>
        </div>
        <button className="primary" onClick={() => setEdit(null)}>
          Convidar usuário
        </button>
      </div>
      <State
        loading={result.loading}
        error={result.error}
        retry={result.refresh}
      />
      {result.data && (
        <section className="panel table-panel users-table">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "Pessoa",
                  "Perfil",
                  "Situação",
                  "Ações",
                ].map((s) => (
                  <TableHead key={s}>{s}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><strong className="user-name">{p.name}</strong><span className="user-email">{p.email}</span></TableCell>
                  <TableCell>{p.id === result.data?.primary_admin_id ? <span className="primary-admin-badge"><ShieldCheck size={14} />ADMIN primário</span> : <span className="user-role">{p.role}</span>}</TableCell>
                  <TableCell><span className={`user-status ${p.active ? "active" : "inactive"}`}>{p.active ? "Ativo" : "Inativo"}</span></TableCell>
                  <TableCell>
                    <div className="user-actions"><button onClick={() => setEdit(p)}>Editar acesso</button>{result.data?.can_delete && p.id !== result.data?.primary_admin_id && <button className="delete-user-button" title={`Excluir ${p.name}`} aria-label={`Excluir usuário ${p.name}`} onClick={() => setRemove(p)}><Trash2 size={17}/></button>}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager page={page} total={result.data.count} onChange={setPage} />
        </section>
      )}
      {edit !== undefined && (
        <UserEditor
          item={edit ?? undefined}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined);
            result.refresh();
          }}
        />
      )}
      {remove && <UserDeletion item={remove} onClose={() => setRemove(null)} onDeleted={() => { setRemove(null); setPage(1); result.refresh(); }} />}
    </>
  );
}
export function AuditPage() {
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
  const result = useApi<{ data: Audit[]; count: number }>(
    "audit?" + query + "&page=" + page,
  );
  function filter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setQuery(
      new URLSearchParams(
        [...f].filter(([, v]) => String(v)).map(([k, v]) => [k, String(v)]),
      ).toString(),
    );
    setPage(1);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Auditoria</h1>
          <p>
            Histórico de ações e alterações. Registros protegidos contra edição.
          </p>
        </div>
      </div>
      <form className="panel filters" onSubmit={filter}>
        <label>
          ID do registro
          <input name="q" />
        </label>
        <label>
          Responsável (ID)
          <input name="actor_id" />
        </label>
        <label>
          Ação
          <input name="action" placeholder="OCORRENCIA_CRIADA" />
        </label>
        <label>
          Entidade
          <input name="entity" placeholder="occurrences" />
        </label>
        <label>
          De
          <input name="from" type="date" />
        </label>
        <label>
          Até
          <input name="to" type="date" />
        </label>
        <div className="filter-actions">
          <button className="primary">Aplicar filtros</button>
        </div>
      </form>
      <State
        loading={result.loading}
        error={result.error}
        retry={result.refresh}
      />
      {result.data && (
        <section className="panel">
          {result.data.data.length ? (
            result.data.data.map((a) => (
              <details className="history-entry" key={a.id}>
                <summary>
                  <strong>{a.action}</strong> · {displayDate(a.created_at)} ·{" "}
                  {a.entity}
                </summary>
                <p className="small">
                  Responsável: {a.actor_id}
                  <br />
                  Registro: {a.record_id}
                </p>
                <pre>
                  {JSON.stringify(
                    { anterior: a.old_data, novo: a.new_data },
                    null,
                    2,
                  )}
                </pre>
              </details>
            ))
          ) : (
            <Empty />
          )}
          <Pager page={page} total={result.data.count} onChange={setPage} />
        </section>
      )}
    </>
  );
}
export function AccountPage({ profile }: { profile: Profile }) {
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    if (f.get("password") !== f.get("confirm")) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      await api("auth/password", "POST", { password: f.get("password") });
      toast.success("Senha atualizada.");
      form.reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao alterar senha");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Minha conta</h1>
          <p>
            {profile.name} · {profile.email} · {profile.role}
          </p>
        </div>
      </div>
      <form className="panel stack max-w-xl" onSubmit={save}>
        <h2>Definir uma nova senha</h2>
        <label>
          Nova senha
          <input
            type="password"
            name="password"
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Confirmar senha
          <input
            type="password"
            name="confirm"
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        <p className="muted small">Use pelo menos 8 caracteres.</p>
        <button className="primary" disabled={busy}>
          {busy ? "Salvando…" : "Salvar senha"}
        </button>
      </form>
    </>
  );
}
