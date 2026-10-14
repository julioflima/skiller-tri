"use server";

import { requireUser } from "@/lib/auth";
import { newId, newToken, updateDb } from "@/lib/db";
import { fail, guard } from "@/lib/result";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_DAYS = 7;
const expiry = () => new Date(Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000).toISOString();

/** Cria um link de convite. Com e-mail, só essa pessoa consegue usá-lo; sem e-mail, quem abrir informa o seu. */
export async function createInvite(input: { name: string; email: string; role: "admin" | "terapeuta"; schoolId?: string }) {
  return guard(async () => {
    const me = await requireUser({ admin: true });
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (email && !EMAIL.test(email)) fail("E-mail inválido.");
    await updateDb((db) => {
      if (email && db.users.some((u) => u.email === email)) fail("Já existe uma conta com este e-mail.");
      const role = input.role === "terapeuta" ? "terapeuta" : "admin";
      if (role === "terapeuta" && !db.schools.some((s) => s.id === input.schoolId)) fail("Escolha a escola do terapeuta.");
      // um convite pendente por e-mail: o novo substitui o anterior
      if (email) db.invites = db.invites.filter((i) => i.acceptedAt || i.email !== email);
      db.invites.push({
        id: newId(),
        email,
        name,
        role,
        schoolId: role === "terapeuta" ? input.schoolId : undefined,
        token: newToken(),
        invitedBy: me.id,
        createdAt: new Date().toISOString(),
        expiresAt: expiry(),
      });
    });
    return "Link de convite criado. Copie e envie para a pessoa.";
  });
}

/** Troca o token (o link antigo deixa de funcionar) e renova a validade. */
export async function renewInvite(id: string) {
  return guard(async () => {
    await requireUser({ admin: true });
    await updateDb((db) => {
      const inv = db.invites.find((i) => i.id === id && !i.acceptedAt);
      if (!inv) fail("Convite não encontrado.");
      inv.token = newToken();
      inv.expiresAt = expiry();
    });
    return "Novo link gerado. O anterior deixou de funcionar.";
  });
}

export async function revokeInvite(id: string) {
  return guard(async () => {
    await requireUser({ admin: true });
    await updateDb((db) => {
      db.invites = db.invites.filter((i) => i.id !== id || i.acceptedAt);
    });
    return "Convite cancelado.";
  });
}
