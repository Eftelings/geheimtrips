import { useEffect, useMemo, useState } from 'react';
import { taxonomyApi } from '../../services/api.js';
import type { TaxVocab, TaxTerm } from '../../services/api.js';

export interface TaxonomyValue { tag: string | null; tagLabel: string | null; merkmale: string[]; vibes: string[] }

const VIBE_HINTS = ['z.B. gemütlich', 'z.B. aufregend', 'z.B. romantisch', 'z.B. mystisch', 'z.B. entspannt', 'z.B. lebhaft'];

/**
 * Anlege-Auswahl im neuen Modell: Tag (Typ) → gemappte Merkmale & Vibes als Pills
 * + Combobox mit Freitext-Eingabe (UGC). Werte sind Labels; das Backend (resolve)
 * ordnet sie bestehenden zu oder legt neue (zur Prüfung) an.
 */
export function TaxonomyPicker({ value, onChange }: { value: TaxonomyValue; onChange: (v: TaxonomyValue) => void }) {
  const [vocab, setVocab] = useState<TaxVocab | null>(null);
  const [sugg, setSugg] = useState<{ merkmale: TaxTerm[]; vibes: TaxTerm[] }>({ merkmale: [], vibes: [] });
  const [tagSearch, setTagSearch] = useState('');
  const [mQuery, setMQuery] = useState('');
  const [vQuery, setVQuery] = useState('');
  const [hintIdx, setHintIdx] = useState(0);

  useEffect(() => { taxonomyApi.vocab().then(setVocab).catch(() => {}); }, []);
  useEffect(() => {
    if (value.tag) taxonomyApi.suggestions(value.tag).then(setSugg).catch(() => {});
    else setSugg({ merkmale: [], vibes: [] });
  }, [value.tag]);
  useEffect(() => { const t = setInterval(() => setHintIdx(i => (i + 1) % VIBE_HINTS.length), 2200); return () => clearInterval(t); }, []);

  const set = (patch: Partial<TaxonomyValue>) => onChange({ ...value, ...patch });
  const toggle = (arr: string[], label: string) => arr.includes(label) ? arr.filter(x => x !== label) : [...arr, label];

  const tagsByGroup = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    const map: Record<string, { slug: string; label: string }[]> = {};
    (vocab?.tags ?? []).filter(t => !q || t.label.toLowerCase().includes(q)).forEach(t =>
      t.groups.forEach(g => { (map[g] ??= []).push(t); }));
    return map;
  }, [vocab, tagSearch]);

  const combo = (all: TaxTerm[], query: string, selected: string[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as { label: string; isNew: boolean }[];
    const out = all.filter(t => t.label.toLowerCase().includes(q) && !selected.includes(t.label)).slice(0, 8)
      .map(m => ({ label: m.label, isNew: false }));
    const exact = all.some(t => t.label.toLowerCase() === q) || selected.some(s => s.toLowerCase() === q);
    if (!exact) out.push({ label: query.trim(), isNew: true });
    return out;
  };

  if (!vocab) return <div className="py-8 text-center text-[var(--color-lavender)]"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>;

  return (
    <div className="flex flex-col gap-6">
      {/* ── TAG ── */}
      <div>
        <p className="text-sm font-bold text-[var(--color-aubergine)] mb-0.5">Was ist das für ein Ort?</p>
        <p className="text-xs text-[var(--color-lavender)] mb-3">Wähle den passenden Typ (Tag).</p>
        <input value={tagSearch} onChange={e => setTagSearch(e.target.value)} placeholder="Tag suchen…"
          className="w-full mb-3 rounded-xl px-3 py-2 text-sm outline-none bg-white" style={{ border: '1px solid #E4DCF0', color: '#34254C' }} />
        <div className="flex flex-col gap-3">
          {vocab.groups.map(g => {
            const list = tagsByGroup[g.slug] ?? [];
            if (!list.length) return null;
            return (
              <div key={g.slug}>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: g.color }}>{g.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {list.map(t => {
                    const on = value.tag === t.slug;
                    return (
                      <button key={t.slug + g.slug} type="button" onClick={() => set({ tag: t.slug, tagLabel: t.label })}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95"
                        style={on ? { background: g.color, color: 'white', borderColor: g.color } : { background: 'white', color: '#71587a', borderColor: '#E4DCF0' }}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {value.tag && (
        <>
          <TermSection title="Was gibt es dort? (Merkmale)" hint="Harte Fakten & Ausstattung."
            selected={value.merkmale} suggestions={sugg.merkmale.filter(m => !value.merkmale.includes(m.label))}
            query={mQuery} setQuery={setMQuery} combo={combo(vocab.merkmale, mQuery, value.merkmale)}
            placeholder="Merkmal suchen oder hinzufügen…" accent="#F99039"
            onToggle={label => { set({ merkmale: toggle(value.merkmale, label) }); }} />

          <TermSection title="Wie fühlt es sich an? (Vibes)" hint="Die Atmosphäre — beschreibe sie mit einem Gefühl."
            selected={value.vibes} suggestions={sugg.vibes.filter(v => !value.vibes.includes(v.label))}
            query={vQuery} setQuery={setVQuery} combo={combo(vocab.vibes, vQuery, value.vibes)}
            placeholder={`Wie fühlst du dich dort? ${VIBE_HINTS[hintIdx]}`} accent="#8A6FB3"
            onToggle={label => { set({ vibes: toggle(value.vibes, label) }); }} />
        </>
      )}
    </div>
  );
}

function TermSection({ title, hint, selected, suggestions, query, setQuery, combo, placeholder, onToggle, accent }: {
  title: string; hint: string; selected: string[]; suggestions: TaxTerm[];
  query: string; setQuery: (s: string) => void; combo: { label: string; isNew: boolean }[];
  placeholder: string; onToggle: (label: string) => void; accent: string;
}) {
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
              className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95"
              style={{ background: 'white', color: '#71587a', borderColor: '#E4DCF0' }}>
              + {s.label}
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder}
          className="w-full rounded-xl px-3 py-2 text-sm outline-none bg-white" style={{ border: '1px solid #E4DCF0', color: '#34254C' }} />
        {combo.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 rounded-xl overflow-hidden bg-white" style={{ border: '1px solid #E4DCF0', boxShadow: '0 8px 24px rgba(52,37,76,0.15)' }}>
            {combo.map((r, i) => (
              <button key={i} type="button" onClick={() => { onToggle(r.label); setQuery(''); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-bg-soft)] flex items-center gap-2">
                {r.isNew
                  ? <><i className="fa-solid fa-plus text-[var(--color-amber)] text-xs" /><span className="text-[var(--color-aubergine)]">„{r.label}" hinzufügen</span></>
                  : <span className="text-[var(--color-aubergine)]">{r.label}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
