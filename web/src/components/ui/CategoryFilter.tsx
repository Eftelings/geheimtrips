import { useEffect, useMemo, useState } from 'react';
import { categoriesApi, discoverApi } from '../../services/api.js';
import { TAXONOMY } from '../../data/taxonomy.js';
import type { TaxonomyL1, TaxonomyL2, TaxonomyL3 } from '../../data/taxonomy.js';
import { CATEGORIES } from '../../types/index.js';
import type { CategoryDef, Place } from '../../types/index.js';

export interface CategorySelection {
  cat: CategoryDef | null;
  l1: TaxonomyL1 | null;
  l2: TaxonomyL2 | null;
  l3: TaxonomyL3 | null;
}
export const EMPTY_CATEGORY: CategorySelection = { cat: null, l1: null, l2: null, l3: null };

/** Passt ein Ort zur aktuellen Kategorie-/Taxonomie-Auswahl? */
export function placeMatchesCategory(p: Place, sel: CategorySelection): boolean {
  const hay = () => `${p.name} ${(p as unknown as { short?: string }).short ?? ''} ${p.categoryLabel} ${p.vibe.join(' ')}`.toLowerCase();
  if (sel.cat) {
    let ok = p.category === sel.cat.slug;
    if (!ok && sel.cat.keywords) {
      const kws = sel.cat.keywords.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const h = hay();
      ok = kws.some(kw => h.includes(kw));
    }
    if (!ok) return false;
  }
  if (sel.l1) {
    const attrs = p.attributes as Record<string, unknown> | null;
    if (attrs && typeof attrs.l1Slug === 'string' && attrs.l1Slug) {
      if (attrs.l1Slug !== sel.l1.slug) return false;
      if (sel.l2 && attrs.l2Slug !== sel.l2.slug) return false;
      if (sel.l3 && attrs.l3Slug !== sel.l3.slug) return false;
    } else {
      const words = (sel.l3 ?? sel.l2 ?? sel.l1).label.toLowerCase().split(/[\s&,/-]+/).filter(w => w.length > 3);
      const h = hay();
      if (!words.some(w => h.includes(w))) return false;
    }
  }
  return true;
}

/**
 * Kategorie-Browser: Hauptkategorien (nach Nutzerprofil sortiert) + Taxonomie-
 * Drilldown („Alle Kategorien durchstöbern"). Geteilt von Startseite & Sammlung.
 */
export function CategoryFilter({ value, onChange }: {
  value: CategorySelection;
  onChange: (sel: CategorySelection) => void;
}) {
  const [cats, setCats] = useState<CategoryDef[]>(CATEGORIES);
  const [aff, setAff]   = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const { cat, l1, l2, l3 } = value;

  useEffect(() => {
    categoriesApi.list().then(r => { if (r.length) setCats(r); }).catch(() => {});
    discoverApi.categoryAffinity().then(setAff).catch(() => {});
  }, []);

  // Personalisierte Reihenfolge: höchste Affinität zuerst, sonst Admin-Sortierung
  const personalized = Object.keys(aff).length > 0;
  const sorted = useMemo(() => [...cats].sort((a, b) => {
    if (personalized) { const d = (aff[b.slug] ?? 0) - (aff[a.slug] ?? 0); if (Math.abs(d) > 0.001) return d; }
    return a.sort - b.sort;
  }), [cats, aff, personalized]);

  const update = (p: Partial<CategorySelection>) => onChange({ cat, l1, l2, l3, ...p });

  return (
    <div>
      {/* Hauptkategorien */}
      <div className="flex flex-wrap gap-2 items-center">
        {personalized && (
          <span className="text-[10px] font-bold text-[var(--color-amber)] inline-flex items-center gap-1 mr-0.5">
            <i className="fa-solid fa-wand-magic-sparkles" />Für dich
          </span>
        )}
        {sorted.map(c => {
          const on = cat?.slug === c.slug;
          return (
            <button key={c.slug} onClick={() => update({ cat: on ? null : c })}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                on ? 'bg-[var(--color-aubergine)] text-white border-[var(--color-aubergine)]' : 'bg-white text-[var(--color-lavender)] border-[var(--color-bg-soft)] hover:border-[var(--color-aubergine)] hover:text-[var(--color-aubergine)]'}`}>
              <i className={`fa-solid ${c.icon} text-[10px]`} />{c.label}
            </button>
          );
        })}
      </div>

      {/* Drilldown */}
      <div className="mt-3">
        <button onClick={() => setOpen(o => !o)}
          className="text-xs font-bold text-[var(--color-lavender)] hover:text-[var(--color-aubergine)] transition-colors">
          <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} mr-1.5 text-[10px]`} />
          Alle Kategorien durchstöbern
          {l1 && <span className="ml-2 text-[var(--color-amber)]">{l1.label}{l2 ? ` › ${l2.label}` : ''}{l3 ? ` › ${l3.label}` : ''}</span>}
        </button>
        {open && (
          <div className="mt-2 p-3 bg-white border border-[var(--color-bg-soft)] rounded-2xl flex flex-col gap-2.5">
            <div className="flex flex-wrap gap-2">
              {TAXONOMY.map(x => (
                <button key={x.slug} onClick={() => update({ l1: l1?.slug === x.slug ? null : x, l2: null, l3: null })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${l1?.slug === x.slug ? 'bg-[var(--color-aubergine)] text-white border-[var(--color-aubergine)]' : 'bg-white text-[var(--color-lavender)] border-[var(--color-bg-soft)] hover:border-[var(--color-aubergine)]'}`}>
                  <i className={`fa-solid ${x.icon} text-[10px]`} />{x.label}
                </button>
              ))}
            </div>
            {l1 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-dashed border-[var(--color-bg-soft)]">
                {l1.children.map(x => (
                  <button key={x.slug} onClick={() => update({ l2: l2?.slug === x.slug ? null : x, l3: null })}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${l2?.slug === x.slug ? 'bg-[var(--color-amber)] text-white border-[var(--color-amber)]' : 'bg-white text-[var(--color-lavender)] border-[var(--color-bg-soft)] hover:border-[var(--color-amber)]'}`}>
                    {x.label}
                  </button>
                ))}
              </div>
            )}
            {l2 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-dashed border-[var(--color-bg-soft)]">
                {l2.children.map(x => (
                  <button key={x.slug} onClick={() => update({ l3: l3?.slug === x.slug ? null : x })}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${l3?.slug === x.slug ? 'bg-[#71587A] text-white border-[#71587A]' : 'bg-white text-[var(--color-lavender)] border-[var(--color-bg-soft)] hover:border-[#71587A]'}`}>
                    {x.label}
                  </button>
                ))}
              </div>
            )}
            {l1 && (
              <button onClick={() => update({ l1: null, l2: null, l3: null })}
                className="self-start text-[11px] font-bold text-[var(--color-amber)]">
                <i className="fa-solid fa-xmark mr-1" />Kategorie-Filter zurücksetzen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
