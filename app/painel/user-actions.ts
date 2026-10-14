"use server";

import { requireUser } from "@/lib/auth";
import { newId, newToken, readDb, updateDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { fail, guard } from "@/lib/result";
import type { Db } from "@/lib/types";
import { DEFAULT_SYMBOL_PROMPT, aiCredentials, aiErrorMessage, generateScaleSymbolsWithAI, svgDataUri } from "@/lib/symbols";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkPassword(pw: string) {
  if (pw.length < 8) fail("A senha precisa ter pelo menos 8 caracteres.");
}

/** Terapeuta precisa de uma escola existente; administrador é da plataforma e fica sem escola. */
function schoolFor(db: Db, role: "admin" | "terapeuta", schoolId?: string) {
  if (role === "admin") return undefined;
  if (!db.schools.some((s) => s.id === schoolId)) fail("Escolha a escola do terapeuta.");
  return schoolId;
}

export async function createUser(input: { name: string; email: string; password: string; role: "admin" | "terapeuta"; schoolId?: string }) {
  return guard(async () => {
    await requireUser({ admin: true });
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (!name) fail("Informe o nome.");
    if (!EMAIL.test(email)) fail("E-mail inválido.");
    checkPassword(input.password);
    const passwordHash = await hashPassword(input.password);
    await updateDb((db) => {
      if (db.users.some((u) => u.email === email)) fail("Já existe alguém com este e-mail.");
      const role = input.role === "admin" ? "admin" : "terapeuta";
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
    return input.role === "admin" ? "Administrador cadastrado." : "Terapeuta cadastrado.";
  });
}

export async function updateUser(id: string, input: { name: string; email: string; role: "admin" | "terapeuta"; schoolId?: string; active: boolean }) {
  return guard(async () => {
    const me = await requireUser({ admin: true });
    const email = input.email.trim().toLowerCase();
    if (!input.name.trim()) fail("Informe o nome.");
    if (!EMAIL.test(email)) fail("E-mail inválido.");
    await updateDb((db) => {
      const u = db.users.find((x) => x.id === id);
      if (!u) fail("Usuário não encontrado.");
      if (db.users.some((x) => x.email === email && x.id !== id)) fail("Já existe alguém com este e-mail.");
      if (u.id === me.id && (!input.active || input.role !== "admin")) fail("Você não pode desativar nem rebaixar a própria conta.");
      const role = input.role === "admin" ? "admin" : "terapeuta";
      const schoolId = schoolFor(db, role, input.schoolId);
      if (schoolId !== u.schoolId) {
        const n = db.patients.filter((p) => p.therapistId === u.id && p.schoolId === u.schoolId && !p.archived).length;
        if (n && u.role === "terapeuta") fail(`${u.name} acompanha ${n} paciente(s) na escola atual. Passe-os a outro terapeuta antes de trocar de escola.`);
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
    await requireUser({ admin: true });
    checkPassword(password);
    const passwordHash = await hashPassword(password);
    await updateDb((db) => {
      const u = db.users.find((x) => x.id === id);
      if (!u) fail("Usuário não encontrado.");
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

export async function saveSettings(input: { apiKey: string; clearKey: boolean; workspaceId: string; model: string }) {
  return guard(async () => {
    await requireUser({ admin: true });
    await updateDb((db) => {
      const s = db.settings;
      if (input.clearKey) delete s.anthropicApiKey;
      else if (input.apiKey.trim()) s.anthropicApiKey = input.apiKey.trim();
      if (input.workspaceId.trim()) s.anthropicWorkspaceId = input.workspaceId.trim();
      else delete s.anthropicWorkspaceId;
      s.model = input.model.trim() || s.model;
    });
    return "Configurações salvas.";
  });
}

export async function testApiKey() {
  return guard<{ srcs: string[] }>(async () => {
    await requireUser({ admin: true });
    const db = await readDb();
    const { apiKey, workspaceId } = aiCredentials(db.settings);
    if (!apiKey) fail("Nenhuma chave cadastrada.");
    let svgs: string[];
    try {
      svgs = await generateScaleSymbolsWithAI({
        apiKey,
        workspaceId,
        model: db.settings.model,
        instructions: DEFAULT_SYMBOL_PROMPT,
        scaleName: "Teste de configuração",
        options: ["Nunca", "Às vezes", "Sempre"].map((label) => ({ label, description: "" })),
      });
    } catch (e) {
      fail(aiErrorMessage(e));
    }
    return { message: "Chave funcionando.", data: { srcs: svgs.map(svgDataUri) } };
  });
}
