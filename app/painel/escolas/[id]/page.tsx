import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { InviteSection } from "../../equipe/InviteSection";
import { MembersTable, NewMemberForm } from "../../equipe/TeamManager";
import { SchoolSettings } from "../SchoolEditor";
import { impersonate } from "../../impersonate-actions";

export default async function SchoolPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const me = await requirePageUser({ admin: true });
  const { id } = await params;
  const db = await readDb();
  const school = db.schools.find((s) => s.id === id);
  if (!school) notFound();
  // escola recém-criada, sem testes, abre no que falta configurar
  const { aba = school.testIds.length ? "pacientes" : "dados" } = await searchParams;

  const now = new Date();
  const users = new Map(db.users.map((u) => [u.id, u]));
  const tests = new Map(db.tests.map((t) => [t.id, t]));
  const schoolOptions = db.schools.filter((s) => s.active || s.id === school.id).map((s) => ({ id: s.id, name: s.name }));
  const patients = db.patients.filter((p) => p.schoolId === school.id && !p.archived).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const members = db.users
    .filter((u) => u.schoolId === school.id)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"))
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      schoolId: u.schoolId,
      school: school.name,
      active: u.active,
      patients: patients.filter((p) => p.therapistId === u.id).length,
    }));
  const invites = db.invites
    .filter((i) => !i.acceptedAt && i.schoolId === school.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((i) => ({ id: i.id, token: i.token, email: i.email, name: i.name, role: i.role, school: school.name, expiresAt: i.expiresAt, expired: new Date(i.expiresAt) < now }));

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
          <form action={impersonate.bind(null, { kind: "escola", id: school.id })}>
            <button className="btn ghost sm">Ver como esta escola</button>
          </form>
        </div>
      </div>
      <nav className="tabs" style={{ marginBottom: 0 }}>
        {tab("pacientes", `Pacientes (${patients.length})`)}
        {tab("equipe", `Equipe (${members.filter((m) => m.active).length})`)}
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
          tests={db.tests.map((t) => ({ id: t.id, name: t.name, active: t.active }))}
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
        <>
          <MembersTable title="Terapeutas" members={members} meId={me.id} schools={schoolOptions} canImpersonate />
          <NewMemberForm school={{ id: school.id, name: school.name }} />
          <InviteSection invites={invites} school={{ id: school.id, name: school.name }} />
        </>
      )}
    </div>
  );
}
