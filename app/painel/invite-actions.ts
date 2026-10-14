"use server";

import { canManageTeam, requireUser } from "@/lib/auth";
import { isSchoolRole, type Role } from "@/lib/roles";
import { newId, newToken, updateDb } from "@/lib/db";
import { fail, guard } from "@/lib/result";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_DAYS = 7;
const expiry = () => new Date(Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000).toISOString();

/** Cria um link de convite. Com e-mail, só essa pessoa consegue usá-lo; sem e-mail, quem abrir informa o seu. */
export async function createInvite(input: { name: string; email: string; role: Role; schoolId?: string }) {
  return guard(async () => {
    const me = await requireUser({ manager: true });
    const role: Role = isSchoolRole(input.role) ? input.role : "admin";
    // dono convida donos e qualquer escola; o administrador da escola, só para a própria
    if (role === "admin" ? me.role !== "admin" : !canManageTeam(me, input.schoolId)) fail("Você não pode convidar para esta escola.");
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (email && !EMAIL.test(email)) fail("E-mail inválido.");
    await updateDb((db) => {
      if (email && db.users.some((u) => u.email === email)) fail("Já existe uma conta com este e-mail.");
      if (role !== "admin" && !db.schools.some((s) => s.id === input.schoolId)) fail("Escolha a escola.");
      // um convite pendente por e-mail: o novo substitui o anterior
      if (email) db.invites = db.invites.filter((i) => i.acceptedAt || i.email !== email);
      db.invites.push({
        id: newId(),
        email,
        name,
        role,
        schoolId: role === "admin" ? undefined : input.schoolId,
        token: newToken(),
        invitedBy: me.id,
        createdAt: new Date().toISOString(),
        expiresAt: expiry(),
      });
    });
    return "Link de convite criado. Copie e envie para a pessoa.";
  });
}

const mayTouch = (me: Parameters<typeof canManageTeam>[0], inv: { role: Role; schoolId?: string }) =>
  inv.role === "admin" ? me.role === "admin" : canManageTeam(me, inv.schoolId);

/** Troca o token (o link antigo deixa de funcionar) e renova a validade. */
export async function renewInvite(id: string) {
  return guard(async () => {
    const me = await requireUser({ manager: true });
    await updateDb((db) => {
      const inv = db.invites.find((i) => i.id === id && !i.acceptedAt);
      if (!inv || !mayTouch(me, inv)) fail("Convite não encontrado.");
      inv.token = newToken();
      inv.expiresAt = expiry();
    });
    return "Novo link gerado. O anterior deixou de funcionar.";
  });
}

export async function revokeInvite(id: string) {
  return guard(async () => {
    const me = await requireUser({ manager: true });
    await updateDb((db) => {
      const inv = db.invites.find((i) => i.id === id && !i.acceptedAt);
      if (!inv || !mayTouch(me, inv)) fail("Convite não encontrado.");
      db.invites = db.invites.filter((i) => i.id !== id || i.acceptedAt);
    });
    return "Convite cancelado.";
  });
}
