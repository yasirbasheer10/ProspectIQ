import { defineConfig } from "prisma/config";

// On Windows or environments where `env()` fails to load .env automatically,
// you can manually read the .env file or just rely on the environment.
import * as fs from 'fs';
import * as path from 'path';

let databaseUrl = process.env.DATABASE_URL;

try {
  const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  const match = envFile.match(/DATABASE_URL="([^"]+)"/);
  if (match) {
    databaseUrl = match[1];
  }
} catch {
  // Ignore
}

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
    directUrl: process.env.DIRECT_URL,
  },
});
