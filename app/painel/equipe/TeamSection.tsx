import type { SessionUser } from "@/lib/auth";
import type { Db, School } from "@/lib/types";
import { InviteSection } from "./InviteSection";
import { MembersTable, NewMemberForm } from "./TeamManager";

/** Equipe de uma escola (terapeutas e administradores): lista, cadastro e convites. Usada pelo dono e pelo administrador da escola. */
export function TeamSection({ db, school, me }: { db: Db; school: School; me: SessionUser }) {
  const now = new Date();
  const isOwner = me.role === "admin";
  const members = db.users
    .filter((u) => u.role !== "admin" && u.schoolId === school.id)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.role.localeCompare(b.role) || a.name.localeCompare(b.name, "pt-BR"))
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      schoolId: u.schoolId,
      school: school.name,
      active: u.active,
      patients: db.patients.filter((p) => p.therapistId === u.id && p.schoolId === school.id && !p.archived).length,
    }));
  const invites = db.invites
    .filter((i) => !i.acceptedAt && i.role !== "admin" && i.schoolId === school.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((i) => ({ id: i.id, token: i.token, email: i.email, name: i.name, role: i.role, school: school.name, expiresAt: i.expiresAt, expired: new Date(i.expiresAt) < now }));
  // só o dono move pessoas entre escolas
  const schools = isOwner ? db.schools.filter((s) => s.active || s.id === school.id).map((s) => ({ id: s.id, name: s.name })) : [];
  const ref = { id: school.id, name: school.name };

  return (
    <>
      <MembersTable title="Equipe" members={members} meId={me.id} schools={schools} canImpersonate={isOwner && !me.impersonator} />
      <NewMemberForm school={ref} />
      <InviteSection invites={invites} school={ref} />
    </>
  );
}
