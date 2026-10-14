import Link from "next/link";
import { notFound } from "next/navigation";
import { canSeePatient, picksTherapist, requirePageUser } from "@/lib/auth";
import { schoolOptions } from "@/lib/schools";
import { readDb } from "@/lib/db";
import { calibrate } from "@/lib/irt";
import { ABOUT_LABEL, formProgress, GUARDIAN_LABEL, respondentName } from "@/lib/forms";
import type { Form } from "@/lib/types";
import { ActionButton } from "@/app/components/ActionButton";
import { CopyLink } from "@/app/components/CopyLink";
import { Icon } from "@/app/components/Icon";
import { deleteSession, redrawForm, regenerateLink, setArchived } from "../../patient-actions";
import { PatientForm } from "../PatientForm";
import { NewSessionForm, NotesBox } from "./PatientWidgets";
import { Results } from "./Results";

const fmtDate = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR");

function age(birth?: string) {
  if (!birth) return null;
  const b = new Date(`${birth}T12:00:00`);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

export default async function PatientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; etapa?: string; visao?: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const { aba = "geral", etapa = "todas", visao = "360" } = await searchParams;
  const db = await readDb();
  const p = db.patients.find((x) => x.id === id);
  if (!p || !canSeePatient(user, p)) notFound();

  const test = db.tests.find((t) => t.id === p.testId);
  const therapist = db.users.find((u) => u.id === p.therapistId);
  const forms = db.forms.filter((f) => f.patientId === p.id);
  const sessions = db.sessions.filter((s) => s.patientId === p.id).sort((a, b) => b.number - a.number);
  const years = age(p.birthDate);
  const tab = (key: string, label: string) => (
    <Link href={`/painel/pacientes/${p.id}?aba=${key}`} className={`tab${aba === key ? " active" : ""}`}>
      {label}
    </Link>
  );

  return (
    <div className="stack">
      <Link href="/painel" className="faint no-print">
        ← Pacientes
      </Link>
      <section>
        <div className="row spread">
          <h1 style={{ margin: 0 }}>{p.name}</h1>
          {p.archived && <span className="pill low">arquivado</span>}
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          {years !== null && `${years} anos · `}
          {p.guardians.length > 0 && `responsáveis: ${p.guardians.map((g) => g.name).join(", ")} · `}{user.role === "admin" && `${db.schools.find((s) => s.id === p.schoolId)?.name ?? "sem escola"} · `}terapeuta {therapist?.name ?? "—"} ·{" "}
          {test?.name ?? "teste removido"}
        </p>
      </section>

      <nav className="tabs no-print" style={{ marginBottom: 0 }}>
        {tab("geral", "Acompanhamento")}
        {tab("resultados", "Resultados")}
        {tab("dados", "Cadastro")}
      </nav>

      {aba === "resultados" && test ? (
        <Results
          patient={p}
          test={test}
          forms={forms}
          etapa={etapa}
          visao={visao}
          calibration={calibrate(test, db.forms.filter((f) => f.testId === test.id))}
        />
      ) : aba === "dados" ? (
        <>
          <PatientForm
            patientId={p.id}
            initial={{
              name: p.name,
              birthDate: p.birthDate,
              email: p.email,
              testId: p.testId,
              schoolId: p.schoolId,
              therapistId: p.therapistId,
              guardians: p.guardians.map((g) => ({ id: g.id, kind: g.kind, name: g.name, email: g.email, phone: g.phone })),
            }}
            schools={schoolOptions(db, user, p)}
            isAdmin={user.role === "admin"} picksTherapist={picksTherapist(user)}
            testLocked={forms.some((f) => Object.keys(f.answers).length > 0)}
          />
          <div className="card alt row spread">
            <span className="muted small">
              {p.archived ? "Paciente arquivado: não aparece na lista principal." : "Arquivar esconde o paciente da lista sem apagar o histórico."}
            </span>
            <ActionButton action={setArchived.bind(null, p.id, !p.archived)}>{p.archived ? "Reativar" : "Arquivar paciente"}</ActionButton>
          </div>
        </>
      ) : (
        <>
          <section className="card">
            <h2>Links de resposta</h2>
            <p className="muted small">Cada pessoa tem um link próprio e só vê os próprios formulários. Gerar um novo link desativa o anterior.</p>
            <div className="table-wrap">
              <table className="table links-table">
                <tbody>
                  {[
                    { key: "paciente", who: `${p.name}`, role: "Paciente", token: p.token },
                    ...p.guardians.map((g) => ({ key: g.id, who: g.name, role: GUARDIAN_LABEL[g.kind], token: g.token })),
                    { key: "terapeuta", who: therapist?.name ?? "Terapeuta", role: "Terapeuta", token: p.therapistToken },
                  ].map((l) => (
                    <tr key={l.key}>
                      <td style={{ width: 210 }}>
                        <strong>{l.who}</strong>
                        <div className="faint">{l.role}</div>
                      </td>
                      <td style={{ maxWidth: 0 }}>
                        <CopyLink path={`/r/${l.token}`} label={l.who} />
                      </td>
                      <td style={{ width: 110, textAlign: "right" }}>
                        <ActionButton action={regenerateLink.bind(null, p.id, l.key)} confirmText="Gerar um novo link? O link atual deixará de funcionar." className="btn ghost sm icon-btn">
                          <Icon name="refresh" />
                          Novo link
                        </ActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card alt">
            <h2>Início do tratamento</h2>
            <FormsTable patientId={p.id} forms={forms.filter((f) => f.sessionNumber === 0)} patient={p} therapistName={therapist?.name} />
          </section>

          <section className="card">
            <h2>Sessões</h2>
            {!p.archived && <NewSessionForm patientId={p.id} />}
            {sessions.length === 0 ? (
              <p className="faint" style={{ marginTop: 14 }}>
                Nenhuma sessão registrada. Ao registrar uma sessão, os formulários de cada pessoa são sorteados conforme o teste.
              </p>
            ) : (
              sessions.map((s) => {
                const sf = forms.filter((f) => f.sessionNumber === s.number);
                const answered = sf.some((f) => Object.keys(f.answers).length);
                return (
                  <details key={s.id} className="session" open={s === sessions[0]}>
                    <summary className="row spread">
                      <span>
                        <strong>Sessão {s.number}</strong> <span className="faint">· {fmtDate(s.date)}</span>
                      </span>
                      <span className="small">
                        {sf.filter((f) => f.finishedAt).length}/{sf.length} formulários concluídos
                      </span>
                    </summary>
                    <FormsTable patientId={p.id} forms={sf} patient={p} therapistName={therapist?.name} />
                    <div className="grid-2" style={{ marginTop: 10 }}>
                      <NotesBox id={s.id} initial={s.notes ?? ""} kind="session" />
                      <div style={{ alignSelf: "end", textAlign: "right" }}>
                        {!answered && (
                          <ActionButton action={deleteSession.bind(null, s.id)} confirmText={`Excluir a sessão ${s.number} e seus formulários?`} className="btn ghost sm danger">
                            Excluir sessão
                          </ActionButton>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })
            )}
          </section>

          <section className="card alt">
            <h2>Anotações gerais</h2>
            <NotesBox id={p.id} initial={p.notes ?? ""} kind="patient" />
          </section>
        </>
      )}
    </div>
  );
}

function FormsTable({ forms, patient, therapistName, patientId }: { forms: Form[]; patient: Parameters<typeof respondentName>[0]; therapistName?: string; patientId: string }) {
  if (!forms.length) return <p className="faint">Nenhum formulário nesta etapa.</p>;
  const order = { paciente: 0, responsavel: 1, terapeuta: 2 };
  return (
    <div className="table-wrap">
      <table className="table">
        <tbody>
          {[...forms]
            .sort((a, b) => order[a.respondent.role] - order[b.respondent.role])
            .map((f) => {
              const pr = formProgress(f);
              const blocks = [...new Set(f.blocks.map((b) => b.about))];
              return (
                <tr key={f.id}>
                  <td>
                    <strong>{respondentName(patient as never, f, therapistName)}</strong>
                    <div className="faint">
                      {f.items.length} perguntas · {blocks.map((b) => ABOUT_LABEL[b]).join(" + ")}
                    </div>
                  </td>
                  <td style={{ width: 170 }}>
                    {f.finishedAt ? (
                      <span className="pill high">concluído</span>
                    ) : pr.done ? (
                      <span className="pill mid">
                        {pr.done}/{pr.total} respondidas
                      </span>
                    ) : (
                      <span className="pill">aguardando</span>
                    )}
                  </td>
                  <td style={{ width: 230, textAlign: "right" }}>
                    {pr.done > 0 && (
                      <Link href={`/painel/pacientes/${patientId}/formularios/${f.id}`} className="btn ghost sm">
                        Ver respostas
                      </Link>
                    )}
                    {pr.done === 0 && (
                      <ActionButton action={redrawForm.bind(null, f.id)} confirmText="Sortear outras perguntas para este formulário?">
                        Sortear de novo
                      </ActionButton>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
