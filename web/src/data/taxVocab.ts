import { useEffect, useState } from 'react';
import { taxonomyApi, type TaxVocab } from '../services/api.js';

/**
 * Prozessweiter Cache fürs Taxonomie-Vokabular (Tags/Gruppen/Merkmale/Vibes).
 * Wird einmal geladen und von allen Komponenten geteilt (z.B. Ortskacheln,
 * die aus tagSlug Label + Gruppenfarbe ableiten).
 */
let cache: TaxVocab | null = null;
let inflight: Promise<TaxVocab> | null = null;

export function loadTaxVocab(): Promise<TaxVocab> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) inflight = taxonomyApi.vocab().then(v => { cache = v; return v; }).catch(err => { inflight = null; throw err; });
  return inflight;
}

export interface TagInfo { slug: string; label: string; color: string; icon: string; groupSlug: string; groupLabel: string }

export function tagInfoFrom(vocab: TaxVocab | null, slug?: string | null): TagInfo | null {
  if (!vocab || !slug) return null;
  const tag = vocab.tags.find(t => t.slug === slug);
  if (!tag) return null;
  const group = vocab.groups.find(g => g.slug === tag.groups[0]);
  return { slug: tag.slug, label: tag.label, color: group?.color ?? '#8A6FB3', icon: group?.icon ?? 'fa-tag', groupSlug: tag.groups[0] ?? '', groupLabel: group?.label ?? '' };
}

/** Lädt (gecacht) das Vokabular und gibt es reaktiv zurück. */
export function useTaxVocab(): TaxVocab | null {
  const [vocab, setVocab] = useState<TaxVocab | null>(cache);
  useEffect(() => { if (!cache) loadTaxVocab().then(setVocab).catch(() => {}); }, []);
  return vocab;
}
