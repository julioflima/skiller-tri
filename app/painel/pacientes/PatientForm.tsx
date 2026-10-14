"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/app/components/useToast";
import { GUARDIAN_LABEL } from "@/lib/forms";
import type { GuardianKind } from "@/lib/types";
import { createPatient, updatePatient, type GuardianInput, type PatientInput } from "../patient-actions";

type Option = { id: string; name: string };
/** Escola com os testes que aplica e os terapeutas da equipe. O terapeuta recebe só a própria. */
export type SchoolOption = Option & { tests: Option[]; therapists: Option[] };

export function PatientForm({
  patientId,
  initial,
  schools,
  isAdmin,
  testLocked,
}: {
  patientId?: string;
  initial?: PatientInput;
  schools: SchoolOption[];
  isAdmin: boolean;
  testLocked?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [data, setData] = useState<PatientInput>(
    initial ?? {
      name: "",
      schoolId: schools[0]?.id,
      testId: schools[0]?.tests[0]?.id ?? "",
      therapistId: schools[0]?.therapists[0]?.id,
      guardians: [
        { kind: "mae", name: "" },
        { kind: "pai", name: "" },
      ],
    },
  );
  const set = (patch: Partial<PatientInput>) => setData((d) => ({ ...d, ...patch }));
  const school = schools.find((s) => s.id === data.schoolId) ?? schools[0];
  const tests = school?.tests ?? [];
  const therapists = school?.therapists ?? [];
  // ao trocar de escola, mantém teste e terapeuta só se a nova escola também os tiver
  const pickSchool = (id: string) => {
    const next = schools.find((s) => s.id === id);
    if (!next) return;
    set({
      schoolId: id,
      testId: testLocked || next.tests.some((t) => t.id === data.testId) ? data.testId : (next.tests[0]?.id ?? ""),
      therapistId: next.therapists.some((t) => t.id === data.therapistId) ? data.therapistId : next.therapists[0]?.id,
    });
  };
  const setGuardian = (i: number, patch: Partial<GuardianInput>) =>
    set({ guardians: data.guardians.map((g, j) => (j === i ? { ...g, ...patch } : g)) });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // responsáveis sem nome são ignorados (ex.: família com um só responsável)
    const payload = { ...data, guardians: data.guardians.filter((g) => g.id || g.name.trim()) };
    start(async () => {
      const res = patientId ? await updatePatient(patientId, payload) : await createPatient(payload);
      if (!res.ok) return toast.show(res.error);
      toast.show(res.message ?? "Salvo.");
      if (!patientId && res.data) router.push(`/painel/pacientes/${(res.data as { id: string }).id}`);
      else router.refresh();
    });
  }

  return (
    <form className="stack" onSubmit={submit}>
      {toast.node}
      <section className="card">
        <h2>Paciente</h2>
        <div className="grid-2" style={{ gap: 14 }}>
          <div>
            <label htmlFor="p-name">Nome completo</label>
            <input id="p-name" type="text" value={data.name} onChange={(e) => set({ name: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="p-birth">Data de nascimento</label>
            <input id="p-birth" type="date" value={data.birthDate ?? ""} onChange={(e) => set({ birthDate: e.target.value })} />
          </div>
          <div>
            <label htmlFor="p-email">
              E-mail <span className="faint">(opcional)</span>
            </label>
            <input id="p-email" type="email" value={data.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
          </div>
          {isAdmin && (
            <div>
              <label htmlFor="p-school">Escola</label>
              <select id="p-school" value={school?.id ?? ""} onChange={(e) => pickSchool(e.target.value)}>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="p-test">Teste</label>
            <select id="p-test" value={data.testId} onChange={(e) => set({ testId: e.target.value })} disabled={testLocked}>
              {!tests.some((t) => t.id === data.testId) && <option value={data.testId}>—</option>}
              {tests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {testLocked && <p className="faint">O teste não pode ser trocado depois das primeiras respostas.</p>}
          </div>
          {isAdmin && (
            <div>
              <label htmlFor="p-ther">Terapeuta responsável</label>
              <select id="p-ther" value={data.therapistId} onChange={(e) => set({ therapistId: e.target.value })}>
                {!therapists.some((t) => t.id === data.therapistId) && <option value={data.therapistId ?? ""}>—</option>}
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      <section className="card alt">
        <h2 style={{ margin: 0 }}>Responsáveis</h2>
        <p className="muted small">Cadastre mãe e pai, duas mães ou dois pais. Cada responsável recebe o próprio link e responde separadamente.</p>
        <div className="stack">
          {data.guardians.map((g, i) => (
            <div key={g.id ?? i} className="guardian-row">
              <div className="kind-toggle" role="radiogroup" aria-label="Mãe ou pai">
                {(["mae", "pai"] as GuardianKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={g.kind === k}
                    aria-label={GUARDIAN_LABEL[k]}
                    title={GUARDIAN_LABEL[k]}
                    className={`kind-opt ${k}${g.kind === k ? " on" : ""}`}
                    onClick={() => setGuardian(i, { kind: k })}
                  >
                    <GuardianIcon kind={k} />
                  </button>
                ))}
              </div>
              <input type="text" placeholder="Nome" value={g.name} onChange={(e) => setGuardian(i, { name: e.target.value })} />
              <input type="email" placeholder="E-mail (opcional)" value={g.email ?? ""} onChange={(e) => setGuardian(i, { email: e.target.value })} />
              <input type="tel" placeholder="Telefone (opcional)" value={g.phone ?? ""} onChange={(e) => setGuardian(i, { phone: e.target.value })} />
              <button
                type="button"
                className="btn ghost sm danger"
                onClick={() => set({ guardians: data.guardians.filter((_, j) => j !== i) })}
                aria-label="Remover responsável"
              >
                Remover
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => set({ guardians: [...data.guardians, { kind: "mae", name: "" }] })}>
          + Adicionar responsável
        </button>
      </section>

      <div className="row">
        <button className="btn lg" disabled={pending}>
          {pending ? "Salvando…" : patientId ? "Salvar alterações" : "Cadastrar paciente"}
        </button>
      </div>
    </form>
  );
}

function GuardianIcon({ kind }: { kind: GuardianKind }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {kind === "mae" ? (
        <>
          <circle cx="12" cy="6.5" r="3.2" />
          <path d="M8.6 5.2c-1.6 2.6-1.2 5 .4 6.3M15.4 5.2c1.6 2.6 1.2 5-.4 6.3" />
          <path d="M9.5 12.5 6 21h12l-3.5-8.5" />
        </>
      ) : (
        <>
          <circle cx="12" cy="6.5" r="3.2" />
          <path d="M5.5 21v-3.5A5 5 0 0 1 10.5 12.5h3a5 5 0 0 1 5 5V21" />
        </>
      )}
    </svg>
  );
}
