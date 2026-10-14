import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { InviteSection } from "../../equipe/InviteSection";
import { MembersTable } from "../../equipe/TeamManager";

/** Donos do Skiller TRI. Terapeutas e administradores de escola ficam dentro de cada escola (Escolas → escola → Equipe). */
export default async function OwnersPage() {
  const me = await requirePageUser({ admin: true });
  const db = await readDb();
  const now = new Date();
  const invites = db.invites
    .filter((i) => !i.acceptedAt && i.role === "admin")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((i) => ({ id: i.id, token: i.token, email: i.email, name: i.name, role: i.role, expiresAt: i.expiresAt, expired: new Date(i.expiresAt) < now }));
  const members = db.users
    .filter((u) => u.role === "admin")
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"))
    .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, patients: 0 }));

  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Os donos são do Skiller TRI: criam os testes e as escolas, veem todas elas e podem ver o painel como qualquer escola ou pessoa. Terapeutas e
        administradores de escola são cadastrados dentro de cada escola.
      </p>
      <InviteSection invites={invites} />
      <MembersTable title="Donos" members={members} meId={me.id} />
    </>
  );
}
