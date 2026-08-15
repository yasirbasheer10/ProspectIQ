/**
 * Prisma client singleton
 * Prevents multiple instances during hot reload in development.
 * Uses pg adapter for Prisma v7 compatibility.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const rawUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
  const isLocal = !rawUrl || rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1');
  
  let pool;
  try {
    const url = new URL(rawUrl);
    pool = new Pool({
      host: url.hostname,
      port: parseInt(url.port || '5432'),
      database: url.pathname.slice(1),
      user: url.username,
      password: url.password,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10
    });
  } catch (e) {
    // Fallback if URL parsing fails
    pool = new Pool({ 
      connectionString: rawUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false }
    });
  }

  const adapter = new PrismaPg(pool);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PrismaClient({ adapter } as any);
}

export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
