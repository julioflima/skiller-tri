"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/app/components/useToast";
import type { GuardianKind } from "@/lib/types";
import { createPatient, updatePatient, type GuardianInput, type PatientInput } from "../patient-actions";

type Option = { id: string; name: string };

export function PatientForm({
  patientId,
  initial,
  tests,
  therapists,
  isAdmin,
  testLocked,
}: {
  patientId?: string;
  initial?: PatientInput;
  tests: Option[];
  therapists: Option[];
  isAdmin: boolean;
  testLocked?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [data, setData] = useState<PatientInput>(
    initial ?? {
      name: "",
      testId: tests[0]?.id ?? "",
      therapistId: therapists[0]?.id,
      guardians: [
        { kind: "mae", name: "" },
        { kind: "pai", name: "" },
      ],
    },
  );
  const set = (patch: Partial<PatientInput>) => setData((d) => ({ ...d, ...patch }));
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

  const code = data.guardians
    .filter((g) => g.name.trim())
    .map((g) => (g.kind === "pai" ? "M" : "F"))
    .sort()
    .join("");

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
          <div>
            <label htmlFor="p-test">Teste</label>
            <select id="p-test" value={data.testId} onChange={(e) => set({ testId: e.target.value })} disabled={testLocked}>
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
        <div className="row spread">
          <h2 style={{ margin: 0 }}>Responsáveis</h2>
          {code && <span className="pill">família {code}</span>}
        </div>
        <p className="muted small">Cadastre mãe e pai, duas mães ou dois pais. Cada responsável recebe o próprio link e responde separadamente.</p>
        <div className="stack">
          {data.guardians.map((g, i) => (
            <div key={g.id ?? i} className="guardian-row">
              <select value={g.kind} onChange={(e) => setGuardian(i, { kind: e.target.value as GuardianKind })} aria-label="Mãe ou pai">
                <option value="mae">Mãe</option>
                <option value="pai">Pai</option>
              </select>
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
