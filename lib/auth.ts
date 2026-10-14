import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readDb } from "./db";
import type { Db, User } from "./types";

const COOKIE = "st_session";
// "ver como": o administrador navega como uma escola ou um terapeuta (valor assinado `escola:<id>` ou `terapeuta:<id>`)
const AS_COOKIE = "st_as";
const MAX_AGE = 60 * 60 * 12; // 12 horas

function secret() {
  return process.env.SESSION_SECRET || "dev-secret-troque-em-producao";
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function startSession(userId: string) {
  const payload = `${userId}.${Date.now() + MAX_AGE * 1000}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(AS_COOKIE);
}

export type Impersonation = { kind: "escola" | "terapeuta"; id: string };

export async function startImpersonation(target: Impersonation) {
  const value = `${target.kind}:${target.id}`;
  (await cookies()).set(AS_COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function endImpersonation() {
  (await cookies()).delete(AS_COOKIE);
}

export type SessionUser = Omit<User, "passwordHash"> & {
  /** "escola": visão da escola inteira (todos os pacientes e terapeutas dela), só via "ver como". */
  scope?: "escola";
  /** Administrador que está vendo como esta escola ou terapeuta. */
  impersonator?: { id: string; name: string };
};

function strip(user: User): SessionUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safe } = user;
  return safe;
}

/** Quem fez login, ignorando o "ver como" (para a própria conta e para sair do modo). */
export async function realUser(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [userId, expires, sig] = raw.split(".");
  if (!sig || !safeEqual(sig, sign(`${userId}.${expires}`)) || Number(expires) < Date.now()) return null;
  const db = await readDb();
  const user = db.users.find((u) => u.id === userId && u.active);
  return user ? strip(user) : null;
}

/** Usuário efetivo: o próprio, ou a escola/terapeuta que o administrador está vendo. */
export async function currentUser(): Promise<SessionUser | null> {
  const real = await realUser();
  if (real?.role !== "admin") return real;
  const raw = (await cookies()).get(AS_COOKIE)?.value;
  const cut = raw?.lastIndexOf(".") ?? -1;
  if (!raw || cut < 0 || !safeEqual(raw.slice(cut + 1), sign(raw.slice(0, cut)))) return real;
  const [kind, id] = raw.slice(0, cut).split(":");
  const db = await readDb();
  const impersonator = { id: real.id, name: real.name };
  if (kind === "terapeuta") {
    const t = db.users.find((u) => u.id === id && u.active && u.role === "terapeuta");
    return t ? { ...strip(t), impersonator } : real;
  }
  if (kind === "escola") {
    const school = db.schools.find((s) => s.id === id);
    if (!school) return real;
    return { id: `escola:${school.id}`, name: school.name, email: "", role: "terapeuta", schoolId: school.id, active: true, createdAt: school.createdAt, token: "", scope: "escola", impersonator };
  }
  return real;
}

/** Para páginas: redireciona ao login se não houver sessão. */
export async function requirePageUser(opts?: { admin?: boolean }) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (opts?.admin && user.role !== "admin") redirect("/painel");
  return user;
}

/** Para a página e as ações da própria conta: quem fez login, mesmo no "ver como". */
export async function requireRealUser() {
  const user = await realUser();
  if (!user) throw new Error("Sessão expirada. Entre novamente.");
  return user;
}

/** Para ações: lança erro se não houver permissão. */
export async function requireUser(opts?: { admin?: boolean }) {
  const user = await currentUser();
  if (!user) throw new Error("Sessão expirada. Entre novamente.");
  if (opts?.admin && user.role !== "admin") throw new Error("Apenas administradores podem fazer isso.");
  return user;
}

/** Escolhe o terapeuta do paciente: o administrador e a visão de escola; o terapeuta é sempre ele mesmo. */
export function picksTherapist(user: SessionUser) {
  return user.role === "admin" || user.scope === "escola";
}

/**
 * O administrador (equipe da plataforma) vê tudo; a visão de escola, todos os pacientes da escola. O terapeuta não acessa a plataforma: só os testes aplicados
 * na sua escola pelos seus pacientes.
 */
export function canSeePatient(user: SessionUser, patient: { therapistId: string; schoolId: string }) {
  if (user.role === "admin") return true;
  if (user.scope === "escola") return patient.schoolId === user.schoolId;
  return patient.therapistId === user.id && !!user.schoolId && patient.schoolId === user.schoolId;
}

/** Testes que o usuário pode aplicar: todos para o administrador; os da escola (ativa) para o terapeuta. */
export function testsFor(db: Db, user: SessionUser) {
  if (user.role === "admin") return db.tests;
  const school = db.schools.find((s) => s.id === user.schoolId && s.active);
  return school ? db.tests.filter((t) => school.testIds.includes(t.id)) : [];
}
