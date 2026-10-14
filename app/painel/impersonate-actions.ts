"use server";

import { redirect } from "next/navigation";
import { currentUser, endImpersonation, realUser, startImpersonation, type Impersonation } from "@/lib/auth";
import { readDb } from "@/lib/db";

/** O administrador passa a ver o painel como uma escola ou um terapeuta dela. */
export async function impersonate(target: Impersonation) {
  const me = await realUser();
  if (me?.role !== "admin") redirect("/painel");
  const db = await readDb();
  const ok =
    target.kind === "escola"
      ? db.schools.some((s) => s.id === target.id)
      : db.users.some((u) => u.id === target.id && u.active && u.role === "terapeuta");
  if (ok) await startImpersonation(target);
  redirect("/painel");
}

/** Volta a ser administrador, na página da escola que estava vendo. */
export async function stopImpersonating() {
  const user = await currentUser();
  await endImpersonation();
  redirect(user?.impersonator && user.schoolId ? `/painel/escolas/${user.schoolId}` : "/painel");
}
