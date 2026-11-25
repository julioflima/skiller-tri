import type { Db, Patient } from "./types";

/**
 * A plataforma tem uma escola só, a Fora da Caixa. O id fica gravado em pessoas, convites e pacientes
 * (dados de quando havia várias escolas), mas nada mais é filtrado ou escolhido por escola.
 */
export const SCHOOL_ID = "escola-padrao";
export const SCHOOL_NAME = "Fora da Caixa";

/** Testes e terapeutas para o cadastro de paciente. Num paciente existente, os valores atuais sempre aparecem. */
export function patientOptions(db: Db, current?: Patient) {
  return {
    tests: db.tests.filter((t) => !t.deletedAt && (t.active || t.id === current?.testId)).map((t) => ({ id: t.id, name: t.name })),
    therapists: db.users
      .filter((u) => u.role === "terapeuta" && (u.active || u.id === current?.therapistId))
      .map((u) => ({ id: u.id, name: u.name })),
  };
}
