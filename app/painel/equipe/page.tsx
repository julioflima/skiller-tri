import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { InviteSection } from "./InviteSection";
import { MembersTable, NewMemberForm } from "./TeamManager";

export default async function TeamPage() {
  const me = await requirePageUser({ admin: true });
  const db = await readDb();
  const now = new Date();
  const invites = db.invites
    .filter((i) => !i.acceptedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((i) => ({ id: i.id, token: i.token, email: i.email, name: i.name, role: i.role, expiresAt: i.expiresAt, expired: new Date(i.expiresAt) < now }));
  const members = [...db.users]
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"))
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      patients: db.patients.filter((p) => p.therapistId === u.id && !p.archived).length,
    }));

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Equipe</h1>
      <p className="muted" style={{ margin: 0 }}>Terapeutas veem apenas os próprios pacientes. Administradores veem todos e configuram os testes.</p>
      <NewMemberForm />
      <InviteSection invites={invites} />
      <MembersTable members={members} meId={me.id} />
    </div>
  );
}
