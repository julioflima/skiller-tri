import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { NewTestForm } from "./NewTestForm";

export default async function TestsPage() {
  await requirePageUser({ admin: true });
  const db = await readDb();
  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Testes</h1>
      <p className="muted" style={{ margin: 0 }}>
        Cada teste define as perguntas, para quem elas são feitas, a classificação, as respostas e seus pesos, e quantas perguntas cada pessoa
        responde no início do tratamento e a cada sessão.
      </p>
      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Teste</th>
                <th>Perguntas</th>
                <th>Classificações</th>
                <th>Etapas</th>
                <th>Pacientes</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {db.tests.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/painel/testes/${t.id}`}>
                      <strong>{t.name}</strong>
                    </Link>
                    {t.description && <div className="faint">{t.description}</div>}
                  </td>
                  <td>{t.questions.filter((q) => q.active).length}</td>
                  <td>{t.categories.length}</td>
                  <td className="small">{t.stages.map((s) => s.name).join(", ") || "—"}</td>
                  <td>{db.patients.filter((p) => p.testId === t.id).length}</td>
                  <td>{t.active ? <span className="pill high">ativo</span> : <span className="pill">inativo</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <NewTestForm tests={db.tests.map((t) => ({ id: t.id, name: t.name }))} />
    </div>
  );
}
