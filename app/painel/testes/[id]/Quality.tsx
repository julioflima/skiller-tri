import Link from "next/link";
import { median } from "@/lib/stats";
import { FAST_MS, fmtSeconds, SLOW_MS } from "@/lib/timing";
import type { Form, Test } from "@/lib/types";
import { Stat } from "../../analise/parts";

/**
 * Qualidade do instrumento: tempo de resposta por pergunta. Junta as aplicações de todas as escolas,
 * porque a pergunta é a mesma em qualquer uma delas; só aparecem números agregados por pergunta, nunca pacientes.
 */
export function Quality({ test, forms, schools }: { test: Test; forms: Form[]; schools: number }) {
  const categories = [...test.categories].sort((a, b) => a.order - b.order);
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
