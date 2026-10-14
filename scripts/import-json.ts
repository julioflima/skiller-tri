/**
 * Copia o banco JSON local (data/db.json ou DATA_FILE) para o Postgres configurado em DATABASE_URL.
 * Uso: npm run db:import            (recusa se o banco já tiver dados)
 *      npm run db:import -- --force (apaga o que houver no Postgres antes)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../lib/generated/prisma/client";

const file = process.env.DATA_FILE || path.join(process.cwd(), "data", "db.json");
const force = process.argv.includes("--force");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const db = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  if (db.version !== 2) throw new Error(`${file} está no formato v${db.version ?? 1}; só o v2 pode ser importado.`);
  const rows: Prisma.RecordCreateManyInput[] = [];
  for (const [key, value] of Object.entries(db)) {
    const isCollection = Array.isArray(value) && value.every((x) => x && typeof x === "object" && "id" in x);
    if (isCollection) for (const item of value as { id: string }[]) rows.push({ collection: key, id: item.id, data: item as Prisma.InputJsonValue });
    else rows.push({ collection: "_meta", id: key, data: value as Prisma.InputJsonValue });
  }
  const existing = await prisma.record.count();
  if (existing > 0 && !force) throw new Error(`O Postgres já tem ${existing} registros. Use --force para substituir.`);
  await prisma.$transaction([prisma.record.deleteMany(), prisma.record.createMany({ data: rows })]);
  console.log(`Importados ${rows.length} registros de ${file}.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
