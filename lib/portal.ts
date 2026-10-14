import { timingSafeEqual } from "node:crypto";
import { GUARDIAN_LABEL } from "./forms";
import type { Db, Form } from "./types";

export type PortalIdentity = {
  name: string;
  roleLabel: string;
  /** Quais formulários este link pode ver e responder. */
  owns: (f: Form) => boolean;
};

const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Descobre de quem é o link. Devolve null se o token não existir. */
export function resolveToken(db: Db, token: string): PortalIdentity | null {
  if (!token || token.length < 16) return null;
  for (const p of db.patients) {
    if (p.archived) continue;
    if (eq(p.token, token)) {
      return { name: p.name, roleLabel: "Paciente", owns: (f) => f.patientId === p.id && f.respondent.role === "paciente" };
    }
    if (eq(p.therapistToken, token)) {
      const t = db.users.find((u) => u.id === p.therapistId);
      return { name: t?.name ?? "Terapeuta", roleLabel: `Terapeuta de ${p.name}`, owns: (f) => f.patientId === p.id && f.respondent.role === "terapeuta" };
    }
    for (const g of p.guardians) {
      if (eq(g.token, token)) {
        return {
          name: g.name,
          roleLabel: `${GUARDIAN_LABEL[g.kind]} de ${p.name}`,
          owns: (f) => f.patientId === p.id && f.respondent.role === "responsavel" && f.respondent.guardianId === g.id,
        };
      }
    }
  }
  for (const u of db.users) {
    if (u.active && eq(u.token, token)) {
      const mine = new Set(db.patients.filter((p) => p.therapistId === u.id && !p.archived).map((p) => p.id));
      return { name: u.name, roleLabel: "Terapeuta", owns: (f) => mine.has(f.patientId) && f.respondent.role === "terapeuta" };
    }
  }
  return null;
}
