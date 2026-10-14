import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { TeamSection } from "../../equipe/TeamSection";
import { SchoolSettings } from "../SchoolEditor";

export default async function SchoolPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const me = await requirePageUser({ admin: true });
  const { id } = await params;
  const db = await readDb();
  const school = db.schools.find((s) => s.id === id);
  if (!school) notFound();
  // escola recém-criada, sem testes, abre no que falta configurar
  const { aba = school.testIds.length ? "pacientes" : "dados" } = await searchParams;

  const users = new Map(db.users.map((u) => [u.id, u]));
  const tests = new Map(db.tests.map((t) => [t.id, t]));
  const patients = db.patients.filter((p) => p.schoolId === school.id && !p.archived).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const team = db.users.filter((u) => u.role !== "admin" && u.schoolId === school.id && u.active).length;

  const tab = (key: string, label: string) => (
    <Link href={`/painel/escolas/${school.id}?aba=${key}`} className={`tab${aba === key ? " active" : ""}`}>
      {label}
    </Link>
  );

  return (
    <div className="stack">
      <Link href="/painel/escolas" className="faint">
        ← Escolas
      </Link>
      <div className="row spread">
        <h1 style={{ margin: 0 }}>{school.name}</h1>
        <div className="row">
          {school.active ? <span className="pill high">ativa</span> : <span className="pill">inativa</span>}
        </div>
      </div>
      <nav className="tabs" style={{ marginBottom: 0 }}>
        {tab("pacientes", `Pacientes (${patients.length})`)}
        {tab("equipe", `Equipe (${team})`)}
        {tab("dados", "Dados e testes")}
      </nav>

      {aba === "dados" ? (
        <SchoolSettings
          key={`${school.name}|${school.active}|${school.testIds.join()}`}
          school={{
            id: school.id,
            name: school.name,
            active: school.active,
            testIds: school.testIds,
            testsInUse: [...new Set(patients.map((p) => p.testId))],
          }}
          tests={db.tests.filter((t) => !t.deletedAt).map((t) => ({ id: t.id, name: t.name, active: t.active }))}
        />
      ) : aba !== "equipe" ? (
        <section className="card stack">
          <div className="row spread">
            <h2 style={{ margin: 0 }}>Pacientes</h2>
            <Link href={`/painel/pacientes/novo?escola=${school.id}`} className="btn warm sm">
              + Novo paciente
            </Link>
          </div>
          {patients.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Nenhum paciente nesta escola ainda.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Terapeuta</th>
                    <th>Teste</th>
                    <th>Sessões</th>
                    <th>Pendências</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p) => {
                    const pending = db.forms.filter((f) => f.patientId === p.id && !f.finishedAt).length;
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/painel/pacientes/${p.id}`}>
                            <strong>{p.name}</strong>
                          </Link>
                        </td>
                        <td className="small">{users.get(p.therapistId)?.role === "terapeuta" ? users.get(p.therapistId)!.name : "sem terapeuta"}</td>
                        <td className="small">{tests.get(p.testId)?.name ?? "—"}</td>
                        <td>{db.sessions.filter((s) => s.patientId === p.id).length}</td>
                        <td>{pending ? <span className="pill mid">{pending} formulário(s)</span> : <span className="pill high">em dia</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <TeamSection db={db} school={school} me={me} />
      )}
    </div>
  );
}
