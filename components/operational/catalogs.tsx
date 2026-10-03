"use client";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
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
import { catalogNames, type Catalog } from "@/lib/domain";
import { api, useApi, State, Empty, Pager } from "./shared";

export function CatalogEditor({
  table,
  item,
  onSaved,
  onClose,
}: {
  table: string;
  item?: Catalog;
  onSaved: (item: Catalog) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [active, setActive] = useState(item?.active ?? true),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api<Catalog>(
        "catalogs/" + table,
        item ? "PATCH" : "POST",
        {
          id: item?.id,
          name: f.get("name"),
          description: f.get("description"),
          active,
          ...(table === "shifts"
            ? {
                start_time: f.get("start_time") || null,
                end_time: f.get("end_time") || null,
              }
            : {}),
        },
      );
      toast.success("Cadastro salvo.");
      onSaved(result);
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
            {item ? "Editar cadastro" : "Novo cadastro"} · {catalogNames[table]}
          </DialogTitle>
          <DialogDescription>
            Os dados ficarão disponíveis nos registros e nos filtros.
          </DialogDescription>
        </DialogHeader>
        <form className="stack" onSubmit={submit}>
          <label>
            Nome *
            <input
              name="name"
              required
              maxLength={150}
              defaultValue={item?.name}
            />
          </label>
          <label>
            Descrição
            <textarea
              name="description"
              maxLength={1000}
              defaultValue={item?.description ?? ""}
            />
          </label>
          {table === "shifts" && (
            <div className="form-grid">
              <label>
                Início
                <input
                  type="time"
                  name="start_time"
                  defaultValue={item?.start_time ?? ""}
                />
              </label>
              <label>
                Fim
                <input
                  type="time"
                  name="end_time"
                  defaultValue={item?.end_time ?? ""}
                />
              </label>
            </div>
          )}
          <label className="flex-row items-center">
            <Switch checked={active} onCheckedChange={setActive} />
            Cadastro ativo
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="button" disabled={busy} onClick={onClose}>
              Cancelar
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar cadastro"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function CatalogPage({ table }: { table: string }) {
  const data = useApi<Catalog[]>("catalogs/" + table),
    [editing, setEditing] = useState<Catalog | null | undefined>(),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const rows = (data.data ?? []).filter((x) =>
    x.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{catalogNames[table]}</h1>
          <p>Cadastros dinâmicos para a operação. O histórico é preservado.</p>
        </div>
        <button className="primary" onClick={() => setEditing(null)}>
          Novo cadastro
        </button>
      </div>
      <label className="mb-5 max-w-md">
        Pesquisar
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </label>
      <State loading={data.loading} error={data.error} retry={data.refresh} />
      {data.data && (
        <section className="panel table-panel">
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice((page - 1) * 25, page * 25).map((x) => (
                  <TableRow key={x.id}>
                    <TableCell>
                      <strong>{x.name}</strong>
                    </TableCell>
                    <TableCell>
                      {x.description || "—"}
                      {x.start_time && (
                        <small>
                          {" "}
                          {x.start_time} – {x.end_time}
                        </small>
                      )}
                    </TableCell>
                    <TableCell>{x.active ? "Ativo" : "Desativado"}</TableCell>
                    <TableCell>
                      <button onClick={() => setEditing(x)}>Editar</button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty />
          )}
          <Pager page={page} total={rows.length} onChange={setPage} />
        </section>
      )}
      {editing !== undefined && (
        <CatalogEditor
          table={table}
          item={editing ?? undefined}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            data.refresh();
          }}
        />
      )}
    </>
  );
}
