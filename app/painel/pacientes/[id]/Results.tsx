import Link from "next/link";
import { LineChart, Legend } from "@/app/components/LineChart";
import { Radar, SERIES_COLORS, shortName } from "@/app/components/Radar";
import { Ecomap } from "@/app/components/Ecomap";
import { IRT_STABLE_PERSONS, irtScores, thetaPercentile, type IrtCalibration } from "@/lib/irt";
import { band, overallBySeries, scoreForms, SERIES_ORDER, seriesLabel } from "@/lib/scoring";
import { dec } from "@/lib/stats";
import type { Form, Patient, Test } from "@/lib/types";
import { PrintButton } from "./PatientWidgets";

export function Results({
  patient,
  test,
  forms,
  etapa,
  visao,
  calibration,
}: {
  patient: Patient;
  test: Test;
  forms: Form[];
  etapa: string;
  visao: string;
  calibration: IrtCalibration;
}) {
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

  const href = (q: { etapa?: string; visao?: string }) =>
    `/painel/pacientes/${patient.id}?aba=resultados&etapa=${q.etapa ?? etapa}&visao=${encodeURIComponent(q.visao ?? visao)}`;
  const filter = (key: string, label: string) => (
    <Link href={href({ etapa: key })} className={`tab${etapa === key ? " active" : ""}`}>
      {label}
    </Link>
  );

  // ecomapa: "360" = média das visões sobre o paciente (ele mesmo, família, terapeuta) em cada habilidade;
  // "paciente:outro" fica de fora porque fala de outra pessoa
  const ecoKeys = keys.filter((k) => k !== "paciente:outro");
  const view = visao === "360" || ecoKeys.includes(visao) ? visao : "360";
  const ecoValue = (catId: string) => {
    const vals = (view === "360" ? ecoKeys : [view]).map((k) => scores.get(k)?.get(catId)).filter((v) => v !== undefined);
    if (!vals.length) return { value: null, n: 0 };
    return { value: vals.reduce((a, v) => a + v.pct, 0) / vals.length, n: vals.reduce((a, v) => a + v.n, 0) };
  };

  // TRI: θ por série e habilidade, com os parâmetros calibrados em todas as respostas do teste
  const irt = irtScores(test, calibration, selected);
  const irtCats = categories.filter((c) => calibration.has(c.id));
  const minPersons = Math.min(...irtCats.map((c) => calibration.get(c.id)!.persons));

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
            <div className="row spread">
              <h2 style={{ margin: 0 }}>Ecomapa de habilidades</h2>
              <nav className="tabs no-print" style={{ margin: 0 }}>
                <Link href={href({ visao: "360" })} className={`tab${view === "360" ? " active" : ""}`}>
                  Visão 360
                </Link>
                {ecoKeys.map((k) => (
                  <Link key={k} href={href({ visao: k })} className={`tab${view === k ? " active" : ""}`}>
                    {seriesLabel(patient, k)}
                  </Link>
                ))}
              </nav>
            </div>
            <p className="muted small">
              {view === "360" ? "Média das visões de todas as pessoas que responderam" : seriesLabel(patient, view)}. Quanto mais perto do centro e mais grossa a
              ligação, mais desenvolvida a habilidade; ligação tracejada = abaixo de 50%. É um retrato do momento, não um rótulo.
            </p>
            <Ecomap center={patient.name} items={categories.map((c) => ({ label: shortName(c.name), ...ecoValue(c.id) }))} />
          </section>

          <section className="card">
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

      {keys.length > 0 && (
        <section className="card alt">
          <h2>Estimativa por TRI <span className="pill mid">experimental</span></h2>
          {!irtCats.length ? (
            <p className="muted small" style={{ margin: 0 }}>
              Ainda não há respostas suficientes no teste para calibrar as perguntas (mínimo de 10 aplicações por habilidade, sem contar quem marcou só
              o mínimo ou só o máximo). Veja <Link href="/painel/metodos#tri">Métodos</Link>.
            </p>
          ) : (
            <>
              <p className="muted small">
                θ no modelo de escala gradual (Rasch), estimado por EAP: 0 = média do grupo de calibração, ±1 = um desvio-padrão. Entre parênteses, o
                percentil aproximado. Diferente do percentual, a TRI considera quão difícil é cada pergunta.
                {minPersons < IRT_STABLE_PERSONS && (
                  <>
                    {" "}
                    <strong>Calibração com poucas aplicações (mín. {minPersons}); trate como indicativo até ~{IRT_STABLE_PERSONS}.</strong>
                  </>
                )}
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Habilidade</th>
                      {keys.map((k) => (
                        <th key={k} style={{ textAlign: "right" }}>
                          <span style={{ color: color(k) }}>●</span> {seriesLabel(patient, k)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {irtCats.map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        {keys.map((k) => {
                          const e = irt.get(k)?.get(c.id);
                          return (
                            <td key={k} style={{ textAlign: "right", whiteSpace: "nowrap" }} title={e ? `erro-padrão ${dec(e.se)} · ${e.n} resposta(s)` : undefined}>
                              {e ? (
                                <>
                                  <strong>{e.theta >= 0 ? "+" : ""}{dec(e.theta)}</strong> <span className="faint">±{dec(e.se)} (P{thetaPercentile(e.theta)})</span>
                                </>
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
            </>
          )}
        </section>
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
