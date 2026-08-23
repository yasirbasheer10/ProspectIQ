import { defineConfig } from "prisma/config";

// Prisma does not load .env files for us here, so we read them ourselves.
import * as fs from 'fs';
import * as path from 'path';

const isPushing = process.argv.includes('push') || process.argv.includes('migrate');

/**
 * Minimal .env parser. Handles `KEY=value`, `KEY="value"`, `KEY='value'`,
 * `export KEY=value`, blank lines and `#` comments. Deliberately not dotenv:
 * this file runs before dependencies are guaranteed to be installed.
 */
function parseEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  let contents: string;
  try {
    contents = fs.readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

// `.env.local` wins over `.env`, matching Next.js. `vercel env pull` writes to
// `.env.local` by default, so both names have to work.
const fileEnv = {
  ...parseEnvFile(path.join(process.cwd(), '.env')),
  ...parseEnvFile(path.join(process.cwd(), '.env.local')),
};

/** Real environment variables win; the files are only a local fallback. */
const readEnv = (key: string) => process.env[key] || fileEnv[key];

// Schema changes must go over the direct connection: DDL through the pooler in
// transaction mode either hangs or silently fails.
let databaseUrl = isPushing ? readEnv('POSTGRES_URL_NON_POOLING') : undefined;
databaseUrl ||= readEnv('DATABASE_URL') || readEnv('POSTGRES_URL') || readEnv('POSTGRES_PRISMA_URL');

if (!databaseUrl) {
  throw new Error(
    'No database URL found. Set DATABASE_URL in your environment, or create a local .env ' +
      '(or .env.local) containing it — e.g. by running `npx vercel link` then ' +
      '`npx vercel env pull .env.local`. For a schema push, POSTGRES_URL_NON_POOLING ' +
      '(the direct, non-pooling connection string) is used when present.',
  );
}

if (!isPushing && !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1')) {
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
    url: databaseUrl,
  },
});
