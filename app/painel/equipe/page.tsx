import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { InviteSection } from "./InviteSection";
import { MembersTable, NewMemberForm } from "./TeamManager";

export default async function TeamPage() {
  const me = await requirePageUser({ admin: true });
  const db = await readDb();
  const now = new Date();
  const schoolName = (id?: string) => db.schools.find((s) => s.id === id)?.name;
  const schools = db.schools.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }));
  const invites = db.invites
    .filter((i) => !i.acceptedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((i) => ({ id: i.id, token: i.token, email: i.email, name: i.name, role: i.role, school: schoolName(i.schoolId), expiresAt: i.expiresAt, expired: new Date(i.expiresAt) < now }));
  const members = [...db.users]
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"))
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      schoolId: u.schoolId,
      school: schoolName(u.schoolId),
      active: u.active,
      patients: db.patients.filter((p) => p.therapistId === u.id && !p.archived).length,
    }));

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Equipe</h1>
      <p className="muted" style={{ margin: 0 }}>
        Cada terapeuta pertence a uma escola e vê só os próprios pacientes, nos testes que a escola aplica. Administradores são a equipe da
        plataforma: veem todas as escolas e configuram os testes.
      </p>
      <NewMemberForm schools={schools} />
      <InviteSection invites={invites} schools={schools} />
      <MembersTable members={members} meId={me.id} schools={schools} />
    </div>
  );
}
