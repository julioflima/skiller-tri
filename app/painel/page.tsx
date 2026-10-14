import Link from "next/link";
import { canSeePatient, picksTherapist, requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; escola?: string; terapeuta?: string; arquivados?: string }> }) {
  const user = await requirePageUser();
  const { q = "", escola: escolaParam = "", terapeuta = "", arquivados = "" } = await searchParams;
  const db = await readDb();
  const users = new Map(db.users.map((u) => [u.id, u]));
  const tests = new Map(db.tests.map((t) => [t.id, t]));
  const isAdmin = user.role === "admin";
  const wholeSchool = picksTherapist(user); // admin ou visão de escola: vê todos os terapeutas
  const term = q.trim().toLowerCase();

  // todo paciente pertence a uma escola: o admin vê uma escola por vez (a do ?escola= ou a primeira); o terapeuta, a sua
  const schoolList = db.schools
    .filter((s) => s.active || s.id === escolaParam || db.patients.some((p) => p.schoolId === s.id))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"));
  const school = isAdmin ? (schoolList.find((s) => s.id === escolaParam) ?? schoolList[0]) : db.schools.find((s) => s.id === user.schoolId);
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
  const countIn = (schoolId: string) => db.patients.filter((p) => p.schoolId === schoolId && !p.archived).length;

  return (
    <div className="stack">
      <div className="row spread">
        <div>
          <h1 style={{ margin: 0 }}>Pacientes</h1>
          {!isAdmin && <p className="muted" style={{ margin: 0 }}>{!school ? "Sua conta não está ligada a uma escola." : user.scope === "escola" ? `Todos os pacientes da ${school.name}` : `Seus pacientes na ${school.name}`}</p>}
        </div>
        <Link href={escola ? `/painel/pacientes/novo?escola=${escola}` : "/painel/pacientes/novo"} className="btn warm">
          + Novo paciente
        </Link>
      </div>

      {isAdmin && schoolList.length > 1 && (
        <nav className="tabs" style={{ marginBottom: 0 }}>
          {schoolList.map((s) => (
            <Link key={s.id} href={`/painel?escola=${s.id}`} className={`tab${s.id === escola ? " active" : ""}`}>
              {s.name} ({countIn(s.id)})
            </Link>
          ))}
        </nav>
      )}
      {isAdmin && !school && <p className="muted">Nenhuma escola cadastrada. Crie uma em Escolas.</p>}

      <form className="card alt row tight">
        <input type="search" name="q" placeholder="Buscar paciente ou responsável…" defaultValue={q} style={{ flex: 2, minWidth: 200 }} />
        {isAdmin && <input type="hidden" name="escola" value={escola} />}
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
            Nenhum paciente {arquivados ? "arquivado" : "cadastrado"} {isAdmin && school ? `na ${school.name}` : ""} ainda.
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
