import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import seed from "./seed.json";
import { hashPassword } from "./password";
import type { Db, Test, TestLanding, User } from "./types";

const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), "data", "db.json");

export const newId = () => randomUUID().replace(/-/g, "").slice(0, 12);
/** Token secreto usado nos links de resposta. */
export const newToken = () => randomBytes(18).toString("base64url");

/** Teste padrão, montado a partir da planilha "12 habilidades fora da caixa". */
export function buildDefaultTest(): Test {
  const scaleId = newId();
  const categories: Test["categories"] = [];
  const questions: Test["questions"] = [];
  seed.skills.forEach((s, i) => {
    const categoryId = newId();
    categories.push({ id: categoryId, name: s.name, description: "", order: i + 1 });
    s.questions.forEach((text, j) => {
      questions.push({
        id: newId(),
        text,
        categoryId,
        scaleId,
        targets: ["paciente", "responsavel", "terapeuta"],
        perspectives: ["si", "outro"],
        weight: 1,
        active: true,
        order: j + 1,
      });
    });
  });
  return {
    id: newId(),
    name: "12 habilidades fora da caixa",
    description: "Avaliação de habilidades socioemocionais em 12 classificações.",
    active: true,
    createdAt: new Date().toISOString(),
    scales: [
      {
        id: scaleId,
        name: "Demonstração (0–4)",
        options: seed.scale.map((p) => ({ id: newId(), label: p.label, description: p.description, weight: p.value })),
      },
    ],
    categories,
    questions,
    stages: [
      {
        id: newId(),
        name: "Início do tratamento",
        kind: "inicial",
        rules: [
          { id: newId(), role: "paciente", count: 30, about: "si", categoryIds: [], instruction: "Pense em você mesmo ao responder." },
          {
            id: newId(),
            role: "responsavel",
            count: 60,
            about: "paciente",
            categoryIds: [],
            instruction: "Pense em {paciente} nas últimas semanas ao responder.",
          },
        ],
      },
      {
        id: newId(),
        name: "Sessão",
        kind: "sessao",
        rules: [
          { id: newId(), role: "paciente", count: 5, about: "si", categoryIds: [], instruction: "Pense em você mesmo ao responder." },
          {
            id: newId(),
            role: "paciente",
            count: 5,
            about: "outro",
            categoryIds: [],
            instruction: "Agora pense em outra pessoa com quem você conviveu nesta semana.",
          },
          {
            id: newId(),
            role: "terapeuta",
            count: 10,
            about: "paciente",
            categoryIds: [],
            instruction: "Avalie {paciente} considerando a sessão de hoje.",
          },
        ],
      },
    ],
  };
}

async function adminUser(email: string, password: string): Promise<User> {
  return {
    id: newId(),
    name: "Administrador",
    email: email.trim().toLowerCase(),
    passwordHash: await hashPassword(password),
    role: "admin",
    active: true,
    createdAt: new Date().toISOString(),
    token: newToken(),
  };
}

/**
 * Garante que exista a conta de ADMIN_EMAIL/ADMIN_PASSWORD (para quando o banco foi criado antes delas ou recriado).
 * Só cria a conta que falta; uma conta existente com esse e-mail nunca é alterada.
 */
export async function ensureEnvAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  if ((await readDb()).users.some((u) => u.email === email)) return;
  const user = await adminUser(email, password);
  await updateDb((db) => {
    if (!db.users.some((u) => u.email === email)) db.users.push(user);
  });
}

async function buildInitialDb(): Promise<Db> {
  return {
    version: 2,
    settings: { model: "claude-opus-5-5" },
    schools: [],
    users: [await adminUser(process.env.ADMIN_EMAIL || "", process.env.ADMIN_PASSWORD || "admin")],
    invites: [],
    tests: [buildDefaultTest()],
    patients: [],
    sessions: [],
    forms: [],
  };
}

// --- Armazenamento -------------------------------------------------------------------------
// Com DATABASE_URL (Vercel → Prisma Postgres) os dados ficam no Postgres (lib/db-prisma.ts).
// Sem ela, num arquivo JSON local, para o `npm run dev` funcionar sem banco.

const usePostgres = () => Boolean(process.env.DATABASE_URL);

/** Db com as listas vazias: diz ao lib/db-prisma.ts quais chaves são coleções. */
const EMPTY: Db = {
  version: 2,
  settings: { model: "claude-opus-5-5" },
  schools: [],
  users: [],
  invites: [],
  tests: [],
  patients: [],
  sessions: [],
  forms: [],
};

function checkVersion(db: Db) {
  if (db.version !== 2) throw new Error(`Banco no formato v${db.version ?? 1}; esperado v2.`);
  return migrate(db);
}

// --- Escolas e landing dos testes (dados anteriores a elas) ----------------------------------

/** Id fixo: a migração roda a cada leitura até ser gravada, e precisa dar sempre o mesmo resultado. */
export const DEFAULT_SCHOOL_ID = "escola-padrao";

/** Conteúdo da antiga página inicial, que passou a ser a landing do teste das 12 habilidades. */
const KAY12_LANDING: TestLanding = {
  slug: "kay12",
  published: true,
  slogan: "habilidades fora da caixa",
  headline: "Ver cada adolescente por inteiro, e por todos os ângulos.",
  lead:
    "O KAY12 acompanha as 12 habilidades socioemocionais de adolescentes ouvindo quem convive com eles: " +
    "o próprio jovem, a família e o terapeuta. Um retrato 360 que vira conversa, plano e evolução.",
  skillsTitle: "12 habilidades para a vida",
  skillsLead: "Da relação consigo à relação com o mundo, cada uma medida com perguntas próprias.",
  logoUrl: "/brand/wordmark.svg",
  heroImageUrl: "/brand/mascote.webp",
  contactUrl: "",
};

/**
 * Coloca na escola padrão (com todos os testes) os terapeutas e pacientes cadastrados antes das escolas,
 * e dá ao teste das 12 habilidades a landing que antes era a página inicial. Só acrescenta campos.
 */
function migrate(db: Db) {
  db.schools ??= [];
  db.invites ??= [];
  const orphans = db.users.some((u) => u.role === "terapeuta" && !u.schoolId) || db.patients.some((p) => !p.schoolId);
  if (orphans && !db.schools.some((s) => s.id === DEFAULT_SCHOOL_ID)) {
    db.schools.push({
      id: DEFAULT_SCHOOL_ID,
      name: "Fora da Caixa",
      testIds: db.tests.map((t) => t.id),
      active: true,
      createdAt: "2026-10-14T00:00:00.000Z",
    });
  }
  for (const u of db.users) if (u.role === "terapeuta" && !u.schoolId) u.schoolId = DEFAULT_SCHOOL_ID;
  const schoolOf = new Map(db.users.map((u) => [u.id, u.schoolId]));
  for (const p of db.patients) p.schoolId ??= schoolOf.get(p.therapistId) ?? DEFAULT_SCHOOL_ID;
  if (!db.tests.some((t) => t.landing?.slug === KAY12_LANDING.slug)) {
    const kay = db.tests.find((t) => !t.landing && t.name === "12 habilidades fora da caixa");
    if (kay) kay.landing = { ...KAY12_LANDING };
  }
  return db;
}

// Estado compartilhado entre as instâncias do módulo no mesmo processo (o Next pode carregar o módulo mais de uma vez).
const g = globalThis as unknown as { __skillerQueue?: Promise<unknown> };
g.__skillerQueue ??= Promise.resolve();

/** Enfileira operações no arquivo JSON para que leituras e escritas nunca se sobreponham. */
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = g.__skillerQueue!.then(fn);
  g.__skillerQueue = run.catch(() => undefined);
  return run;
}

async function load(): Promise<Db> {
  let raw: string;
  try {
    raw = await fs.readFile(DATA_FILE, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    const db = await buildInitialDb();
    await persist(db);
    return db;
  }
  const db = JSON.parse(raw) as Db;
  if (db.version !== 2) {
    // formato da primeira versão do app: guarda uma cópia e recomeça
    await fs.rename(DATA_FILE, `${DATA_FILE}.v${db.version ?? 1}.bak`);
    const fresh = await buildInitialDb();
    await persist(fresh);
    return fresh;
  }
  return migrate(db);
}

async function persist(db: Db) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.${newId()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DATA_FILE);
}

export async function readDb(): Promise<Db> {
  if (!usePostgres()) return enqueue(load);
  const { readDocs } = await import("./db-prisma");
  return checkVersion(await readDocs(EMPTY, buildInitialDb));
}

/** Executa uma alteração atômica no banco e devolve o resultado da função. */
export async function updateDb<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  if (usePostgres()) {
    const { mutateDocs } = await import("./db-prisma");
    return mutateDocs(EMPTY, buildInitialDb, (db) => fn(checkVersion(db)));
  }
  return enqueue(async () => {
    const db = await load();
    const result = await fn(db);
    await persist(db);
    return result;
  });
}
