import type { SessionUser } from "@/lib/auth";
import type { Db } from "@/lib/types";
import { InviteSection } from "./InviteSection";
import { MembersTable, NewMemberForm } from "./TeamManager";

/** Equipe da escola (terapeutas e administradores): lista, cadastro e convites. Usada pelo dono e pelo administrador da escola. */
export function TeamSection({ db, me }: { db: Db; me: SessionUser }) {
  const now = new Date();
  const members = db.users
    .filter((u) => u.role !== "admin")
    .sort((a, b) => Number(b.active) - Number(a.active) || a.role.localeCompare(b.role) || a.name.localeCompare(b.name, "pt-BR"))
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      patients: db.patients.filter((p) => p.therapistId === u.id && !p.archived).length,
    }));
  const invites = db.invites
    .filter((i) => !i.acceptedAt && i.role !== "admin")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((i) => ({ id: i.id, token: i.token, email: i.email, name: i.name, role: i.role, expiresAt: i.expiresAt, expired: new Date(i.expiresAt) < now }));

  return (
    <>
      <MembersTable title="Equipe" members={members} meId={me.id} />
      <NewMemberForm />
      <InviteSection invites={invites} team />
    </>
  );
}
