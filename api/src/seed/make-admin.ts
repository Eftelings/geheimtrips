/** Einmalig: Demo-User zum Admin machen */
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const email = process.argv[2] ?? 'lena@example.com';
await db.update(users).set({ isAdmin: true }).where(eq(users.email, email));
console.log(`✅ ${email} ist jetzt Admin.`);
