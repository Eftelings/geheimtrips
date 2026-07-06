import { useMemo } from 'react';
import type { Place } from '../../types/index.js';
import type { TaxVocab } from '../../services/api.js';
import { useTaxVocab } from '../../data/taxVocab.js';

/** Filter im neuen Modell: Gruppe (4 Oberkategorien) → optional konkreter Typ-Tag. */
export interface TagSelection { group: string | null; tag: string | null }
export const EMPTY_TAG_SEL: TagSelection = { group: null, tag: null };

/** Kurzes Chip-Label aus dem langen Gruppennamen ("Kultur, Geschichte & …" → "Kultur"). */
export function shortGroupLabel(label: string): string {
  return label.split(/[,&]/)[0].trim();
}

/** Passt ein Ort zur Gruppen-/Tag-Auswahl? (vocab liefert die Tag→Gruppen-Zuordnung) */
export function placeMatchesTag(p: Place, sel: TagSelection, vocab: TaxVocab | null): boolean {
  if (sel.tag) return p.tagSlug === sel.tag;
  if (sel.group) {
    if (!p.tagSlug) return false;
    const tag = vocab?.tags.find(t => t.slug === p.tagSlug);
    if (!tag) return true; // Vokabular noch nicht geladen → nicht wegfiltern
    return tag.groups.includes(sel.group);
  }
  return true;
}

export function TagFilter({ value, onChange }: { value: TagSelection; onChange: (s: TagSelection) => void }) {
  const vocab = useTaxVocab();
  const groups = vocab?.groups ?? [];

  const tagsInGroup = useMemo(() => {
    if (!value.group || !vocab) return [];
    return vocab.tags.filter(t => t.groups.includes(value.group!)).sort((a, b) => a.label.localeCompare(b.label, 'de'));
  }, [vocab, value.group]);

  const groupColor = groups.find(g => g.slug === value.group)?.color ?? '#8A6FB3';

  return (
    <div>
      {/* Oberkategorien (Gruppen) — alle vier nebeneinander in einer Reihe */}
      <div className="flex gap-1.5">
        {groups.map(g => {
          const on = value.group === g.slug;
          return (
            <button key={g.slug} type="button" onClick={() => onChange(on ? EMPTY_TAG_SEL : { group: g.slug, tag: null })}
              className="flex-1 min-w-0 flex items-center justify-center gap-1 px-1.5 py-2 rounded-full text-[11px] font-semibold border transition-all active:scale-95"
              style={on ? { background: g.color, color: 'white', borderColor: g.color } : { background: 'white', color: '#71587a', borderColor: '#E4DCF0' }}>
              <i className={`fa-solid ${g.icon} text-[10px] flex-shrink-0`} /><span className="truncate">{shortGroupLabel(g.label)}</span>
            </button>
          );
        })}
      </div>

      {/* Typ-Tags der gewählten Gruppe */}
      {value.group && tagsInGroup.length > 0 && (
        <div className="mt-2.5 p-3 bg-white border rounded-2xl flex flex-wrap gap-2" style={{ borderColor: '#EFEAF5' }}>
          {tagsInGroup.map(t => {
            const on = value.tag === t.slug;
            return (
              <button key={t.slug} type="button" onClick={() => onChange({ group: value.group, tag: on ? null : t.slug })}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all active:scale-95"
                style={on ? { background: groupColor, color: 'white', borderColor: groupColor } : { background: 'white', color: '#71587a', borderColor: '#E4DCF0' }}>
                {t.label}
              </button>
            );
          })}
          {value.tag && (
            <button type="button" onClick={() => onChange({ group: value.group, tag: null })}
              className="self-center text-[11px] font-bold text-[var(--color-amber)] ml-1">
              <i className="fa-solid fa-xmark mr-1" />zurücksetzen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
