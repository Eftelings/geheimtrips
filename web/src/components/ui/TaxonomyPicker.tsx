import { useEffect, useMemo, useState } from 'react';
import { taxonomyApi } from '../../services/api.js';
import type { TaxVocab, TaxTerm } from '../../services/api.js';
import { suggestTagsFromText } from '../../data/taxVocab.js';

export interface TaxonomyValue { tags: string[]; merkmale: string[]; vibes: string[] }

const MAX_TAGS = 3;
const VIBE_HINTS = ['z.B. gemütlich', 'z.B. aufregend', 'z.B. romantisch', 'z.B. mystisch', 'z.B. entspannt', 'z.B. lebhaft'];
const shortGroup = (label: string) => label.split(/[,&]/)[0].trim();

// Häufige Adjektive OHNE typische Endung — die würden sonst durchs Raster fallen.
const COMMON_ADJ = new Set([
  'gut', 'cool', 'nett', 'wild', 'leer', 'nass', 'rau', 'rauh', 'weit', 'eng', 'alt', 'neu', 'laut',
  'leise', 'warm', 'kalt', 'klar', 'fein', 'frei', 'fern', 'nah', 'schön', 'schoen', 'ruhig', 'hip',
  'chic', 'schick', 'edel', 'pur', 'echt', 'frisch', 'bunt', 'grau', 'wach', 'still', 'weich', 'hart',
  'glatt', 'steil', 'flach', 'tief', 'hoch', 'breit', 'schmal', 'sauber', 'grün', 'gruen', 'idyllisch',
  'modern', 'urban', 'roh', 'satt', 'karg', 'mild', 'zart', 'süß', 'suess', 'herb', 'wuchtig',
]);

// E: grobe Prüfung, ob eine Eingabe ein Adjektiv ist (für „Wie fühlt es sich an?").
// Bewusst eher streng: im Zweifel lieber nachfragen (Hinweis) als ein Nomen als „Vibe" durchlassen.
export function looksLikeAdjective(raw: string): boolean {
  const w = raw.trim();
  const words = w.split(/\s+/);
  if (!w || words.length > 2) return false;
  const last = words[words.length - 1];      // Kopfwort (bei „sehr gemütlich" = „gemütlich")
  const lower = last.toLowerCase();
  if (COMMON_ADJ.has(lower)) return true;
  // typische Nomen-Endungen → ablehnen (inkl. Komposita wie „Kaffeehaus", „Freizeitpark")
  // „bar"/„club" bewusst NICHT hier — sonst fiele das Adjektiv „wunderbar" durchs Nomen-Raster.
  if (/(ung|heit|keit|schaft|tion|taet|tät|ismus|nis|tum|ling|haus|platz|garten|halle|park|welt|zimmer|raum|weg|berg|see|bau|stadt|dorf|hof|markt|museum|bad|cafe|café|kaffee|musik|sonne)$/.test(lower)) return false;
  // typische Adjektiv-Endungen → ok. „end" deckt Partizipien ab (entspannend, aufregend, einladend).
  if (/(ig|lich|isch|sam|bar|haft|los|voll|iv|oes|ös|os|ern|ell|al|ant|ent|end)$/.test(lower)) return true;
  // Alles andere (Nomen ohne typische Endung, „Kaffee", „Musik" …) → lieber Hinweis geben.
  return false;
}

/**
 * Anlege-Auswahl im neuen Modell: bis zu 3 Typ-Tags (D, z.B. Restaurant + Café) → gemappte Merkmale & Vibes.
 * C: Vorschläge aus dem Text · F: erst 4 Gruppen mit Beispielen · E: Vibes nur Adjektive.
 */
export function TaxonomyPicker({ value, onChange, text }: { value: TaxonomyValue; onChange: (v: TaxonomyValue) => void; text?: string }) {
  const [vocab, setVocab] = useState<TaxVocab | null>(null);
  const [sugg, setSugg] = useState<{ merkmale: TaxTerm[]; vibes: TaxTerm[] }>({ merkmale: [], vibes: [] });
  const [tagSearch, setTagSearch] = useState('');
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mQuery, setMQuery] = useState('');
  const [vQuery, setVQuery] = useState('');
  const [hintIdx, setHintIdx] = useState(0);

  useEffect(() => { taxonomyApi.vocab().then(setVocab).catch(() => {}); }, []);
  useEffect(() => {
    if (!value.tags.length) { setSugg({ merkmale: [], vibes: [] }); return; }
    Promise.all(value.tags.map(t => taxonomyApi.suggestions(t))).then(rs => {
      const dedupe = (arr: TaxTerm[]) => Array.from(new Map(arr.map(x => [x.slug, x])).values());
      setSugg({ merkmale: dedupe(rs.flatMap(r => r.merkmale)), vibes: dedupe(rs.flatMap(r => r.vibes)) });
    }).catch(() => {});
  }, [value.tags.join(',')]);
  useEffect(() => { const t = setInterval(() => setHintIdx(i => (i + 1) % VIBE_HINTS.length), 2200); return () => clearInterval(t); }, []);

  const textSuggestions = useMemo(() => suggestTagsFromText(text ?? '', vocab), [text, vocab]);

  const set = (patch: Partial<TaxonomyValue>) => onChange({ ...value, ...patch });
  const toggle = (arr: string[], label: string) => arr.includes(label) ? arr.filter(x => x !== label) : [...arr, label];
  const atMax = value.tags.length >= MAX_TAGS;
  const toggleTag = (slug: string) => {
    if (value.tags.includes(slug)) set({ tags: value.tags.filter(t => t !== slug) });
    else if (!atMax) { set({ tags: [...value.tags, slug] }); setTagSearch(''); }
  };

  const groupTags = (gSlug: string) => (vocab?.tags ?? []).filter(t => t.groups.includes(gSlug)).sort((a, b) => a.label.localeCompare(b.label, 'de'));
  // Typen einer Gruppe nach Unterkategorie (sub) bündeln — in Seed-Reihenfolge (nicht alphabetisch),
  // damit Museen/Sakralbauten/… sinnvoll gruppiert erscheinen. Ohne sub → „Weitere".
  const subgroupsOf = (gSlug: string): [string, NonNullable<typeof vocab>['tags']][] => {
    const order: string[] = [];
    const map = new Map<string, NonNullable<typeof vocab>['tags']>();
    for (const t of (vocab?.tags ?? []).filter(x => x.groups.includes(gSlug))) {
      const sub = t.sub || 'Weitere';
      if (!map.has(sub)) { map.set(sub, []); order.push(sub); }
      map.get(sub)!.push(t);
    }
    return order.map(sub => [sub, map.get(sub)!]);
  };
  const searchResults = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    return q ? (vocab?.tags ?? []).filter(t => t.label.toLowerCase().includes(q)).slice(0, 24) : [];
  }, [vocab, tagSearch]);

  const combo = (all: TaxTerm[], query: string, selected: string[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as { label: string; isNew: boolean }[];
    const out = all.filter(t => t.label.toLowerCase().includes(q) && !selected.includes(t.label)).slice(0, 8).map(m => ({ label: m.label, isNew: false }));
    const exact = all.some(t => t.label.toLowerCase() === q) || selected.some(s => s.toLowerCase() === q);
    if (!exact) out.push({ label: query.trim(), isNew: true });
    return out;
  };

  if (!vocab) return <div className="py-8 text-center text-[var(--color-lavender)]"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>;

  const groupColor = (gSlug?: string) => vocab.groups.find(g => g.slug === gSlug)?.color ?? '#8A6FB3';
  const tagBySlug = (slug: string) => vocab.tags.find(t => t.slug === slug);
  const pillCls = 'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95';
  const pillOff = { background: 'white', color: '#71587a', borderColor: '#E4DCF0' } as const;
  const tagPillStyle = (slug: string, gSlug?: string) => value.tags.includes(slug)
    ? { background: groupColor(gSlug), color: 'white', borderColor: groupColor(gSlug) }
    : atMax ? { ...pillOff, opacity: 0.45 } : pillOff;

  return (
    <div className="flex flex-col gap-6">
      {/* ── TAGS (bis zu 3) ── — Überschrift kommt schon vom Schritt-Kopf, hier nur der kurze Hinweis */}
      <div>
        <p className="text-xs text-[var(--color-lavender)] mb-3">Wähle bis zu {MAX_TAGS} Typen — z.B. Restaurant <em>und</em> Café.</p>

        {/* C: Vorschläge aus dem Beschreibungstext */}
        {!atMax && textSuggestions.filter(t => !value.tags.includes(t.slug)).length > 0 && (
          <div className="mb-3 rounded-xl p-3" style={{ background: '#FFF6EE', border: '1px solid #F7D9BE' }}>
            <p className="text-[11px] font-bold text-[var(--color-amber)] mb-1.5"><i className="fa-solid fa-wand-magic-sparkles mr-1" />Passt einer davon? (aus deinem Text erkannt)</p>
            <div className="flex flex-wrap gap-1.5">
              {textSuggestions.filter(t => !value.tags.includes(t.slug)).map(t => (
                <button key={t.slug} type="button" onClick={() => toggleTag(t.slug)} className={pillCls}
                  style={{ background: t.color, color: 'white', borderColor: t.color }}>+ {t.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* Ausgewählte Tags */}
        {value.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {value.tags.map(slug => {
              const t = tagBySlug(slug);
              return (
                <span key={slug} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: groupColor(t?.groups[0]), color: 'white' }}>
                  {t?.label ?? slug}
                  <button type="button" onClick={() => toggleTag(slug)} aria-label="Entfernen"><i className="fa-solid fa-xmark text-[10px]" /></button>
                </span>
              );
            })}
          </div>
        )}
        {atMax && <p className="text-[11px] text-[var(--color-lavender)] mb-2">Maximal {MAX_TAGS} Typen — entferne einen, um zu wechseln.</p>}

        <input value={tagSearch} onChange={e => setTagSearch(e.target.value)} placeholder="Typ suchen…"
          className="w-full rounded-xl px-3 py-2 text-sm outline-none bg-white" style={{ border: '1px solid #E4DCF0', color: '#34254C' }} />

        {/* F: Suche → Treffer · Gruppe offen → deren Typen · sonst 4 Gruppen mit Beispielen */}
        {tagSearch.trim() ? (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {searchResults.length === 0
              ? <p className="text-xs text-[var(--color-lavender)]">Kein Typ gefunden — beschreibe den Ort im vorigen Schritt genauer.</p>
              : searchResults.map(t => (
                <button key={t.slug} type="button" onClick={() => toggleTag(t.slug)} disabled={atMax && !value.tags.includes(t.slug)} className={pillCls} style={tagPillStyle(t.slug, t.groups[0])}>{t.label}</button>
              ))}
          </div>
        ) : openGroup ? (
          <div className="mt-3">
            <button type="button" onClick={() => setOpenGroup(null)} className="text-xs font-bold text-[var(--color-amber)] mb-2.5 inline-flex items-center gap-1">
              <i className="fa-solid fa-chevron-left text-[10px]" />Alle Gruppen
            </button>
            {/* Unterkategorien als Zwischenüberschrift — Fallback-Browsing, wenn die KI nichts vorschlägt */}
            <div className="flex flex-col gap-3">
              {subgroupsOf(openGroup).map(([sub, tags]) => (
                <div key={sub}>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-1.5">{sub}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map(t => (
                      <button key={t.slug} type="button" onClick={() => toggleTag(t.slug)} disabled={atMax && !value.tags.includes(t.slug)} className={pillCls} style={tagPillStyle(t.slug, openGroup)}>{t.label}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {vocab.groups.map(g => {
              // Nur zwei Beispiele je Hauptkategorie — nicht mit Text überladen.
              const examples = groupTags(g.slug).slice(0, 2).map(t => t.label).join(' · ');
              return (
                <button key={g.slug} type="button" onClick={() => setOpenGroup(g.slug)}
                  className="text-left rounded-2xl border-2 p-3 transition-all active:scale-[0.98]" style={{ borderColor: '#EFEAF5', background: 'white' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs flex-shrink-0" style={{ background: g.color }}><i className={`fa-solid ${g.icon}`} /></span>
                    <span className="text-xs font-bold" style={{ color: g.color }}>{shortGroup(g.label)}</span>
                  </div>
                  <p className="text-[10px] text-[var(--color-lavender)] leading-tight line-clamp-1">{examples}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {value.tags.length > 0 && (
        <>
          <TermSection title="Was gibt es dort? (Merkmale)" hint="Harte Fakten & Ausstattung."
            selected={value.merkmale} suggestions={sugg.merkmale.filter(m => !value.merkmale.includes(m.label))}
            query={mQuery} setQuery={setMQuery} combo={combo(vocab.merkmale, mQuery, value.merkmale)}
            placeholder="Merkmal suchen oder hinzufügen…" accent="#F99039"
            onToggle={label => set({ merkmale: toggle(value.merkmale, label) })} />

          <TermSection title="Wie fühlt es sich an? (Vibes)" hint="Die Atmosphäre — nur Adjektive (wie fühlt es sich an?)."
            selected={value.vibes} suggestions={sugg.vibes.filter(v => !value.vibes.includes(v.label))}
            query={vQuery} setQuery={setVQuery} combo={combo(vocab.vibes, vQuery, value.vibes)}
            placeholder={`Wie fühlst du dich dort? ${VIBE_HINTS[hintIdx]}`} accent="#8A6FB3"
            validateNew={looksLikeAdjective} invalidHint="Bitte ein Adjektiv (z.B. gemütlich, aufregend) — kein Hauptwort."
            onToggle={label => set({ vibes: toggle(value.vibes, label) })} />
        </>
      )}
    </div>
  );
}

function TermSection({ title, hint, selected, suggestions, query, setQuery, combo, placeholder, onToggle, accent, validateNew, invalidHint }: {
  title: string; hint: string; selected: string[]; suggestions: TaxTerm[];
  query: string; setQuery: (s: string) => void; combo: { label: string; isNew: boolean }[];
  placeholder: string; onToggle: (label: string) => void; accent: string;
  validateNew?: (s: string) => boolean; invalidHint?: string;
}) {
  const [warn, setWarn] = useState('');
  const add = (label: string, isNew: boolean) => {
    if (isNew && validateNew && !validateNew(label)) { setWarn(invalidHint ?? 'Ungültig.'); return; }
    setWarn(''); onToggle(label); setQuery('');
  };
  // Enter übernimmt die Eingabe: exakter Treffer aus der Liste, sonst als neuer Begriff (der dann
  // die Validierung durchläuft und ggf. den Hinweis zeigt). Vorher tat Enter gar nichts — deshalb
  // sah man den Adjektiv-Hinweis nie, wenn man einfach tippte und Enter drückte.
  const submitQuery = () => {
    const q = query.trim();
    if (!q) return;
    const exact = combo.find(r => !r.isNew && r.label.toLowerCase() === q.toLowerCase());
    if (exact) add(exact.label, false); else add(q, true);
  };
  return (
    <div>
      <p className="text-sm font-bold text-[var(--color-aubergine)] mb-0.5">{title}</p>
      <p className="text-xs text-[var(--color-lavender)] mb-3">{hint}</p>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {selected.map(label => (
            <span key={label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: accent, color: 'white' }}>
              {label}
              <button type="button" onClick={() => onToggle(label)} aria-label="Entfernen"><i className="fa-solid fa-xmark text-[10px]" /></button>
            </span>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {suggestions.map(s => (
            <button key={s.slug} type="button" onClick={() => onToggle(s.label)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95" style={{ background: 'white', color: '#71587a', borderColor: '#E4DCF0' }}>
              + {s.label}
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <input value={query} onChange={e => { setQuery(e.target.value); if (warn) setWarn(''); }} placeholder={placeholder}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitQuery(); } }}
          className="w-full rounded-xl px-3 py-2 text-sm outline-none bg-white" style={{ border: `1px solid ${warn ? '#E5484D' : '#E4DCF0'}`, color: '#34254C' }} />
        {/* Dropdown ausblenden, sobald ein Hinweis (z.B. „kein Adjektiv") steht — sonst verdeckt es ihn. */}
        {combo.length > 0 && !warn && (
          <div className="absolute z-10 left-0 right-0 mt-1 rounded-xl overflow-hidden bg-white" style={{ border: '1px solid #E4DCF0', boxShadow: '0 8px 24px rgba(52,37,76,0.15)' }}>
            {combo.map((r, i) => (
              <button key={i} type="button" onClick={() => add(r.label, r.isNew)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-bg-soft)] flex items-center gap-2">
                {r.isNew
                  ? <><i className="fa-solid fa-plus text-[var(--color-amber)] text-xs" /><span className="text-[var(--color-aubergine)]">„{r.label}" hinzufügen</span></>
                  : <span className="text-[var(--color-aubergine)]">{r.label}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {warn && <p className="text-xs text-[#C96442] mt-1.5"><i className="fa-solid fa-circle-info mr-1" />{warn}</p>}
    </div>
  );
}
