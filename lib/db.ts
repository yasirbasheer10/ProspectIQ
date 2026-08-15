/**
 * Prisma client singleton
 * Prevents multiple instances during hot reload in development.
 * Uses pg adapter for Prisma v7 compatibility.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  let url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
  
  // If production Supabase URL, enforce sslaccept and pgbouncer
  if (url && !url.includes('localhost') && !url.includes('127.0.0.1')) {
    const separator = url.includes('?') ? '&' : '?';
    if (!url.includes('pgbouncer=true')) {
      url += `${separator}pgbouncer=true`;
    }
    if (!url.includes('sslaccept=')) {
      url += `&sslaccept=accept_invalid_certs`;
    }
  }

  return new PrismaClient({
    datasources: {
      db: {
        url: url,
      },
    },
  });
}

export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
