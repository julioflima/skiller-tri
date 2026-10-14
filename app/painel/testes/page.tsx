import Link from "next/link";
import { ActionButton } from "@/app/components/ActionButton";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { restoreTest } from "../test-actions";
import { NewTestForm } from "./NewTestForm";

const dateBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function TestsPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await requirePageUser({ admin: true });
  const { aba } = await searchParams;
  const db = await readDb();
  const tests = db.tests.filter((t) => !t.deletedAt);
  const deleted = db.tests.filter((t) => t.deletedAt).sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!));
  const showDeleted = aba === "arquivo";
  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Testes</h1>
      <p className="muted" style={{ margin: 0 }}>
        Cada teste define as perguntas, para quem elas são feitas, a classificação, as respostas e seus pesos, e quantas perguntas cada pessoa
        responde no início do tratamento e a cada sessão.
      </p>
      <nav className="tabs" style={{ marginBottom: 0 }}>
        <Link href="/painel/testes" className={`tab${showDeleted ? "" : " active"}`}>
          Testes ({tests.length})
        </Link>
        <Link href="/painel/testes?aba=arquivo" className={`tab${showDeleted ? " active" : ""}`}>
          Arquivo ({deleted.length})
        </Link>
      </nav>
      {showDeleted ? (
        <section className="card">
          {deleted.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Teste</th>
                    <th>Excluído em</th>
                    <th>Pacientes arquivados</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {deleted.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.name}</strong>
                        {t.description && <div className="faint">{t.description}</div>}
                      </td>
                      <td>{dateBR(t.deletedAt!)}</td>
                      <td>{t.deletedFrom?.patientIds.length ?? 0}</td>
                      <td style={{ textAlign: "right" }}>
                        <ActionButton
                          action={restoreTest.bind(null, t.id)}
                          confirmText={`Restaurar "${t.name}"? Ele volta inativo, às escolas que o aplicavam e com os pacientes que a exclusão arquivou.`}
                        >
                          Restaurar
                        </ActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              O arquivo está vazio.
            </p>
          )}
        </section>
      ) : (
        <>
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
                  {tests.map((t) => (
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
          <NewTestForm tests={tests.map((t) => ({ id: t.id, name: t.name }))} />
        </>
      )}
    </div>
  );
}
