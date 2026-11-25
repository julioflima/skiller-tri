import { NextResponse, type NextRequest } from "next/server";

// Sessão deslizante: espelha o formato de `lib/auth.ts` (`<userId>.<expira-em-ms>.<hmac>`).
// A cada acesso com sessão válida, o cookie ganha mais MAX_AGE de validade
// (no máximo uma regravação por hora). Quem fica 30 dias sem entrar sai.
const COOKIE = "st_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias — igual a lib/auth.ts
const RENEW_AFTER_MS = 60 * 60 * 1000; // 1 hora

function secret() {
  return process.env.SESSION_SECRET || "dev-secret-troque-em-producao";
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const raw = req.cookies.get(COOKIE)?.value;
  if (!raw) return res;
  const [userId, expires, sig] = raw.split(".");
  const exp = Number(expires);
  if (!userId || !sig || !exp || exp < Date.now()) return res;
  // Renova só se já passou mais de uma hora desde a última gravação.
  if (exp - Date.now() > MAX_AGE * 1000 - RENEW_AFTER_MS) return res;
  if (sig !== (await sign(`${userId}.${expires}`))) return res;
  const payload = `${userId}.${Date.now() + MAX_AGE * 1000}`;
  res.cookies.set(COOKIE, `${payload}.${await sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js)$).*)"],
};
