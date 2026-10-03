"use client";
import Link from "next/link";
import { ReportSummary } from "./report-summary";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { displayDate, statusLabels, type Occurrence } from "@/lib/domain";
import {
  useApi,
  Filters,
  Pager,
  State,
  Empty,
  StatusBadge,
  type Lookups,
} from "./shared";
export function OccurrenceTable({ rows }: { rows: Occurrence[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {[
            "Data / Hora",
            "Package ID",
            "HU",
            "Usuário",
            "Tipo de erro",
            "Turno",
            "Canalização",
            "Qtd.",
            "Status",
            "Registrado por",
            "Observações",
            "Ações",
          ].map((s) => (
            <TableHead key={s}>{s}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((o) => (
          <TableRow key={o.id}>
            <TableCell className="whitespace-nowrap">
              {displayDate(o.occurred_at)}
            </TableCell>
            <TableCell className="mono">{o.package_id}</TableCell>
            <TableCell className="mono">{o.hu}</TableCell>
            <TableCell>
              <strong>{o.occurrence_user}</strong>
            </TableCell>
            <TableCell>{o.error_type?.name}</TableCell>
            <TableCell>{o.shift?.name}</TableCell>
            <TableCell>{o.canalizacao?.name}</TableCell>
            <TableCell>{o.package_quantity}</TableCell>
            <TableCell>
              <StatusBadge status={o.status} />
            </TableCell>
            <TableCell>{o.registered_by?.name}</TableCell>
            <TableCell
              className="max-w-48 truncate"
              title={o.observations ?? ""}
            >
              {o.observations || "—"}
            </TableCell>
            <TableCell>
              <Link
                className="text-blue-700 font-semibold"
                href={"/ocorrencias/" + o.id}
              >
                Abrir
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
export async function exportCsv(query: string) {
  try {
    const r = await fetch("/api/export?" + query);
    if (!r.ok) {
      const data = (await r.json()) as { error?: string };
      throw new Error(data.error);
    }
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "nc-sorter.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Falha ao exportar");
  }
}
export function OccurrenceList({ report = false }: { report?: boolean }) {
  const search = useSearchParams();
  const [query, setQuery] = useState(search.toString()),
    [page, setPage] = useState(1),
    [size, setSize] = useState(25),
    [exporting, setExporting] = useState(false);
  const lookups = useApi<Lookups>("lookups"),
    list = useApi<{ data: Occurrence[]; count: number }>(
      "occurrences?" + query + "&page=" + page + "&page_size=" + size,
      30000,
    );
  const params = new URLSearchParams(query);
  function apply(value: string) {
    setQuery(value);
    setPage(1);
    window.history.replaceState(null, "", "?" + value);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{report ? "Relatórios" : "Central de ocorrências"}</h1>
          <p>
            {report
              ? "Consulte e exporte os registros da operação."
              : "Registro, acompanhamento e histórico em uma única visão."}
          </p>
        </div>
        {report ? (
          <button
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              await exportCsv(query);
              setExporting(false);
            }}
          >
            <Download size={16} />
            Exportar CSV
          </button>
        ) : (
          <Link className="button primary" href="/ocorrencias/nova">
            <Plus size={17} />
            Nova ocorrência
          </Link>
        )}
      </div>
      <Filters
        key={query}
        value={query}
        onApply={apply}
        lookups={lookups.data}
      />
      {report && <ReportSummary query={query} />}{" "}
      {!report && (
        <Tabs
          value={params.get("status") || "ALL"}
          onValueChange={(v) => {
            if (v === "ALL") {
              params.delete("status");
            } else {
              params.set("status", v);
            }
            apply(params.toString());
          }}
        >
          <TabsList className="mb-4">
            <TabsTrigger value="ALL">Todas</TabsTrigger>
            {Object.entries(statusLabels).map(([s, l]) => (
              <TabsTrigger value={s} key={s}>
                {l}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <div className="refresh-line">
        <RefreshCw size={13} />
        Atualização automática a cada 30 segundos
        <button
          onClick={list.refresh}
          className="icon-button"
          aria-label="Atualizar lista"
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <State
        loading={list.loading}
        error={list.error ?? lookups.error}
        retry={list.refresh}
      />
      {list.data && (
        <div className="panel table-panel">
          {list.data.data.length ? (
            <OccurrenceTable rows={list.data.data} />
          ) : (
            <Empty text="Nenhuma ocorrência encontrada para os filtros selecionados." />
          )}
          <Pager
            page={page}
            total={list.data.count}
            size={size}
            onChange={setPage}
            onSize={(n) => {
              setSize(n);
              setPage(1);
            }}
          />
        </div>
      )}
    </>
  );
}
