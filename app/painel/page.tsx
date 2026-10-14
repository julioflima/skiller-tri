import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; terapeuta?: string; arquivados?: string }> }) {
  const user = await requirePageUser();
  const { q = "", terapeuta = "", arquivados = "" } = await searchParams;
  const db = await readDb();
  const users = new Map(db.users.map((u) => [u.id, u]));
  const tests = new Map(db.tests.map((t) => [t.id, t]));
  const term = q.trim().toLowerCase();

  const list = db.patients
    .filter((p) => user.role === "admin" || p.therapistId === user.id)
    .filter((p) => (arquivados ? p.archived : !p.archived))
    .filter((p) => !terapeuta || p.therapistId === terapeuta)
    .filter((p) => !term || p.name.toLowerCase().includes(term) || p.guardians.some((g) => g.name.toLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const therapists = db.users.filter((u) => u.active);

  return (
    <div className="stack">
      <div className="row spread">
        <h1 style={{ margin: 0 }}>Pacientes</h1>
        <Link href="/painel/pacientes/novo" className="btn warm">
          + Novo paciente
        </Link>
      </div>

      <form className="card alt row tight">
        <input type="search" name="q" placeholder="Buscar paciente ou responsável…" defaultValue={q} style={{ flex: 2, minWidth: 200 }} />
        {user.role === "admin" && (
          <select name="terapeuta" defaultValue={terapeuta} style={{ flex: 1, minWidth: 160 }}>
            <option value="">Todos os terapeutas</option>
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <label className="small" style={{ fontWeight: 400, margin: 0 }}>
          <input type="checkbox" name="arquivados" value="1" defaultChecked={!!arquivados} /> arquivados
        </label>
        <button className="btn sm">Filtrar</button>
      </form>

      <section className="card">
        {list.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nenhum paciente {arquivados ? "arquivado" : "cadastrado"} ainda.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Responsáveis</th>
                  {user.role === "admin" && <th>Terapeuta</th>}
                  <th>Teste</th>
                  <th>Sessões</th>
                  <th>Pendências</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const forms = db.forms.filter((f) => f.patientId === p.id);
                  const pending = forms.filter((f) => !f.finishedAt).length;
                  const sessions = db.sessions.filter((s) => s.patientId === p.id).length;
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/painel/pacientes/${p.id}`}>
                          <strong>{p.name}</strong>
                        </Link>
                      </td>
                      <td className="small">{p.guardians.map((g) => g.name).join(", ") || "—"}</td>
                      {user.role === "admin" && <td className="small">{users.get(p.therapistId)?.name ?? "—"}</td>}
                      <td className="small">{tests.get(p.testId)?.name ?? "—"}</td>
                      <td>{sessions}</td>
                      <td>{pending ? <span className="pill mid">{pending} formulário(s)</span> : <span className="pill high">em dia</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
