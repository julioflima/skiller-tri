import Link from "next/link";
import { LineChart, Legend } from "@/app/components/LineChart";
import { Radar, SERIES_COLORS, shortName } from "@/app/components/Radar";
import { band, overallBySeries, scoreForms, SERIES_ORDER, seriesLabel } from "@/lib/scoring";
import type { Form, Patient, Test } from "@/lib/types";
import { PrintButton } from "./PatientWidgets";

export function Results({ patient, test, forms, etapa }: { patient: Patient; test: Test; forms: Form[]; etapa: string }) {
  const withAnswers = forms.filter((f) => Object.keys(f.answers).length);
  const selected = withAnswers.filter((f) => (etapa === "inicial" ? f.sessionNumber === 0 : etapa === "sessoes" ? f.sessionNumber > 0 : true));
  const scores = scoreForms(test, selected);
  const keys = [...scores.keys()].sort((a, b) => SERIES_ORDER(a) - SERIES_ORDER(b) || a.localeCompare(b));
  const categories = [...test.categories].sort((a, b) => a.order - b.order);
  const color = (k: string) => SERIES_COLORS[keys.indexOf(k) % SERIES_COLORS.length];

  // evolução por sessão (percentual geral de cada série)
  const sessionNumbers = [...new Set(withAnswers.filter((f) => f.sessionNumber > 0).map((f) => f.sessionNumber))].sort((a, b) => a - b);
  const perSession = sessionNumbers.map((n) => overallBySeries(test, withAnswers.filter((f) => f.sessionNumber === n)));
  const evoKeys = [...new Set(perSession.flatMap((m) => [...m.keys()]))].sort((a, b) => SERIES_ORDER(a) - SERIES_ORDER(b));
  const evoColor = (k: string) => SERIES_COLORS[(keys.includes(k) ? keys.indexOf(k) : evoKeys.indexOf(k)) % SERIES_COLORS.length];

  const filter = (key: string, label: string) => (
    <Link href={`/painel/pacientes/${patient.id}?aba=resultados&etapa=${key}`} className={`tab${etapa === key ? " active" : ""}`}>
      {label}
    </Link>
  );

  return (
    <div className="stack">
      <div className="row spread no-print">
        <nav className="tabs" style={{ margin: 0 }}>
          {filter("todas", "Todas as respostas")}
          {filter("inicial", "Início do tratamento")}
          {filter("sessoes", "Sessões")}
        </nav>
        <div className="row">
          <PrintButton />
          <a className="btn ghost sm" href={`/painel/pacientes/${patient.id}/export`}>
            Exportar CSV
          </a>
        </div>
      </div>

      {!keys.length ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Ainda não há respostas {etapa === "inicial" ? "do início do tratamento" : etapa === "sessoes" ? "das sessões" : ""}.
          </p>
        </div>
      ) : (
        <>
          <section className="card">
            <h2>Perfil por classificação</h2>
            <p className="muted small">Percentual ponderado pelo peso das respostas e das perguntas (0% = menor resposta da escala, 100% = maior).</p>
            <Radar
              labels={categories.map((c) => shortName(c.name))}
              series={keys.map((k) => ({ name: k, values: categories.map((c) => scores.get(k)?.get(c.id)?.pct ?? null) }))}
              max={100}
              rings={4}
            />
            <Legend items={keys.map((k) => ({ label: seriesLabel(patient, k), color: color(k) }))} />
          </section>

          <section className="card alt">
            <h2>Tabela por classificação</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Classificação</th>
                    {keys.map((k) => (
                      <th key={k} style={{ textAlign: "right" }}>
                        <span style={{ color: color(k) }}>●</span> {seriesLabel(patient, k)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      {keys.map((k) => {
                        const s = scores.get(k)?.get(c.id);
                        return (
                          <td key={k} style={{ textAlign: "right" }}>
                            {s ? (
                              <span className={`pill ${band(s.pct).tone}`} title={`${s.n} resposta(s) · ${band(s.pct).label}`}>
                                {Math.round(s.pct)}%
                              </span>
                            ) : (
                              <span className="faint">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {sessionNumbers.length > 0 && (
        <section className="card">
          <h2>Evolução nas sessões</h2>
          <p className="muted small">Percentual geral de cada pessoa em cada sessão.</p>
          <LineChart
            xLabels={sessionNumbers.map((n) => `S${n}`)}
            series={evoKeys.map((k) => ({ label: k, color: evoColor(k), values: perSession.map((m) => m.get(k) ?? null) }))}
          />
          <Legend items={evoKeys.map((k) => ({ label: seriesLabel(patient, k), color: evoColor(k) }))} />
        </section>
      )}
    </div>
  );
}
