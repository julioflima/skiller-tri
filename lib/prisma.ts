import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// Uma instância por processo (o Next recarrega módulos em desenvolvimento).
const g = globalThis as unknown as { __skillerPrisma?: PrismaClient };

export const prisma =
  g.__skillerPrisma ??
  new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

if (process.env.NODE_ENV !== "production") g.__skillerPrisma = prisma;
