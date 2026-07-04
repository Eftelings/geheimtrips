import { db } from '../db/index.js';
import { notifications } from '../db/schema.js';

/** Legt eine Benachrichtigung für eine:n Empfänger:in an (best effort, wirft nicht). */
export async function notify(opts: {
  userId: number;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  actorId?: number | null;
}) {
  await db.insert(notifications).values({
    userId: opts.userId,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    link: opts.link ?? null,
    actorId: opts.actorId ?? null,
  }).catch(() => {});
}
