"use server";

import { redirect } from "next/navigation";
import { endSession, startSession } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

export async function login(_: { error: string }, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const db = await readDb();
  const user = db.users.find((u) => u.email === email && u.active);
  // verifica mesmo sem usuário, para não revelar quais e-mails existem pelo tempo de resposta
  const ok = await verifyPassword(password, user?.passwordHash ?? "scrypt$00$00");
  if (!user || !ok) return { error: "E-mail ou senha incorretos." };
  await startSession(user.id);
  redirect("/painel");
}

export async function logout() {
  await endSession();
  redirect("/");
}
