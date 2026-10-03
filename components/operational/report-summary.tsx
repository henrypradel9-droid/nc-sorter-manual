"use client";
import { useApi, State } from "./shared";
type Summary = {
  total: number;
  pending: number;
  progress: number;
  resolved: number;
  errors: { name: string; total: number }[];
  shifts: { name: string; total: number }[];
};
export function ReportSummary({ query }: { query: string }) {
  const result = useApi<Summary>("dashboard?" + query);
  const d = result.data;
  return (
    <>
      <State
        loading={result.loading}
        error={result.error}
        retry={result.refresh}
      />
      {d && (
        <>
          <div
            className="stats"
            style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}
          >
            {[
              ["Total", d.total],
              ["Pendentes", d.pending],
              ["Em andamento", d.progress],
              ["Resolvidas", d.resolved],
            ].map(([name, total]) => (
              <div className="stat" key={name}>
                <span>{name}</span>
                <strong>{total}</strong>
              </div>
            ))}
          </div>
          <details className="panel mb-4">
            <summary className="cursor-pointer font-semibold">
              Agrupamentos do relatório
            </summary>
            <div className="charts mt-4">
              {[
                ["Por tipo de erro", d.errors],
                ["Por turno", d.shifts],
              ].map(([title, rows]) => (
                <div key={String(title)}>
                  <h3>{String(title)}</h3>
                  {(rows as Summary["errors"]).map((x) => (
                    <p className="flex justify-between text-sm" key={x.name}>
                      <span>{x.name}</span>
                      <strong>{x.total}</strong>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </>
  );
}
