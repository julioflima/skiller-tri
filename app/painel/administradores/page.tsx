import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { InviteSection } from "../equipe/InviteSection";
import { MembersTable } from "../equipe/TeamManager";

/** Equipe da plataforma. Terapeutas são cadastrados dentro da escola (Escolas → escola → Equipe). */
export default async function AdminsPage() {
  const me = await requirePageUser({ admin: true });
  const db = await readDb();
  const now = new Date();
  const schools = db.schools.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }));
  const invites = db.invites
    .filter((i) => !i.acceptedAt && i.role === "admin")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((i) => ({ id: i.id, token: i.token, email: i.email, name: i.name, role: i.role, expiresAt: i.expiresAt, expired: new Date(i.expiresAt) < now }));
  const members = db.users
    .filter((u) => u.role === "admin")
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"))
    .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, patients: 0 }));

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Administradores</h1>
      <p className="muted" style={{ margin: 0 }}>
        Administradores são a equipe da plataforma: veem todas as escolas, configuram os testes e cadastram escolas. Terapeutas pertencem a uma
        escola e são cadastrados dentro dela, em Escolas.
      </p>
      <InviteSection invites={invites} />
      <MembersTable title="Administradores" members={members} meId={me.id} schools={schools} />
    </div>
  );
}
