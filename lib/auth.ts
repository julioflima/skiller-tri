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

/** Para páginas: redireciona ao login se não houver sessão. */
export async function requirePageUser(opts?: { admin?: boolean }) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (opts?.admin && user.role !== "admin") redirect("/painel");
  return user;
}

/** Para ações: lança erro se não houver permissão. */
export async function requireUser(opts?: { admin?: boolean }) {
  const user = await currentUser();
  if (!user) throw new Error("Sessão expirada. Entre novamente.");
  if (opts?.admin && user.role !== "admin") throw new Error("Apenas administradores podem fazer isso.");
  return user;
}

/**
 * O administrador (equipe da plataforma) vê tudo. O terapeuta não acessa a plataforma: só os testes aplicados
 * na sua escola pelos seus pacientes.
 */
export function canSeePatient(user: SessionUser, patient: { therapistId: string; schoolId: string }) {
  if (user.role === "admin") return true;
  return patient.therapistId === user.id && !!user.schoolId && patient.schoolId === user.schoolId;
}

/** Testes que o usuário pode aplicar: todos para o administrador; os da escola (ativa) para o terapeuta. */
export function testsFor(db: Db, user: SessionUser) {
  if (user.role === "admin") return db.tests;
  const school = db.schools.find((s) => s.id === user.schoolId && s.active);
  return school ? db.tests.filter((t) => school.testIds.includes(t.id)) : [];
}
