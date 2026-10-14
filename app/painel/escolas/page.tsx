import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { NewSchoolForm } from "./SchoolEditor";

export default async function SchoolsPage() {
  await requirePageUser({ admin: true });
  const db = await readDb();
  const testName = new Map(db.tests.map((t) => [t.id, t.name]));
  const schools = [...db.schools].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Escolas</h1>
      <p className="muted" style={{ margin: 0 }}>
        Cada escola é uma equipe de terapeutas que aplica alguns testes da plataforma aos próprios pacientes. O terapeuta não acessa a plataforma:
        vê só os testes da sua escola, respondidos pelos seus pacientes. Abra uma escola para configurar testes, equipe e pacientes.
      </p>
      <NewSchoolForm />
      <section className="card">
        {schools.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nenhuma escola cadastrada ainda.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Escola</th>
                  <th>Testes aplicados</th>
                  <th>Terapeutas</th>
                  <th>Pacientes</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {schools.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/painel/escolas/${s.id}`}>
                        <strong>{s.name}</strong>
                      </Link>
                    </td>
                    <td className="small">{s.testIds.map((id) => testName.get(id)).filter(Boolean).join(", ") || "—"}</td>
                    <td>{db.users.filter((u) => u.schoolId === s.id && u.active).length}</td>
                    <td>{db.patients.filter((p) => p.schoolId === s.id && !p.archived).length}</td>
                    <td>{s.active ? <span className="pill high">ativa</span> : <span className="pill">inativa</span>}</td>
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
