import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { NewSchoolForm, SchoolCard } from "./SchoolEditor";

export default async function SchoolsPage() {
  await requirePageUser({ admin: true });
  const db = await readDb();
  const tests = db.tests.map((t) => ({ id: t.id, name: t.name, active: t.active }));
  const schools = [...db.schools]
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"))
    .map((s) => ({
      id: s.id,
      name: s.name,
      active: s.active,
      testIds: s.testIds,
      therapists: db.users.filter((u) => u.schoolId === s.id && u.active).map((u) => u.name),
      patients: db.patients.filter((p) => p.schoolId === s.id && !p.archived).length,
      testsInUse: [...new Set(db.patients.filter((p) => p.schoolId === s.id && !p.archived).map((p) => p.testId))],
    }));

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Escolas</h1>
      <p className="muted" style={{ margin: 0 }}>
        Cada escola é uma equipe de terapeutas que aplica alguns testes da plataforma aos próprios pacientes. O terapeuta não acessa a plataforma:
        vê só os testes da sua escola, respondidos pelos seus pacientes.
      </p>
      <NewSchoolForm />
      {schools.map((s) => (
        <SchoolCard key={s.id} school={s} tests={tests} />
      ))}
    </div>
  );
}
