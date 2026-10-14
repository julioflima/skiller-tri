"use server";

import { redirect } from "next/navigation";
import { startSession } from "@/lib/auth";
import { newId, newToken, updateDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function acceptInvite(_: { error: string }, form: FormData): Promise<{ error: string }> {
  const token = String(form.get("token") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const typedEmail = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (!name) return { error: "Informe seu nome." };
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  if (password !== confirm) return { error: "As senhas não conferem." };

  const passwordHash = await hashPassword(password);
  const result = await updateDb((db): { error: string } | { userId: string } => {
    const inv = db.invites.find((i) => token && i.token === token && !i.acceptedAt);
    if (!inv || new Date(inv.expiresAt) < new Date()) return { error: "Este convite é inválido ou expirou. Peça um novo ao administrador." };
    const email = inv.email || typedEmail;
    if (!EMAIL.test(email)) return { error: "E-mail inválido." };
    if (db.users.some((u) => u.email === email)) return { error: "Já existe uma conta com este e-mail. Entre pela tela inicial." };
    if (inv.role === "terapeuta" && !db.schools.some((s) => s.id === inv.schoolId && s.active)) {
      return { error: "A escola deste convite não está mais ativa. Peça um novo convite ao administrador." };
    }
    const id = newId();
    db.users.push({
      id,
      name,
      email,
      passwordHash,
      role: inv.role,
      schoolId: inv.role === "terapeuta" ? inv.schoolId : undefined,
      active: true,
      createdAt: new Date().toISOString(),
      token: newToken(),
    });
    inv.acceptedAt = new Date().toISOString();
    return { userId: id };
  });
  if ("error" in result) return result;
  await startSession(result.userId);
  redirect("/painel");
}
