import Link from "next/link";
import { redirect } from "next/navigation";
import { canSeePatient, managesPatients, requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";

/** Pacientes da escola do usuário. O administrador não tem lista global: vê os pacientes dentro de cada escola. */
export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; terapeuta?: string; arquivados?: string }> }) {
  const user = await requirePageUser();
  if (user.role === "admin") redirect("/painel/escolas");
  const { q = "", terapeuta = "", arquivados = "" } = await searchParams;
  const db = await readDb();
  const users = new Map(db.users.map((u) => [u.id, u]));
  const tests = new Map(db.tests.map((t) => [t.id, t]));
  const wholeSchool = managesPatients(user); // administrador da escola: vê todos os pacientes e terapeutas
  const term = q.trim().toLowerCase();
  const school = db.schools.find((s) => s.id === user.schoolId);
  const escola = school?.id ?? "";

  const list = db.patients
    .filter((p) => canSeePatient(user, p))
    .filter((p) => (arquivados ? p.archived : !p.archived))
    .filter((p) => p.schoolId === escola)
    .filter((p) => !terapeuta || p.therapistId === terapeuta)
    .filter((p) => !term || p.name.toLowerCase().includes(term) || p.guardians.some((g) => g.name.toLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const therapists = db.users.filter((u) => u.active && u.role === "terapeuta" && u.schoolId === escola);
  // administrador não é terapeuta: paciente ainda ligado a um admin (cadastro antigo) aparece como pendente de terapeuta
  const therapistName = (id: string) => {
    const t = users.get(id);
    return t?.role === "terapeuta" ? t.name : "sem terapeuta";
  };

  return (
    <div className="stack">
      <div className="row spread">
        <div>
          <h1 style={{ margin: 0 }}>Pacientes</h1>
          <p className="muted" style={{ margin: 0 }}>{!school ? "Sua conta não está ligada a uma escola." : wholeSchool ? `Todos os pacientes da ${school.name}` : `Seus pacientes na ${school.name}`}</p>
        </div>
        {wholeSchool && (
          <Link href="/painel/pacientes/novo" className="btn warm">
            + Novo paciente
          </Link>
        )}
      </div>

      <form className="card alt row tight">
        <input type="search" name="q" placeholder="Buscar paciente ou responsável…" defaultValue={q} style={{ flex: 2, minWidth: 200 }} />
        {wholeSchool && (
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
                  {wholeSchool && <th>Terapeuta</th>}
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
                      {wholeSchool && <td className="small">{therapistName(p.therapistId)}</td>}
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
