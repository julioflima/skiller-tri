"use server";

import { requireUser } from "@/lib/auth";
import { newId, updateDb } from "@/lib/db";
import { fail, guard } from "@/lib/result";

export type SchoolInput = { name: string; testIds: string[]; active: boolean };

export async function createSchool(name: string) {
  return guard<{ id: string }>(async () => {
    await requireUser({ admin: true });
    const clean = name.trim();
    if (!clean) fail("Informe o nome da escola.");
    const id = newId();
    await updateDb((db) => {
      if (db.schools.some((s) => s.name.toLowerCase() === clean.toLowerCase())) fail("Já existe uma escola com esse nome.");
      db.schools.push({ id, name: clean, testIds: [], active: true, createdAt: new Date().toISOString() });
    });
    return { message: "Escola criada. Escolha os testes que ela aplica e cadastre a equipe.", data: { id } };
  });
}

export async function updateSchool(id: string, input: SchoolInput) {
  return guard(async () => {
    await requireUser({ admin: true });
    const name = input.name.trim();
    if (!name) fail("Informe o nome da escola.");
    await updateDb((db) => {
      const school = db.schools.find((s) => s.id === id);
      if (!school) fail("Escola não encontrada.");
      if (db.schools.some((s) => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) fail("Já existe uma escola com esse nome.");
      const testIds = input.testIds.filter((t) => db.tests.some((x) => x.id === t && !x.deletedAt));
      // um teste em uso por pacientes da escola não pode sair dela
      for (const removed of school.testIds.filter((t) => !testIds.includes(t))) {
        const n = db.patients.filter((p) => p.schoolId === id && p.testId === removed && !p.archived).length;
        if (n) fail(`${db.tests.find((t) => t.id === removed)?.name ?? "Um teste"} está em uso por ${n} paciente(s) desta escola.`);
      }
      school.name = name;
      school.testIds = testIds;
      school.active = input.active;
    });
    return "Escola salva.";
  });
}
