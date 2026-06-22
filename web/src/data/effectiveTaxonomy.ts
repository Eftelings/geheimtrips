import { TAXONOMY } from './taxonomy.js';
import type { TaxonomyL1, TaxonomyL2, TaxonomyL3 } from './taxonomy.js';

// DB-Override-Knoten (von /categories/taxonomy-nodes bzw. /admin/taxonomy-nodes)
export interface TaxonomyNode {
  level: number;                 // 2 = Hauptkategorie, 3 = Unterkategorie
  slug: string;
  label: string | null;
  icon: string | null;
  parentSlug: string | null;
  hidden: number;
  isCustom: number;
  sort?: number;
}

/**
 * Mischt die Code-Taxonomie (taxonomy.ts) mit den DB-Overrides zu einem
 * effektiven Baum: angelegte Knoten ergänzen, Overrides überschreiben Label/Icon/Eltern,
 * ausgeblendete fallen raus. L3 können einer anderen Hauptkategorie zugeordnet werden.
 */
export function buildEffectiveTaxonomy(nodes: TaxonomyNode[]): TaxonomyL1[] {
  const l2ov = new Map<string, TaxonomyNode>();
  const l3ov = new Map<string, TaxonomyNode>();
  const customL2: TaxonomyNode[] = [];
  const customL3: TaxonomyNode[] = [];
  for (const n of nodes) {
    if (n.level === 2) { l2ov.set(n.slug, n); if (n.isCustom) customL2.push(n); }
    else if (n.level === 3) { l3ov.set(n.slug, n); if (n.isCustom) customL3.push(n); }
  }

  // Code-Indizes
  const codeL3 = new Map<string, TaxonomyL3>();
  const codeL3Parent = new Map<string, string>();   // l3-slug -> code-l2-slug
  const codeL2 = new Set<string>();
  for (const l1 of TAXONOMY) for (const l2 of l1.children) {
    codeL2.add(l2.slug);
    for (const l3 of l2.children) { codeL3.set(l3.slug, l3); codeL3Parent.set(l3.slug, l2.slug); }
  }

  const effL3Parent = (slug: string) => l3ov.get(slug)?.parentSlug ?? codeL3Parent.get(slug) ?? '';

  function l3ListFor(l2slug: string): TaxonomyL3[] {
    const out: TaxonomyL3[] = [];
    for (const [slug, l3] of codeL3) {
      if (l3ov.get(slug)?.hidden === 1) continue;
      if (effL3Parent(slug) !== l2slug) continue;
      const ov = l3ov.get(slug);
      out.push(ov?.label ? { ...l3, label: ov.label } : l3);
    }
    for (const n of customL3) {
      if (n.hidden || codeL3.has(n.slug) || (n.parentSlug ?? '') !== l2slug) continue;
      out.push({ slug: n.slug, label: n.label ?? n.slug, features: [], questions: [] });
    }
    return out;
  }

  function l2ListFor(l1: TaxonomyL1): TaxonomyL2[] {
    const out: TaxonomyL2[] = [];
    for (const l2 of l1.children) {
      if (l2ov.get(l2.slug)?.hidden === 1) continue;
      const ov = l2ov.get(l2.slug);
      out.push({
        ...l2,
        label: ov?.label ?? l2.label,
        icon: ov?.icon ?? l2.icon,
        children: l3ListFor(l2.slug),
      });
    }
    for (const n of customL2) {
      if (n.hidden || codeL2.has(n.slug) || (n.parentSlug ?? '') !== l1.slug) continue;
      out.push({ slug: n.slug, label: n.label ?? n.slug, icon: n.icon ?? 'fa-folder', children: l3ListFor(n.slug) });
    }
    return out;
  }

  return TAXONOMY.map(l1 => ({ ...l1, children: l2ListFor(l1) }));
}
