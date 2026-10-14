"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/app/components/useToast";
import type { Result } from "@/lib/result";
import { createSchool, updateSchool } from "../school-actions";

type TestOption = { id: string; name: string; active: boolean };
type SchoolView = {
  id: string;
  name: string;
  active: boolean;
  testIds: string[];
  therapists: string[];
  patients: number;
  testsInUse: string[];
};

function useRunner() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, onOk?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.show(res.error);
      toast.show(res.message ?? "Feito.");
      onOk?.();
      router.refresh();
    });
  return { run, pending, toast };
}

export function NewSchoolForm() {
  const { run, pending, toast } = useRunner();
  const [name, setName] = useState("");
  return (
    <form
      className="card alt row"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createSchool(name), () => setName(""));
      }}
    >
      {toast.node}
      <input type="text" placeholder="Nome da nova escola" value={name} onChange={(e) => setName(e.target.value)} required style={{ flex: 2, minWidth: 200 }} />
      <button className="btn warm" disabled={pending || !name.trim()}>
        + Criar escola
      </button>
    </form>
  );
}

export function SchoolCard({ school, tests }: { school: SchoolView; tests: TestOption[] }) {
  const { run, pending, toast } = useRunner();
  const [f, setF] = useState({ name: school.name, active: school.active, testIds: school.testIds });
  const dirty = f.name !== school.name || f.active !== school.active || f.testIds.join() !== school.testIds.join();
  const toggle = (id: string) => setF({ ...f, testIds: f.testIds.includes(id) ? f.testIds.filter((t) => t !== id) : [...f.testIds, id] });

  return (
    <section className="card stack">
      {toast.node}
      <div className="row spread">
        <input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Nome da escola" style={{ flex: 1, minWidth: 200, fontWeight: 700 }} />
        <label className="small" style={{ fontWeight: 400, margin: 0 }}>
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> ativa
        </label>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        {school.patients} paciente(s) · equipe: {school.therapists.join(", ") || "nenhum terapeuta ainda (cadastre em Equipe)"}
      </p>
      <div>
        <label>Testes aplicados</label>
        {tests.length === 0 ? (
          <p className="faint">Nenhum teste na plataforma.</p>
        ) : (
          <div className="row">
            {tests.map((t) => (
              <label key={t.id} className="small" style={{ fontWeight: 400, margin: 0 }} title={school.testsInUse.includes(t.id) ? "Em uso por pacientes desta escola" : ""}>
                <input type="checkbox" checked={f.testIds.includes(t.id)} onChange={() => toggle(t.id)} /> {t.name}
                {!t.active && <span className="faint"> (inativo)</span>}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="row">
        <button className="btn sm" disabled={pending || !dirty} onClick={() => run(() => updateSchool(school.id, f))}>
          Salvar
        </button>
      </div>
    </section>
  );
}
