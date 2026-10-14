import Link from "next/link";
import { notFound } from "next/navigation";
import { canSeePatient, requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { ABOUT_LABEL, formProgress, respondentName } from "@/lib/forms";
import { SymbolImg, optionSymbolSrc } from "@/app/components/SymbolImg";
import { median } from "@/lib/stats";
import { FAST_MS, fmtSeconds, timeTone } from "@/lib/timing";

export default async function FormDetailPage({ params }: { params: Promise<{ id: string; formId: string }> }) {
  const user = await requirePageUser();
  const { id, formId } = await params;
  const db = await readDb();
  const p = db.patients.find((x) => x.id === id);
  const f = db.forms.find((x) => x.id === formId && x.patientId === id);
  if (!p || !f || !canSeePatient(user, p)) notFound();
  const test = db.tests.find((t) => t.id === f.testId);
  const therapist = db.users.find((u) => u.id === p.therapistId);
  const questions = new Map(test?.questions.map((q) => [q.id, q]));
  const categories = new Map(test?.categories.map((c) => [c.id, c.name]));
  const scales = test?.scales ?? [];
  const pr = formProgress(f);
  const times = Object.values(f.answers).flatMap((a) => (a.elapsedMs === undefined ? [] : [a.elapsedMs]));
  const fast = times.filter((t) => t < FAST_MS).length;

  return (
    <div className="stack">
      <Link href={`/painel/pacientes/${p.id}`} className="faint no-print">
        ← {p.name}
      </Link>
      <section>
        <p className="hand" style={{ margin: 0 }}>
          {f.sessionNumber ? `sessão ${f.sessionNumber}` : f.stageName.toLowerCase()}
        </p>
        <h1>{respondentName(p, f, therapist?.name)}</h1>
        <p className="muted">
          {pr.done}/{pr.total} respondidas
          {f.finishedAt ? ` · concluído em ${new Date(f.finishedAt).toLocaleString("pt-BR")}` : " · em andamento"}
        </p>
        {times.length > 0 && (
          <p className="muted small">
            Tempo mediano por pergunta: <strong>{fmtSeconds(median(times))}</strong> · total {fmtSeconds(times.reduce((a, b) => a + b, 0))}
            {fast > 0 && (
              <>
                {" "}
                · <span className="pill low">{fast} resposta(s) em menos de {fmtSeconds(FAST_MS)}</span>
              </>
            )}
          </p>
        )}
      </section>

      {f.blocks.map((block, bi) => (
        <section key={bi} className={`card${bi % 2 ? " alt" : ""}`}>
          <h3>{ABOUT_LABEL[block.about].replace(/^./, (c) => c.toUpperCase())}</h3>
          <p className="faint">“{block.instruction}”</p>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {f.items.map((item, idx) => {
                  if (item.block !== bi) return null;
                  const q = questions.get(item.questionId);
                  const a = f.answers[idx];
                  const scale = a && scales.find((s) => s.options.some((o) => o.id === a.optionId));
                  const option = scale && scale.options.find((o) => o.id === a!.optionId);
                  return (
                    <tr key={idx}>
                      <td style={{ width: 48 }}>{scale && <SymbolImg src={optionSymbolSrc(scale, a!.optionId)} size={36} label="" />}</td>
                      <td>
                        {q?.text ?? <span className="faint">pergunta removida</span>}
                        <div className="faint">{q ? categories.get(q.categoryId) : ""}</div>
                      </td>
                      <td style={{ width: 300, textAlign: "right" }}>
                        {a ? (
                          <>
                            <span className="faint">{option?.label ?? "resposta"}</span> <span className="pill">peso {a.weight}</span>
                            {a.elapsedMs !== undefined && (
                              <div className="faint" style={{ marginTop: 4 }}>
                                <span className={timeTone(a.elapsedMs) ? `pill ${timeTone(a.elapsedMs)}` : ""}>⏱ {fmtSeconds(a.elapsedMs)}</span>
                                {a.changes ? ` · trocou ${a.changes}×` : ""}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="faint">sem resposta</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
