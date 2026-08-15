import { defineConfig } from "prisma/config";

// On Windows or environments where `env()` fails to load .env automatically,
// you can manually read the .env file or just rely on the environment.
import * as fs from 'fs';
import * as path from 'path';

let databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;

try {
  const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  const match = envFile.match(/DATABASE_URL="([^"]+)"/);
  if (match) {
    databaseUrl = match[1];
  }
} catch {
  // Ignore
}

if (databaseUrl && !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1')) {
  const separator = databaseUrl.includes('?') ? '&' : '?';
  if (!databaseUrl.includes('pgbouncer=true')) {
    databaseUrl += `${separator}pgbouncer=true`;
  }
  if (!databaseUrl.includes('sslaccept=')) {
    databaseUrl += `&sslaccept=accept_invalid_certs`;
  }
}

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: databaseUrl as string,
  },
});
