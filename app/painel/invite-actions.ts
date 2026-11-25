"use server";

import { canManageTeam, requireUser } from "@/lib/auth";
import { isSchoolRole, type Role } from "@/lib/roles";
import { newId, newToken, updateDb } from "@/lib/db";
import { fail, guard } from "@/lib/result";
import { SCHOOL_ID } from "@/lib/schools";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_DAYS = 7;
const expiry = () => new Date(Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000).toISOString();

/** Cria um link de convite. Com e-mail, só essa pessoa consegue usá-lo; sem e-mail, quem abrir informa o seu. */
export async function createInvite(input: { name: string; email: string; role: Role }) {
  return guard(async () => {
    const me = await requireUser({ manager: true });
    const role: Role = isSchoolRole(input.role) ? input.role : "admin";
    // dono convida donos e a equipe; o administrador da escola, só a equipe
    if (role === "admin" ? me.role !== "admin" : !canManageTeam(me)) fail("Você não pode criar este convite.");
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (email && !EMAIL.test(email)) fail("E-mail inválido.");
    await updateDb((db) => {
      if (email && db.users.some((u) => u.email === email)) fail("Já existe uma conta com este e-mail.");
      // um convite pendente por e-mail: o novo substitui o anterior
      if (email) db.invites = db.invites.filter((i) => i.acceptedAt || i.email !== email);
      db.invites.push({
        id: newId(),
        email,
        name,
        role,
        schoolId: role === "admin" ? undefined : SCHOOL_ID,
        token: newToken(),
        invitedBy: me.id,
        createdAt: new Date().toISOString(),
        expiresAt: expiry(),
      });
    });
    return "Link de convite criado. Copie e envie para a pessoa.";
  });
}

const mayTouch = (me: Parameters<typeof canManageTeam>[0], inv: { role: Role }) => (inv.role === "admin" ? me.role === "admin" : canManageTeam(me));

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
