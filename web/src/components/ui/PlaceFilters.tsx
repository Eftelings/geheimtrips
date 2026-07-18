import { useMemo, useState } from 'react';
import type { TaxVocab, TaxTerm } from '../../services/api.js';
import { aiApi } from '../../services/api.js';
import type { TagSelection } from './TagFilter.js';
import { EMPTY_TAG_SEL, shortGroupLabel } from './TagFilter.js';

/** Facetten neben den Orten (Hauptkategorien via tagSel). */
export interface Facets {
  merkmale: string[];   // Slugs aus vocab.merkmale
  vibes:    string[];   // Slugs aus vocab.vibes
  minRating: number;    // 0 = egal
  maxCost:   number;    // 0 = egal, sonst 1|2|3 (Obergrenze)
  audience:  string[];  // Labels (Antwort-Strings), z.B. „Paare"
}
export const EMPTY_FACETS: Facets = { merkmale: [], vibes: [], minRating: 0, maxCost: 0, audience: [] };

// Universelle Zielgruppen (Basis-Set der `audience`-Frage beim Anlegen).
const AUDIENCES = ['Familien mit Kindern', 'Paare', 'Solo-Reisende', 'Gruppen & Freunde', 'Senioren', 'Fotografen'];
const RATINGS = [3, 4, 4.5];
const COSTS: { v: number; label: string }[] = [{ v: 1, label: '€' }, { v: 2, label: '€€' }, { v: 3, label: '€€€' }];

type FacetId = 'orte' | 'merkmale' | 'vibe' | 'rating' | 'budget' | 'audience';

export function facetsActive(sel: TagSelection, f: Facets): boolean {
  return !!(sel.group || sel.tag) || f.merkmale.length > 0 || f.vibes.length > 0
    || f.minRating > 0 || f.maxCost > 0 || f.audience.length > 0;
}

const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

export function PlaceFilters({ vocab, sel, onSel, facets, onFacets }: {
  vocab: TaxVocab | null;
  sel: TagSelection;
  onSel: (s: TagSelection) => void;
  facets: Facets;
  onFacets: (f: Facets) => void;
}) {
  const [open, setOpen] = useState<FacetId | null>('orte');
  const groups = vocab?.groups ?? [];
  const set = (patch: Partial<Facets>) => onFacets({ ...facets, ...patch });

  // Anzahl aktiver Auswahlen je Facette → Badge am Button.
  const counts: Record<FacetId, number> = {
    orte: (sel.group ? 1 : 0) + (sel.tag ? 1 : 0),
    merkmale: facets.merkmale.length,
    vibe: facets.vibes.length,
    rating: facets.minRating ? 1 : 0,
    budget: facets.maxCost ? 1 : 0,
    audience: facets.audience.length,
  };

  const FACETS: { id: FacetId; label: string; icon: string }[] = [
    { id: 'orte',     label: 'Orte',       icon: 'fa-compass' },
    { id: 'merkmale', label: 'Was gibt’s', icon: 'fa-list-check' },
    { id: 'vibe',     label: 'Vibe',       icon: 'fa-wand-magic-sparkles' },
    { id: 'rating',   label: 'Bewertung',  icon: 'fa-star' },
    { id: 'budget',   label: 'Budget',     icon: 'fa-euro-sign' },
    { id: 'audience', label: 'Für wen',    icon: 'fa-users' },
  ];

  return (
    <div className="space-y-2.5">
      {/* Facetten-Buttons */}
      <div className="flex flex-wrap gap-1.5">
        {FACETS.map(f => {
          const on = open === f.id;
          const n = counts[f.id];
          return (
            <button key={f.id} type="button" onClick={() => setOpen(on ? null : f.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all active:scale-95"
              style={on || n
                ? { background: '#34254c', color: 'white', borderColor: '#34254c' }
                : { background: 'white', color: '#71587a', borderColor: '#E4DCF0' }}>
              <i className={`fa-solid ${f.icon} text-[10px]`} />{f.label}
              {n > 0 && <span className="min-w-4 h-4 px-1 rounded-full bg-[var(--color-amber)] text-white text-[9px] font-bold inline-flex items-center justify-center">{n}</span>}
            </button>
          );
        })}
      </div>

      {/* Aufklappbereich der offenen Facette */}
      {open === 'orte' && (
        <div className="p-3 bg-white border rounded-2xl space-y-2.5" style={{ borderColor: '#EFEAF5' }}>
          <div className="flex flex-wrap gap-1.5">
            {groups.map(g => {
              const gon = sel.group === g.slug;
              return (
                <button key={g.slug} type="button"
                  onClick={() => onSel(gon ? EMPTY_TAG_SEL : { group: g.slug, tag: null })}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all active:scale-95"
                  style={gon ? { background: g.color, color: 'white', borderColor: g.color } : { background: 'white', color: '#71587a', borderColor: '#E4DCF0' }}>
                  <i className={`fa-solid ${g.icon} text-[10px]`} />{shortGroupLabel(g.label)}
                </button>
              );
            })}
          </div>
          {sel.group && (
            <TypeTags vocab={vocab} sel={sel} onSel={onSel} />
          )}
        </div>
      )}

      {open === 'merkmale' && (
        <TermFacet title="Was gibt es dort?" terms={vocab?.merkmale ?? []} kind="merkmale"
          selected={facets.merkmale} onToggle={s => set({ merkmale: toggle(facets.merkmale, s) })} />
      )}

      {open === 'vibe' && (
        <TermFacet title="Wie fühlt es sich an?" terms={vocab?.vibes ?? []} kind="vibes"
          selected={facets.vibes} onToggle={s => set({ vibes: toggle(facets.vibes, s) })} />
      )}

      {open === 'rating' && (
        <div className="p-3 bg-white border rounded-2xl flex flex-wrap gap-2" style={{ borderColor: '#EFEAF5' }}>
          {RATINGS.map(r => {
            const on = facets.minRating === r;
            return (
              <button key={r} type="button" onClick={() => set({ minRating: on ? 0 : r })}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all active:scale-95"
                style={on ? { background: 'var(--color-amber)', color: 'white', borderColor: 'var(--color-amber)' } : { background: 'white', color: '#71587a', borderColor: '#E4DCF0' }}>
                <i className="fa-solid fa-star text-[10px]" />ab {r.toString().replace('.', ',')}
              </button>
            );
          })}
        </div>
      )}

      {open === 'budget' && (
        <div className="p-3 bg-white border rounded-2xl space-y-1.5" style={{ borderColor: '#EFEAF5' }}>
          <div className="flex gap-2">
            {COSTS.map(c => {
              const on = facets.maxCost === c.v;
              return (
                <button key={c.v} type="button" onClick={() => set({ maxCost: on ? 0 : c.v })}
                  className="flex-1 py-1.5 rounded-full text-xs font-bold border transition-all active:scale-95"
                  style={on ? { background: 'var(--color-success)', color: 'white', borderColor: 'var(--color-success)' } : { background: 'white', color: '#71587a', borderColor: '#E4DCF0' }}>
                  {c.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-[#B0A3BC] px-1">Höchstens dieses Preisniveau.</p>
        </div>
      )}

      {open === 'audience' && (
        <div className="p-3 bg-white border rounded-2xl flex flex-wrap gap-1.5" style={{ borderColor: '#EFEAF5' }}>
          {AUDIENCES.map(a => {
            const on = facets.audience.includes(a);
            return (
              <button key={a} type="button" onClick={() => set({ audience: toggle(facets.audience, a) })}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all active:scale-95"
                style={on ? { background: '#7c3aed', color: 'white', borderColor: '#7c3aed' } : { background: 'white', color: '#71587a', borderColor: '#E4DCF0' }}>
                {a}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TypeTags({ vocab, sel, onSel }: { vocab: TaxVocab | null; sel: TagSelection; onSel: (s: TagSelection) => void }) {
  const tags = useMemo(
    () => (vocab?.tags ?? []).filter(t => t.groups.includes(sel.group!)).sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [vocab, sel.group]);
  const color = vocab?.groups.find(g => g.slug === sel.group)?.color ?? '#8A6FB3';
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      {tags.map(t => {
        const on = sel.tag === t.slug;
        return (
          <button key={t.slug} type="button" onClick={() => onSel({ group: sel.group, tag: on ? null : t.slug })}
            className="px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all active:scale-95"
            style={on ? { background: color, color: 'white', borderColor: color } : { background: 'white', color: '#71587a', borderColor: '#E4DCF0' }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** Merkmale/Vibe: Suchfeld mit Vorschlägen + „Ähnliches per KI" (Synonyme, auf Abruf). */
function TermFacet({ title, terms, kind, selected, onToggle }: {
  title: string; terms: TaxTerm[]; kind: 'merkmale' | 'vibes'; selected: string[]; onToggle: (slug: string) => void;
}) {
  const [q, setQ] = useState('');
  const [aiSlugs, setAiSlugs] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const bySlug = useMemo(() => new Map(terms.map(t => [t.slug, t] as const)), [terms]);
  const query = q.trim().toLowerCase();

  // Lokale Treffer: Label enthält die Eingabe. Ohne Eingabe die ersten ~14 als Auswahl.
  const localMatches = useMemo(() => {
    const base = query ? terms.filter(t => t.label.toLowerCase().includes(query)) : terms;
    return base.slice(0, query ? 20 : 14);
  }, [terms, query]);

  const aiTerms = aiSlugs.map(s => bySlug.get(s)).filter((t): t is TaxTerm => !!t && !localMatches.some(m => m.slug === t.slug));

  async function askAi() {
    setAiErr(''); setAiLoading(true);
    try {
      const { slugs } = await aiApi.matchTerms({ q: q.trim(), kind, candidates: terms.map(t => ({ slug: t.slug, label: t.label })) });
      setAiSlugs(slugs);
      if (slugs.length === 0) setAiErr('Keine passenden Begriffe gefunden.');
    } catch (e) { setAiErr((e as Error).message || 'KI-Suche fehlgeschlagen.'); }
    setAiLoading(false);
  }

  const chip = (t: TaxTerm, ai = false) => {
    const on = selected.includes(t.slug);
    return (
      <button key={t.slug} type="button" onClick={() => onToggle(t.slug)}
        className="px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all active:scale-95"
        style={on
          ? { background: '#34254c', color: 'white', borderColor: '#34254c' }
          : ai ? { background: '#FBF7FF', color: '#7C3AED', borderColor: '#E9E1F3' }
               : { background: 'white', color: '#71587a', borderColor: '#E4DCF0' }}>
        {ai && !on && <i className="fa-solid fa-wand-magic-sparkles text-[9px] mr-1" />}{t.label}
      </button>
    );
  };

  return (
    <div className="p-3 bg-white border rounded-2xl space-y-2" style={{ borderColor: '#EFEAF5' }}>
      <div className="flex items-center gap-2 bg-[var(--color-bg-soft)] rounded-xl px-3 h-9">
        <i className="fa-solid fa-magnifying-glass text-[var(--color-lavender)] text-xs" />
        <input value={q} onChange={e => { setQ(e.target.value); setAiSlugs([]); setAiErr(''); }} placeholder={`${title} suchen…`}
          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--color-aubergine)] placeholder:text-[var(--color-lavender-lt)]" />
        {q && <button onClick={() => { setQ(''); setAiSlugs([]); }} aria-label="Leeren"><i className="fa-solid fa-xmark text-[var(--color-lavender)] text-xs" /></button>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {localMatches.map(t => chip(t))}
        {aiTerms.map(t => chip(t, true))}
      </div>

      {/* KI-Synonyme auf Abruf: nur wenn getippt und kein exakter lokaler Treffer. */}
      {query && !localMatches.some(m => m.label.toLowerCase() === query) && (
        <button type="button" onClick={askAi} disabled={aiLoading}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold disabled:opacity-50" style={{ color: '#7C3AED' }}>
          <i className={`fa-solid ${aiLoading ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles'} text-[10px]`} />
          {aiLoading ? 'Suche Ähnliches…' : `Ähnliches zu „${q.trim()}" per KI`}
        </button>
      )}
      {aiErr && <p className="text-[11px] text-[#C96442]">{aiErr}</p>}
      {localMatches.length === 0 && !aiTerms.length && !query && <p className="text-[11px] text-[#B0A3BC]">Keine Einträge.</p>}
    </div>
  );
}
