import Link from "next/link";
import { calibrate } from "@/lib/irt";
import { dec, median } from "@/lib/stats";
import { FAST_MS, fmtSeconds, SLOW_MS } from "@/lib/timing";
import type { Form, Test } from "@/lib/types";
import { misfit, Stat } from "../../analise/parts";

/**
 * Qualidade do instrumento: calibração TRI e tempo de resposta por pergunta. Junta as aplicações de todas as escolas,
 * porque a pergunta é a mesma em qualquer uma delas; só aparecem números agregados por pergunta, nunca pacientes.
 */
export function Quality({ test, forms, schools }: { test: Test; forms: Form[]; schools: number }) {
  const categories = [...test.categories].sort((a, b) => a.order - b.order);
  const calibration = calibrate(test, forms);
  const qById = new Map(test.questions.map((q) => [q.id, q]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  // tempo de resposta por pergunta (qualidade da pergunta e engajamento)
  const times = new Map<string, number[]>();
  for (const f of forms)
    f.items.forEach((it, idx) => {
      const ms = f.answers[idx]?.elapsedMs;
      if (ms === undefined) return;
      times.set(it.questionId, [...(times.get(it.questionId) ?? []), ms]);
    });
  const timeRows = [...times]
    .map(([qid, ts]) => ({ q: qById.get(qid), med: median(ts), n: ts.length, fast: ts.filter((t) => t < FAST_MS).length / ts.length }))
    .filter((r) => r.q)
    .sort((a, b) => b.med - a.med);
  const answered = forms.filter((f) => Object.keys(f.answers).length);

  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        Se as perguntas estão medindo bem, com as aplicações de todas as escolas juntas. A explicação de cada método está em{" "}
        <Link href="/painel/metodos">Métodos</Link>.
      </p>

      <div className="grid-3">
        <Stat label="Formulários com respostas" value={answered.length} hint={`${answered.filter((f) => f.finishedAt).length} concluídos`} />
        <Stat label="Pacientes" value={new Set(answered.map((f) => f.patientId)).size} hint={`em ${schools} escola(s)`} />
        <Stat label="Respostas" value={answered.reduce((a, f) => a + Object.keys(f.answers).length, 0)} hint="somando todas as visões" />
      </div>

      <section className="card">
        <h2>Calibração TRI das perguntas</h2>
        <p className="muted small">
          Modelo de escala gradual (Rasch), calibrado com todas as aplicações do teste. <strong>Dificuldade (b)</strong>: acima de 0 = pergunta que pede
          mais da habilidade para ser marcada alto. <strong>Infit/outfit</strong>: perto de 1 é o ideal; acima de 1,3 a pergunta gera respostas
          erráticas (pode estar ambígua ou medir outra coisa); abaixo de 0,7 é redundante. <strong>Confiabilidade</strong>: o quanto a habilidade
          separa as pessoas (acima de 0,7 é bom).
        </p>
        {!calibration.size ? (
          <p className="faint">Ainda não há dados suficientes para calibrar (mínimo de 10 aplicações por habilidade).</p>
        ) : (
          categories
            .filter((c) => calibration.has(c.id))
            .map((c) => {
              const cal = calibration.get(c.id)!;
              const items = [...cal.items.values()].sort((a, b) => b.b - a.b);
              return (
                <details key={c.id} className="session">
                  <summary className="row spread">
                    <strong>{c.name}</strong>
                    <span className="small">
                      {cal.persons} aplicações · {items.length} perguntas · confiabilidade{" "}
                      <span className={`pill ${cal.reliability >= 0.7 ? "high" : cal.reliability >= 0.5 ? "mid" : "low"}`}>{dec(cal.reliability)}</span>
                      {items.some((i) => misfit(i.infit) || misfit(i.outfit)) && <span className="pill low">desajuste</span>}
                      {!cal.converged && <span className="pill mid">não convergiu</span>}
                    </span>
                  </summary>
                  <p className="faint">
                    Limiares da escala: {cal.tau.slice(1).map((t) => dec(t)).join(" · ")}
                    {cal.tau.slice(1).some((t, i, arr) => i > 0 && t < arr[i - 1]) && " · limiares fora de ordem: duas opções vizinhas não estão sendo diferenciadas"}
                  </p>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Pergunta</th>
                          <th style={{ textAlign: "right" }}>b</th>
                          <th style={{ textAlign: "right" }}>Infit</th>
                          <th style={{ textAlign: "right" }}>Outfit</th>
                          <th style={{ textAlign: "right" }}>n</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((i) => (
                          <tr key={i.questionId}>
                            <td className="small">{qById.get(i.questionId)?.text}</td>
                            <td style={{ textAlign: "right" }}>{dec(i.b)}</td>
                            <td style={{ textAlign: "right" }}>
                              <span className={misfit(i.infit) ? "pill low" : ""}>{dec(i.infit)}</span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <span className={misfit(i.outfit) ? "pill low" : ""}>{dec(i.outfit)}</span>
                            </td>
                            <td style={{ textAlign: "right" }} className="faint">
                              {i.n}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })
        )}
      </section>

      <section className="card alt">
        <h2>Tempo de resposta por pergunta</h2>
        <p className="muted small">
          Tempo com a tela visível até escolher a resposta. Mediana alta (acima de {fmtSeconds(SLOW_MS)}) pode indicar pergunta confusa; muitas respostas
          abaixo de {fmtSeconds(FAST_MS)} sugerem que a pergunta não está sendo lida.
        </p>
        {!timeRows.length ? (
          <p className="faint">Ainda não há tempos registrados.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pergunta</th>
                  <th style={{ textAlign: "right" }}>Mediana</th>
                  <th style={{ textAlign: "right" }}>Rápidas demais</th>
                  <th style={{ textAlign: "right" }}>n</th>
                </tr>
              </thead>
              <tbody>
                {timeRows.map((r) => (
                  <tr key={r.q!.id}>
                    <td className="small">
                      {r.q!.text}
                      <div className="faint">{catName.get(r.q!.categoryId)}</div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className={r.med > SLOW_MS ? "pill mid" : ""}>{fmtSeconds(r.med)}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className={r.fast >= 0.3 ? "pill low" : "faint"}>{Math.round(r.fast * 100)}%</span>
                    </td>
                    <td style={{ textAlign: "right" }} className="faint">
                      {r.n}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
