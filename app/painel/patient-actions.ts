"use server";

import { canSeePatient, managesPatients, requireUser } from "@/lib/auth";
import { newId, newToken, updateDb } from "@/lib/db";
import { buildForms, ensureInitialForms } from "@/lib/forms";
import { fail, guard } from "@/lib/result";
import type { Db, Guardian, GuardianKind, Patient } from "@/lib/types";

export type GuardianInput = { id?: string; kind: GuardianKind; name: string; email?: string; phone?: string };
export type PatientInput = {
  name: string;
  birthDate?: string;
  email?: string;
  testId: string;
  /** Só o administrador escolhe; o terapeuta cadastra sempre na própria escola. */
  schoolId?: string;
  therapistId?: string;
  guardians: GuardianInput[];
};

function clean(input: PatientInput) {
  const name = input.name?.trim();
  if (!name || name.length < 2) fail("Informe o nome do paciente.");
  const guardians = (input.guardians ?? []).map((g) => {
    if (!g.name?.trim()) fail("Informe o nome de cada responsável.");
    if (g.kind !== "mae" && g.kind !== "pai") fail("Escolha mãe ou pai para cada responsável.");
    return { ...g, name: g.name.trim(), email: g.email?.trim() || undefined, phone: g.phone?.trim() || undefined };
  });
  return { ...input, name, birthDate: input.birthDate || undefined, email: input.email?.trim() || undefined, guardians };
}

type SessionUser = Awaited<ReturnType<typeof requireUser>>;

function getPatient(db: Db, user: SessionUser, id: string) {
  const p = db.patients.find((x) => x.id === id);
  if (!p || !canSeePatient(user, p)) fail("Paciente não encontrado.");
  return p;
}

/** Escola, terapeuta e teste precisam combinar: o terapeuta é da escola e a escola aplica o teste. */
function placement(db: Db, user: SessionUser, data: PatientInput, current?: Patient) {
  const schoolId = user.role === "admin" ? (data.schoolId ?? current?.schoolId) : user.schoolId;
  const school = db.schools.find((s) => s.id === schoolId);
  if (!school || (!school.active && school.id !== current?.schoolId)) fail("Escolha uma escola ativa.");
  const therapistId = managesPatients(user) ? (data.therapistId ?? current?.therapistId) : (current?.therapistId ?? user.id);
  // administrador não é terapeuta: o responsável é sempre um terapeuta ativo da escola
  const therapist = db.users.find((u) => u.id === therapistId && u.active && u.role === "terapeuta");
  if (!therapist || therapist.schoolId !== school.id) fail(`Escolha um terapeuta da escola ${school.name}.`);
  const testId = data.testId || current?.testId;
  const test = db.tests.find((t) => t.id === testId && (t.active || t.id === current?.testId));
  if (!test || !school.testIds.includes(test.id)) fail(`O teste escolhido não é aplicado na escola ${school.name}.`);
  return { school, therapist, test };
}

function hasAnswers(db: Db, patientId: string, pred: (f: Db["forms"][number]) => boolean = () => true) {
  return db.forms.some((f) => f.patientId === patientId && pred(f) && Object.keys(f.answers).length > 0);
}

export async function createPatient(input: PatientInput) {
  return guard<{ id: string }>(async () => {
    const user = await requireUser({ manager: true });
    const data = clean(input);
    const id = await updateDb((db) => {
      if (user.role !== "admin" && !user.schoolId) fail("Sua conta não está ligada a uma escola.");
      const { school, therapist, test } = placement(db, user, data);
      const patient: Patient = {
        id: newId(),
        name: data.name,
        birthDate: data.birthDate,
        email: data.email,
        testId: test.id,
        schoolId: school.id,
        therapistId: therapist.id,
        guardians: data.guardians.map((g) => ({ id: newId(), kind: g.kind, name: g.name, email: g.email, phone: g.phone, token: newToken() })),
        token: newToken(),
        therapistToken: newToken(),
        createdAt: new Date().toISOString(),
      };
      db.patients.push(patient);
      ensureInitialForms(db, patient);
      return patient.id;
    });
    return { message: "Paciente cadastrado.", data: { id } };
  });
}

export async function updatePatient(id: string, input: PatientInput) {
  return guard(async () => {
    const user = await requireUser({ manager: true });
    const data = clean(input);
    return updateDb((db) => {
      const p = getPatient(db, user, id);
      p.name = data.name;
      p.birthDate = data.birthDate;
      p.email = data.email;

      const { school, therapist, test } = placement(db, user, data, p);
      p.schoolId = school.id;
      p.therapistId = therapist.id;

      if (test.id !== p.testId) {
        if (hasAnswers(db, p.id)) fail("O teste não pode ser trocado depois que alguém já respondeu.");
        p.testId = test.id;
        db.forms = db.forms.filter((f) => f.patientId !== p.id);
        db.sessions = db.sessions.filter((s) => s.patientId !== p.id);
      }

      const keep = new Set(data.guardians.filter((g) => g.id).map((g) => g.id));
      for (const removed of p.guardians.filter((g) => !keep.has(g.id))) {
        if (hasAnswers(db, p.id, (f) => f.respondent.guardianId === removed.id)) {
          fail(`${removed.name} já respondeu formulários e não pode ser removido(a).`);
        }
        db.forms = db.forms.filter((f) => !(f.patientId === p.id && f.respondent.guardianId === removed.id));
      }
      p.guardians = data.guardians.map((g): Guardian => {
        const existing = p.guardians.find((x) => x.id === g.id);
        return { id: existing?.id ?? newId(), token: existing?.token ?? newToken(), kind: g.kind, name: g.name, email: g.email, phone: g.phone };
      });

      const created = ensureInitialForms(db, p);
      return created ? `Dados salvos. ${created} formulário(s) da etapa inicial criado(s).` : "Dados salvos.";
    });
  });
}

export async function setArchived(id: string, archived: boolean) {
  return guard(async () => {
    const user = await requireUser({ manager: true });
    await updateDb((db) => {
      getPatient(db, user, id).archived = archived;
    });
    return archived ? "Paciente arquivado." : "Paciente reativado.";
  });
}

export async function savePatientNotes(id: string, notes: string) {
  return guard(async () => {
    const user = await requireUser();
    await updateDb((db) => {
      getPatient(db, user, id).notes = notes;
    });
  });
}

/** Gera um novo link (o anterior deixa de funcionar). who = "paciente" | "terapeuta" | id do responsável */
export async function regenerateLink(id: string, who: string) {
  return guard(async () => {
    const user = await requireUser();
    await updateDb((db) => {
      const p = getPatient(db, user, id);
      // o terapeuta só renova o próprio link; os de paciente e família são do administrador da escola
      if (who !== "terapeuta" && !managesPatients(user)) fail("Apenas o administrador da escola pode fazer isso.");
      if (who === "paciente") p.token = newToken();
      else if (who === "terapeuta") p.therapistToken = newToken();
      else {
        const g = p.guardians.find((x) => x.id === who);
        if (!g) fail("Responsável não encontrado.");
        g.token = newToken();
      }
    });
    return "Novo link gerado. O link anterior não funciona mais.";
  });
}

export async function createSession(patientId: string, date: string, notes: string) {
  return guard(async () => {
    const user = await requireUser();
    return updateDb((db) => {
      const p = getPatient(db, user, patientId);
      if (p.archived) fail("Paciente arquivado.");
      const test = db.tests.find((t) => t.id === p.testId);
      if (!test) fail("Teste do paciente não encontrado.");
      const stages = test.stages.filter((s) => s.kind === "sessao");
      if (!stages.length) fail("O teste deste paciente não tem etapa de sessão configurada.");
      const number = Math.max(0, ...db.sessions.filter((s) => s.patientId === p.id).map((s) => s.number)) + 1;
      db.sessions.push({
        id: newId(),
        patientId: p.id,
        number,
        date: date || new Date().toISOString().slice(0, 10),
        notes: notes.trim() || undefined,
        createdAt: new Date().toISOString(),
      });
      const forms = stages.flatMap((s) => buildForms(db, p, test, s, number));
      db.forms.push(...forms);
      return `Sessão ${number} registrada com ${forms.length} formulário(s).`;
    });
  });
}

export async function updateSessionNotes(sessionId: string, notes: string) {
  return guard(async () => {
    const user = await requireUser();
    await updateDb((db) => {
      const s = db.sessions.find((x) => x.id === sessionId);
      if (!s) fail("Sessão não encontrada.");
      getPatient(db, user, s.patientId);
      s.notes = notes.trim() || undefined;
    });
    return "Anotações salvas.";
  });
}

export async function deleteSession(sessionId: string) {
  return guard(async () => {
    const user = await requireUser();
    await updateDb((db) => {
      const s = db.sessions.find((x) => x.id === sessionId);
      if (!s) fail("Sessão não encontrada.");
      getPatient(db, user, s.patientId);
      if (hasAnswers(db, s.patientId, (f) => f.sessionNumber === s.number)) fail("Esta sessão já tem respostas e não pode ser excluída.");
      db.forms = db.forms.filter((f) => !(f.patientId === s.patientId && f.sessionNumber === s.number));
      db.sessions = db.sessions.filter((x) => x.id !== s.id);
    });
    return "Sessão excluída.";
  });
}

/** Sorteia de novo as perguntas de um formulário ainda não iniciado. */
export async function redrawForm(formId: string) {
  return guard(async () => {
    const user = await requireUser();
    await updateDb((db) => {
      const f = db.forms.find((x) => x.id === formId);
      if (!f) fail("Formulário não encontrado.");
      const p = getPatient(db, user, f.patientId);
      if (Object.keys(f.answers).length) fail("Este formulário já tem respostas.");
      const test = db.tests.find((t) => t.id === f.testId);
      const stage = test?.stages.find((s) => s.id === f.stageId);
      if (!test || !stage) fail("A etapa deste formulário não existe mais no teste.");
      db.forms = db.forms.filter((x) => x.id !== f.id);
      const [fresh] = buildForms(db, p, test, stage, f.sessionNumber, [f.respondent]);
      if (fresh) db.forms.push({ ...fresh, id: f.id, createdAt: f.createdAt });
    });
    return "Perguntas sorteadas novamente.";
  });
}

