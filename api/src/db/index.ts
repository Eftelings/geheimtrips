import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '../../geheimtrips.db');

// Produktion: Turso/libsql über DATABASE_URL (+ Auth-Token).
// Lokal: SQLite-Datei als Fallback — keine Env nötig.
// .trim() schützt vor versehentlichen Leerzeichen/Tabs in den Env-Werten
const url = (process.env.DATABASE_URL ?? `file:${dbPath}`).trim();
const authToken = process.env.DATABASE_AUTH_TOKEN?.trim() || undefined;
const client = createClient(authToken ? { url, authToken } : { url });

export const db = drizzle(client, { schema });
export type DB = typeof db;
