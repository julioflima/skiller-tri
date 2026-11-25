import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readDb } from "./db";
import type { Db, User } from "./types";

const COOKIE = "st_session";
/** Validade da sessão sem uso. O `middleware.ts` renova o cookie a cada acesso (sessão deslizante). */
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

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

/** Mexe na equipe (terapeutas e administradores da escola): o dono e o administrador da escola. Donos, só o dono. */
export function canManageTeam(user: SessionUser) {
  return user.role === "admin" || user.role === "gestor";
}

/** O dono e o administrador da escola veem todos os pacientes; o terapeuta, só os próprios. */
export function canSeePatient(user: SessionUser, patient: { therapistId: string }) {
  if (user.role === "admin" || user.role === "gestor") return true;
  return patient.therapistId === user.id;
}

/** Testes que podem ser aplicados: todos os que não foram excluídos. */
export function testsFor(db: Db) {
  return db.tests.filter((t) => !t.deletedAt);
}
