"use server";

import { canManageTeam, requireUser } from "@/lib/auth";
import { isSchoolRole, ROLE_LABEL, type Role } from "@/lib/roles";
import { newId, newToken, readDb, updateDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { fail, guard } from "@/lib/result";
import type { Db } from "@/lib/types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkPassword(pw: string) {
  if (pw.length < 8) fail("A senha precisa ter pelo menos 8 caracteres.");
}

/** Terapeuta e administrador da escola precisam de uma escola existente; o dono é da plataforma e fica sem escola. */
function schoolFor(db: Db, role: Role, schoolId?: string) {
  if (role === "admin") return undefined;
  if (!db.schools.some((s) => s.id === schoolId)) fail("Escolha a escola.");
  return schoolId;
}

const roleOf = (role: string): Role => (role === "admin" ? "admin" : isSchoolRole(role) ? role : "terapeuta");

/** O administrador da escola só cadastra e edita pessoas da própria escola, e nunca donos. */
function checkTeamAccess(me: Parameters<typeof canManageTeam>[0], role: Role, schoolId?: string) {
  if (role === "admin" ? me.role !== "admin" : !canManageTeam(me, schoolId)) fail("Você não pode mexer na equipe desta escola.");
}

export async function createUser(input: { name: string; email: string; password: string; role: Role; schoolId?: string }) {
  return guard(async () => {
    const me = await requireUser({ manager: true });
    checkTeamAccess(me, roleOf(input.role), input.schoolId);
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (!name) fail("Informe o nome.");
    if (!EMAIL.test(email)) fail("E-mail inválido.");
    checkPassword(input.password);
    const passwordHash = await hashPassword(input.password);
    await updateDb((db) => {
      if (db.users.some((u) => u.email === email)) fail("Já existe alguém com este e-mail.");
      const role = roleOf(input.role);
      db.users.push({
        id: newId(),
        name,
        email,
        passwordHash,
        role,
        schoolId: schoolFor(db, role, input.schoolId),
        active: true,
        createdAt: new Date().toISOString(),
        token: newToken(),
      });
    });
    const label = ROLE_LABEL[roleOf(input.role)];
    return `${label[0].toUpperCase()}${label.slice(1)} cadastrado.`;
  });
}

export async function updateUser(id: string, input: { name: string; email: string; role: Role; schoolId?: string; active: boolean }) {
  return guard(async () => {
    const me = await requireUser({ manager: true });
    const email = input.email.trim().toLowerCase();
    if (!input.name.trim()) fail("Informe o nome.");
    if (!EMAIL.test(email)) fail("E-mail inválido.");
    await updateDb((db) => {
      const u = db.users.find((x) => x.id === id);
      if (!u) fail("Usuário não encontrado.");
      if (db.users.some((x) => x.email === email && x.id !== id)) fail("Já existe alguém com este e-mail.");
      const role = roleOf(input.role);
      // dono continua dono; pessoas da escola alternam entre terapeuta e administrador da escola
      if ((u.role === "admin") !== (role === "admin")) fail("O dono é da plataforma: não vira papel de escola, e vice-versa.");
      checkTeamAccess(me, u.role, u.schoolId);
      checkTeamAccess(me, role, input.schoolId);
      if (u.id === me.id && (!input.active || role !== u.role)) fail("Você não pode desativar nem mudar o papel da própria conta.");
      const schoolId = schoolFor(db, role, input.schoolId);
      if (u.role === "terapeuta" && role !== "terapeuta") {
        const n = db.patients.filter((p) => p.therapistId === u.id && !p.archived).length;
        if (n) fail(`${u.name} acompanha ${n} paciente(s). Só terapeuta acompanha paciente: passe-os a outro terapeuta antes.`);
      }
      if (schoolId !== u.schoolId) {
        const n = db.patients.filter((p) => p.therapistId === u.id && p.schoolId === u.schoolId && !p.archived).length;
        if (n) fail(`${u.name} acompanha ${n} paciente(s) na escola atual. Passe-os a outro terapeuta antes de trocar de escola.`);
      }
      u.name = input.name.trim();
      u.email = email;
      u.role = role;
      if (schoolId) u.schoolId = schoolId;
      else delete u.schoolId;
      u.active = input.active;
    });
    return "Dados salvos.";
  });
}

export async function resetUserPassword(id: string, password: string) {
  return guard(async () => {
    const me = await requireUser({ manager: true });
    checkPassword(password);
    const passwordHash = await hashPassword(password);
    await updateDb((db) => {
      const u = db.users.find((x) => x.id === id);
      if (!u) fail("Usuário não encontrado.");
      checkTeamAccess(me, u.role, u.schoolId);
      u.passwordHash = passwordHash;
    });
    return "Senha redefinida.";
  });
}

export async function changeOwnName(name: string) {
  return guard(async () => {
    const me = await requireUser();
    const clean = name.trim();
    if (!clean) fail("Informe o nome.");
    await updateDb((db) => {
      const u = db.users.find((x) => x.id === me.id);
      if (u) u.name = clean;
    });
    return "Nome alterado.";
  });
}

export async function changeOwnPassword(current: string, next: string) {
  return guard(async () => {
    const me = await requireUser();
    checkPassword(next);
    const db = await readDb();
    const u = db.users.find((x) => x.id === me.id);
    if (!u || !(await verifyPassword(current, u.passwordHash))) fail("Senha atual incorreta.");
    const passwordHash = await hashPassword(next);
    await updateDb((db) => {
      const target = db.users.find((x) => x.id === me.id);
      if (target) target.passwordHash = passwordHash;
    });
    return "Senha alterada.";
  });
}

export async function regenerateTherapistLink() {
  return guard(async () => {
    const me = await requireUser();
    await updateDb((db) => {
      const u = db.users.find((x) => x.id === me.id);
      if (u) u.token = newToken();
    });
    return "Novo link gerado.";
  });
}
