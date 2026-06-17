import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '../../geheimtrips.db');
const migrationsFolder = resolve(__dirname, '../../drizzle');

const client = createClient({ url: `file:${dbPath}` });
const db = drizzle(client);

await migrate(db, { migrationsFolder });
console.log('Migrations applied.');
await client.close();
