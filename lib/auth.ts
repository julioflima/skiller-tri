import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readDb } from "./db";
import type { Db, User } from "./types";

const COOKIE = "st_session";
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
  (await cookies()).delete(COOKIE);
}

export type SessionUser = Omit<User, "passwordHash">;

export async function currentUser(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [userId, expires, sig] = raw.split(".");
  if (!sig || !safeEqual(sig, sign(`${userId}.${expires}`)) || Number(expires) < Date.now()) return null;
  const db = await readDb();
  const user = db.users.find((u) => u.id === userId && u.active);
  if (!user) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safe } = user;
  return safe;
}

type Need = { admin?: boolean; manager?: boolean };

/** `admin`: só o dono; `manager`: dono ou administrador da escola. */
function allowed(user: SessionUser, opts?: Need) {
  if (opts?.admin) return user.role === "admin";
  if (opts?.manager) return managesPatients(user);
  return true;
}

/** Para páginas: redireciona ao login se não houver sessão. */
export async function requirePageUser(opts?: Need) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (!allowed(user, opts)) redirect("/painel");
  return user;
}

/** Para ações: lança erro se não houver permissão. */
export async function requireUser(opts?: Need) {
  const user = await currentUser();
  if (!user) throw new Error("Sessão expirada. Entre novamente.");
  if (!allowed(user, opts)) throw new Error(opts?.admin ? "Apenas o dono da plataforma pode fazer isso." : "Apenas o administrador da escola pode fazer isso.");
  return user;
}

/**
 * Cadastra e edita pacientes, escolhe o terapeuta e gera links: o dono e o administrador da escola.
 * O terapeuta só responde os testes e analisa os próprios pacientes.
 */
export function managesPatients(user: SessionUser) {
  return user.role === "admin" || user.role === "gestor";
}

/** Mexe na equipe de `schoolId` (sem escola = donos): o dono em qualquer uma; o administrador da escola só na própria. */
export function canManageTeam(user: SessionUser, schoolId?: string) {
  if (user.role === "admin") return true;
  return user.role === "gestor" && !!schoolId && user.schoolId === schoolId;
}

/**
 * O dono vê tudo; o administrador da escola, todos os pacientes da escola. O terapeuta não acessa a plataforma:
 * só os testes aplicados na sua escola pelos seus pacientes.
 */
export function canSeePatient(user: SessionUser, patient: { therapistId: string; schoolId: string }) {
  if (user.role === "admin") return true;
  if (user.role === "gestor") return !!user.schoolId && patient.schoolId === user.schoolId;
  return patient.therapistId === user.id && !!user.schoolId && patient.schoolId === user.schoolId;
}

/** Testes que o usuário pode aplicar: todos para o dono; os da escola (ativa) para quem é da escola. */
export function testsFor(db: Db, user: SessionUser) {
  if (user.role === "admin") return db.tests;
  const school = db.schools.find((s) => s.id === user.schoolId && s.active);
  return school ? db.tests.filter((t) => school.testIds.includes(t.id)) : [];
}
