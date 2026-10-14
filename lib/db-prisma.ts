import "server-only";
import type { Prisma } from "./generated/prisma/client";
import { prisma } from "./prisma";

/**
 * Armazenamento do Db no Postgres, independente do formato de lib/types.ts:
 * - cada chave do Db cujo valor é uma lista de objetos com `id` vira uma coleção (uma linha por item);
 * - as demais chaves (version, settings…) ficam na coleção "_meta", com a chave como id.
 * Feito para o lib/db.ts manter readDb()/updateDb() trocando só load()/persist().
 */
type Doc = Record<string, unknown>;
type Tx = Prisma.TransactionClient;

const META = "_meta";
/** Chave fixa do advisory lock que serializa os updateDb() entre todas as instâncias da Vercel. */
const LOCK_KEY = 74_201_901;

function isCollection(v: unknown): v is { id: string }[] {
  return Array.isArray(v) && v.every((x) => x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string");
}

function toRows(db: Doc) {
  const rows = new Map<string, { collection: string; id: string; data: unknown }>();
  for (const [key, value] of Object.entries(db)) {
    if (isCollection(value)) for (const item of value) rows.set(`${key}\u0000${item.id}`, { collection: key, id: item.id, data: item });
    else rows.set(`${META}\u0000${key}`, { collection: META, id: key, data: value });
  }
  return rows;
}

async function load<T extends Doc>(client: Tx | typeof prisma, empty: T): Promise<T | null> {
  const rows = await client.record.findMany({ orderBy: [{ collection: "asc" }, { updatedAt: "asc" }] });
  if (rows.length === 0) return null;
  const db: Doc = structuredClone(empty);
  for (const key of Object.keys(db)) if (isCollection(db[key])) db[key] = [];
  for (const r of rows) {
    if (r.collection === META) db[r.id] = r.data;
    else ((db[r.collection] ??= []) as unknown[]).push(r.data);
  }
  return db as T;
}

/** Grava só o que mudou entre `before` e `after` (inclusões, alterações e exclusões). */
async function saveDiff(tx: Tx, before: Doc | null, after: Doc) {
  const old = before ? toRows(before) : new Map();
  const next = toRows(after);
  for (const [k, row] of next) {
    const prev = old.get(k);
    if (prev && JSON.stringify(prev.data) === JSON.stringify(row.data)) continue;
    const data = row.data as Prisma.InputJsonValue;
    await tx.record.upsert({
      where: { collection_id: { collection: row.collection, id: row.id } },
      create: { collection: row.collection, id: row.id, data },
      update: { data },
    });
  }
  const removed = [...old.entries()].filter(([k]) => !next.has(k)).map(([, r]) => r);
  for (const r of removed) await tx.record.delete({ where: { collection_id: { collection: r.collection, id: r.id } } });
}

/** Lê o banco inteiro; se estiver vazio, cria com `initial()`. */
export async function readDocs<T extends Doc>(empty: T, initial: () => Promise<T>): Promise<T> {
  const db = await load(prisma, empty);
  return db ?? mutateDocs(empty, initial, (d) => d).then(() => load(prisma, empty) as Promise<T>);
}

/** Alteração atômica: trava o banco, carrega, aplica `fn` e grava a diferença. */
export function mutateDocs<T extends Doc, R>(empty: T, initial: () => Promise<T>, fn: (db: T) => R | Promise<R>): Promise<R> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
      const loaded = await load(tx, empty);
      const db = loaded ?? (await initial());
      const before = loaded ? structuredClone(loaded) : null;
      const result = await fn(db);
      await saveDiff(tx, before, db);
      return result;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}
