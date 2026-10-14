import type { SessionUser } from "./auth";
import type { Db, Patient } from "./types";

/**
 * Escolas que aparecem no cadastro de paciente, cada uma com os testes que aplica e a equipe.
 * O administrador vê as ativas; o terapeuta, só a própria. Num paciente existente, os valores atuais sempre aparecem.
 */
export function schoolOptions(db: Db, user: SessionUser, current?: Patient) {
  const schools = db.schools.filter((s) =>
    user.role === "admin" ? s.active || s.id === current?.schoolId : s.id === user.schoolId && (s.active || s.id === current?.schoolId),
  );
  return schools.map((s) => ({
    id: s.id,
    name: s.name,
    tests: db.tests
      .filter((t) => s.testIds.includes(t.id) && (t.active || t.id === current?.testId))
      .map((t) => ({ id: t.id, name: t.name })),
    therapists: db.users
      .filter((u) => u.role === "terapeuta" && u.schoolId === s.id && (u.active || u.id === current?.therapistId))
      .map((u) => ({ id: u.id, name: u.name })),
  }));
}
