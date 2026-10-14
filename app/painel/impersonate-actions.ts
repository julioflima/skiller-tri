"use server";

import { redirect } from "next/navigation";
import { currentUser, endImpersonation, realUser, startImpersonation, type Impersonation } from "@/lib/auth";
import { readDb } from "@/lib/db";

/** O dono passa a ver o painel como uma escola (com os poderes do administrador dela) ou como uma pessoa da escola. */
export async function impersonate(target: Impersonation) {
  const me = await realUser();
  if (me?.role !== "admin") redirect("/painel");
  const db = await readDb();
  const ok =
    target.kind === "escola"
      ? db.schools.some((s) => s.id === target.id)
      : db.users.some((u) => u.id === target.id && u.active && u.role !== "admin");
  if (ok) await startImpersonation(target);
  redirect("/painel");
}

/** Versão para o seletor do cabeçalho: `alvo` = `escola:<id>` ou `usuario:<id>`. */
export async function impersonateFromForm(form: FormData) {
  const [kind, id] = String(form.get("alvo") ?? "").split(":");
  if ((kind === "escola" || kind === "usuario") && id) await impersonate({ kind, id });
  redirect("/painel");
}

/** Volta a ser dono, na página da escola que estava vendo. */
export async function stopImpersonating() {
  const user = await currentUser();
  await endImpersonation();
  redirect(user?.impersonator && user.schoolId ? `/painel/escolas/${user.schoolId}` : "/painel");
}
