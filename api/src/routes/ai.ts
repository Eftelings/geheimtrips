import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { generateSummary, generateTips, generateDescription, generateRecommendation, proofread, matchTerms, geminiConfigured } from '../lib/gemini.js';

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

// POST /ai/place-recommend — Text-Empfehlung aus Fotos + Name + Standort (Vision)
router.post('/place-recommend', zValidator('json', z.object({
  name:      z.string().max(200).optional().default(''),
  location:  z.string().max(300).optional().default(''),
  imageUrls: z.array(z.string()).max(5).optional().default([]),
  notes:     z.string().max(2000).optional().default(''),
})), async (c) => {
  if (!geminiConfigured) return c.json({ error: 'KI ist nicht konfiguriert (GEMINI_API_KEY fehlt).' }, 503);
  try {
    const description = await generateRecommendation(c.req.valid('json'));
    return c.json({ description });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// POST /ai/proofread — reiner Rechtschreib-/Grammatik-Pass (kein Umschreiben)
router.post('/proofread', zValidator('json', z.object({ text: z.string().max(8000) })), async (c) => {
  if (!geminiConfigured) return c.json({ error: 'KI ist nicht konfiguriert.' }, 503);
  try {
    const text = await proofread(c.req.valid('json').text);
    return c.json({ text });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// POST /ai/match-terms — freien Suchbegriff auf passende Vokabular-Slugs abbilden (Filter-Synonyme)
router.post('/match-terms', zValidator('json', z.object({
  q:    z.string().max(80),
  kind: z.enum(['merkmale', 'vibes']),
  candidates: z.array(z.object({ slug: z.string(), label: z.string() })).max(300),
})), async (c) => {
  if (!geminiConfigured) return c.json({ slugs: [] });   // kein Fehler — der lokale Filter bleibt nutzbar
  try {
    const { q, kind, candidates } = c.req.valid('json');
    const slugs = await matchTerms(q, kind, candidates);
    return c.json({ slugs });
  } catch (e) {
    return c.json({ error: (e as Error).message, slugs: [] }, 502);
  }
});

export default router;
