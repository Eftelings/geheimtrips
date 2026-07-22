import { useState } from 'react';
import { BottomSheet } from './BottomSheet.js';
import { mediaApi, placesApi } from '../../services/api.js';

/**
 * Eigenen Beitrag zu einem bestehenden Ort schreiben.
 *
 * Bewusst kurz gehalten: nur die vier Felder, die sich je Beitrag unterscheiden dürfen.
 * Alles andere (Tags, Öffnungszeiten, Lage …) gehört dem Ort und wird hier nicht erneut
 * gefragt. Highlights bestehen aus Titel, Text und Fotos.
 */
export interface ArticleDraft {
  short: string;
  long: string;
  trivia: string;
  highlights: { title: string; description: string; photos: string[] }[];
}

const EMPTY: ArticleDraft = { short: '', long: '', trivia: '', highlights: [] };

/** Absätze aus Zeilenumbrüchen — der Text wird als HTML gespeichert und gerendert. */
function toHtml(text: string): string {
  return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${p.replace(/\n/g, '<br>').replace(/</g, '&lt;').replace(/&lt;br&gt;/g, '<br>')}</p>`)
    .join('');
}
/** HTML zurück in einfachen Text, damit sich ein bestehender Beitrag bearbeiten lässt. */
function toText(html: string): string {
  return html
    .replace(/<\/p>\s*<p>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .trim();
}

export function ArticleSheet({ placeId, placeName, existing, onClose, onSaved }: {
  placeId: string;
  placeName: string;
  /** Vorhandener Beitrag zum Bearbeiten (id + Felder), sonst neu anlegen. */
  existing?: { id: number; short: string; long: string; triviaText: string; highlightsJson: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<ArticleDraft>(() => {
    if (!existing) return EMPTY;
    let highlights: ArticleDraft['highlights'] = [];
    try { highlights = JSON.parse(existing.highlightsJson) ?? []; } catch { /* leer lassen */ }
    return { short: existing.short, long: toText(existing.long), trivia: existing.triviaText, highlights };
  });
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const [upload, setUpload] = useState<number | null>(null);   // Index des Highlights, das gerade lädt

  const set = <K extends keyof ArticleDraft>(k: K, v: ArticleDraft[K]) => setDraft(d => ({ ...d, [k]: v }));
  const setHl = (i: number, patch: Partial<ArticleDraft['highlights'][number]>) =>
    setDraft(d => ({ ...d, highlights: d.highlights.map((h, j) => (j === i ? { ...h, ...patch } : h)) }));

  async function addPhoto(i: number, file: File) {
    setUpload(i);
    try {
      const { url } = await mediaApi.upload(file);
      setHl(i, { photos: [...draft.highlights[i].photos, url].slice(0, 6) });
    } catch { setError('Das Foto konnte nicht hochgeladen werden.'); }
    setUpload(null);
  }

  async function save() {
    setError('');
    if (draft.short.trim().length < 10) { setError('Die Kurzbeschreibung braucht mindestens 10 Zeichen.'); return; }
    const longHtml = toHtml(draft.long);
    if (longHtml.length < 50) { setError('Dein Text ist noch sehr kurz — schreib ein paar Sätze mehr.'); return; }
    setBusy(true);
    const payload = {
      short: draft.short.trim(),
      long: longHtml,
      trivia: draft.trivia.trim(),
      // Nur vollständige Highlights schicken — Titel und mindestens ein Foto.
      highlights: draft.highlights.filter(h => h.title.trim() && h.photos.length > 0),
    };
    try {
      if (existing) await placesApi.updateArticle(existing.id, payload);
      else await placesApi.createArticle(placeId, payload);
      onSaved();
    } catch (e) {
      setError((e as Error).message ?? 'Speichern fehlgeschlagen.');
    }
    setBusy(false);
  }

  const field = 'w-full border border-[var(--color-bg-soft)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-aubergine)] outline-none focus:border-[var(--color-amber)] resize-none';
  const label = 'text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-1 block';

  return (
    <BottomSheet open onClose={onClose} title={existing ? 'Beitrag bearbeiten' : `Dein Beitrag zu ${placeName}`}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-[var(--color-lavender)] leading-relaxed">
          Erzähl von deinem Besuch. Alles Sachliche — Kategorie, Öffnungszeiten, Lage — steht schon
          am Ort und bleibt unverändert. Dein Beitrag geht vor der Veröffentlichung in die Prüfung.
        </p>

        <div>
          <label className={label}>Das Besondere</label>
          <textarea className={field} rows={2} maxLength={400} value={draft.short}
            onChange={e => set('short', e.target.value)}
            placeholder="Was macht diesen Ort für dich besonders?" />
        </div>

        <div>
          <label className={label}>Dein Text</label>
          <textarea className={field} rows={8} value={draft.long}
            onChange={e => set('long', e.target.value)}
            placeholder="Wie war es dort? Leerzeile lässt einen neuen Absatz beginnen." />
        </div>

        <div>
          <label className={label}>Wusstest du schon? <span className="normal-case font-normal">(optional)</span></label>
          <textarea className={field} rows={2} maxLength={1200} value={draft.trivia}
            onChange={e => set('trivia', e.target.value)}
            placeholder="Eine Kleinigkeit, die kaum jemand weiß." />
        </div>

        {/* Highlights: Titel, Text, Fotos */}
        <div>
          <label className={label}>Das solltest du sehen <span className="normal-case font-normal">(optional)</span></label>
          <div className="flex flex-col gap-3">
            {draft.highlights.map((h, i) => (
              <div key={i} className="rounded-2xl border border-[var(--color-bg-soft)] p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input className={`${field} flex-1`} value={h.title} maxLength={120}
                    onChange={e => setHl(i, { title: e.target.value })} placeholder="Titel" />
                  <button onClick={() => set('highlights', draft.highlights.filter((_, j) => j !== i))}
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[var(--color-lavender)]"
                    aria-label="Entfernen">
                    <i className="fa-solid fa-trash text-sm" />
                  </button>
                </div>
                <textarea className={field} rows={2} maxLength={600} value={h.description}
                  onChange={e => setHl(i, { description: e.target.value })} placeholder="Kurz beschreiben" />
                <div className="flex flex-wrap gap-2">
                  {h.photos.map((u, j) => (
                    <span key={j} className="relative w-16 h-16 rounded-xl overflow-hidden">
                      <img src={u} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setHl(i, { photos: h.photos.filter((_, k) => k !== j) })}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/55 text-white text-[10px] flex items-center justify-center"
                        aria-label="Foto entfernen">
                        <i className="fa-solid fa-xmark" />
                      </button>
                    </span>
                  ))}
                  {h.photos.length < 6 && (
                    <label className="w-16 h-16 rounded-xl border-2 border-dashed border-[var(--color-bg-soft)] flex items-center justify-center cursor-pointer text-[var(--color-lavender-lt)]">
                      {upload === i
                        ? <i className="fa-solid fa-circle-notch fa-spin" />
                        : <i className="fa-solid fa-plus" />}
                      <input type="file" accept="image/*" hidden
                        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addPhoto(i, f); }} />
                    </label>
                  )}
                </div>
                {!h.photos.length && (
                  <p className="text-[11px] text-[var(--color-lavender-lt)]">Ohne Foto wird dieses Highlight nicht übernommen.</p>
                )}
              </div>
            ))}
            <button onClick={() => set('highlights', [...draft.highlights, { title: '', description: '', photos: [] }])}
              className="text-xs font-bold text-[var(--color-amber)] py-1.5 text-left">
              <i className="fa-solid fa-plus mr-1.5" />Highlight hinzufügen
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}

        <button onClick={save} disabled={busy}
          className="w-full bg-[var(--color-amber)] text-white font-bold py-3 rounded-xl text-sm shadow-[var(--shadow-amber)] disabled:opacity-50">
          {busy ? 'Speichern…' : existing ? 'Änderungen zur Prüfung geben' : 'Beitrag zur Prüfung geben'}
        </button>
      </div>
    </BottomSheet>
  );
}
