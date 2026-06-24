import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { generateSummary, generateTips, generateDescription, geminiConfigured } from '../lib/gemini.js';

const router = new Hono();

// KI-Funktionen nur für eingeloggte Nutzer:innen
router.use('*', requireAuth);

// GET /ai/status — ist die KI verfügbar? (steuert die Buttons im Frontend)
router.get('/status', (c) => c.json({ configured: geminiConfigured }));

const placeCtx = z.object({
  name:     z.string().max(200).optional().default(''),
  long:     z.string().max(8000).optional().default(''),
  highlight:z.string().max(2000).optional().default(''),
  category: z.string().max(120).optional().default(''),
  location: z.string().max(300).optional().default(''),
});

// POST /ai/place-summary — Kurz-Zusammenfassung (2 Sätze) für die Swipe-Karte
router.post('/place-summary', zValidator('json', placeCtx), async (c) => {
  if (!geminiConfigured) return c.json({ error: 'KI ist nicht konfiguriert (GEMINI_API_KEY fehlt).' }, 503);
  try {
    const summary = await generateSummary(c.req.valid('json'));
    return c.json({ summary });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// POST /ai/place-description — Beschreibung ausformulieren / entwerfen
router.post('/place-description', zValidator('json', placeCtx), async (c) => {
  if (!geminiConfigured) return c.json({ error: 'KI ist nicht konfiguriert (GEMINI_API_KEY fehlt).' }, 503);
  try {
    const description = await generateDescription(c.req.valid('json'));
    return c.json({ description });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// POST /ai/place-tips — passende Praxis-Tipps zum Ort
router.post('/place-tips', zValidator('json', placeCtx.extend({ count: z.number().min(1).max(5).optional() })), async (c) => {
  if (!geminiConfigured) return c.json({ error: 'KI ist nicht konfiguriert (GEMINI_API_KEY fehlt).' }, 503);
  try {
    const tips = await generateTips(c.req.valid('json'));
    return c.json({ tips });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

export default router;
