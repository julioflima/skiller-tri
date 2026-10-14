import { coverage, MIN_QUESTIONS_PER_CATEGORY, usedCoverageColumns } from "@/lib/forms";
import type { Test } from "@/lib/types";

/** Alerta de habilidades com menos perguntas que o mínimo para cada público usado nas etapas. */
export function Coverage({ test }: { test: Test }) {
  const cols = usedCoverageColumns(test);
  const rows = coverage(test);
  const gaps = rows.flatMap((r) => cols.filter((c) => r.counts[c.key] < MIN_QUESTIONS_PER_CATEGORY).map((c) => ({ r, c })));
  if (!rows.length || !cols.length) return null;
  return (
    <details className={`card tight coverage${gaps.length ? " warn" : ""}`} open={gaps.length > 0}>
      <summary className="row spread">
        <span>
          <strong>Cobertura mínima</strong>{" "}
          <span className="muted small">
            · {MIN_QUESTIONS_PER_CATEGORY} perguntas ativas por habilidade e por público ({rows.length * MIN_QUESTIONS_PER_CATEGORY} no mínimo por público)
          </span>
        </span>
        {gaps.length ? <span className="pill low">{gaps.length} lacuna(s)</span> : <span className="pill high">ok</span>}
      </summary>
      <p className="muted small">
        Com menos de {MIN_QUESTIONS_PER_CATEGORY} perguntas, a habilidade não tem validade estatística: uma única resposta pesa demais e a TRI não consegue
        calibrar a escala.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Habilidade</th>
              {cols.map((c) => (
                <th key={c.key} style={{ textAlign: "right" }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category.id}>
                <td>{r.category.name}</td>
                {cols.map((c) => {
                  const n = r.counts[c.key];
                  return (
                    <td key={c.key} style={{ textAlign: "right" }}>
                      <span className={`pill ${n < MIN_QUESTIONS_PER_CATEGORY ? "low" : "high"}`}>{n}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
