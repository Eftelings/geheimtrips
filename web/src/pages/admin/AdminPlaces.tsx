import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type AdminPlace } from '../../services/adminApi.js';
import { placesApi } from '../../services/api.js';
import { ArticleSheet } from '../../components/ui/ArticleSheet.js';
import { useTaxVocab, tagInfoFrom } from '../../data/taxVocab.js';

/**
 * Alle Orte auf einen Blick. Bearbeitet wird nicht in einem verkürzten Formular,
 * sondern immer durch den vollständigen Ablauf: der Hauptbeitrag über den
 * Einreichen-Assistenten, zusätzliche Beiträge über dasselbe Formular, das auch
 * ihre Autor:innen benutzen.
 */
export function AdminPlaces() {
  const navigate = useNavigate();
  const vocab = useTaxVocab();
  const [places, setPlaces]   = useState<AdminPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'place'; id: string; name: string } | { kind: 'article'; id: number; name: string } | null>(null);
  // Welcher Beitrag je Ort im Dropdown gewählt ist (0 = Hauptbeitrag)
  const [pick, setPick] = useState<Record<string, number>>({});
  // Zusatzbeitrag im selben Formular bearbeiten, das auch die Autor:innen nutzen
  const [editArticle, setEditArticle] = useState<{
    placeId: string; placeName: string;
    article: { id: number; short: string; long: string; triviaText: string; highlightsJson: string };
  } | null>(null);

  async function load() {
    setLoading(true);
    const p = await adminApi.places().catch(() => [] as AdminPlace[]);
    setPlaces(p); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function removePlace(id: string) {
    try { await adminApi.deletePlace(id); }
    catch (e) { alert(`Löschen fehlgeschlagen: ${(e as Error).message}`); }
    finally { setConfirm(null); load(); }
  }
  async function removeArticle(id: number) {
    try { await placesApi.deleteArticle(id); }
    catch (e) { alert(`Löschen fehlgeschlagen: ${(e as Error).message}`); }
    finally { setConfirm(null); load(); }
  }

  /** Beitrag bearbeiten — Hauptbeitrag im Assistenten, Zusatzbeitrag im kurzen Formular. */
  async function edit(p: AdminPlace, articleId: number) {
    if (articleId === 0) { navigate(`/einreichen?edit=${p.id}`); return; }
    // Die Felder stehen nicht in der Liste — frisch vom Ort holen.
    const fresh = await placesApi.get(p.id).catch(() => null);
    const found = fresh?.articles?.find(a => a.id === articleId);
    if (!found) { alert('Dieser Beitrag ist gerade nicht abrufbar (vielleicht noch in Prüfung).'); return; }
    setEditArticle({
      placeId: p.id, placeName: p.name,
      article: { id: found.id, short: found.short, long: found.long, triviaText: found.triviaText, highlightsJson: found.highlightsJson },
    });
  }

  const filtered = places.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
    || p.region.toLowerCase().includes(search.toLowerCase())
    || p.id.toLowerCase().includes(search.toLowerCase())
  );

  const th = 'px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap';

  return (
    <AdminLayout title={`Orte (${places.length})`}>
      <div className="flex items-center gap-3 mb-5">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche nach Name, Region oder ID…"
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[var(--color-amber)]" />
        <button onClick={() => navigate('/einreichen')}
          className="bg-[var(--color-amber)] text-black font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2 whitespace-nowrap">
          <i className="fa-solid fa-plus" /> Ort hinzufügen
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-white/30">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl" />
        </div>
      ) : (
        <div className="bg-white/5 border border-white/8 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="border-b border-white/8">
                {['Bild', 'Name', 'Koordinaten', 'Region', 'Kategorien', 'Bewertung', 'Autor', ''].map((h, i) => (
                  <th key={i} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const sel = pick[p.id] ?? 0;
                const articles = p.articles ?? [];
                const tags = p.tagSlugs?.length ? p.tagSlugs : (p.tagSlug ? [p.tagSlug] : []);
                const labels = tags.map(t => tagInfoFrom(vocab, t)?.label ?? t);
                return (
                  <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors align-top">
                    <td className="px-4 py-3 w-12">
                      <img src={p.hero} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => navigate(`/ort/${p.id}`)}
                        className="font-medium text-white/90 hover:text-[var(--color-amber)] transition-colors text-left">
                        {p.name}
                      </button>
                      <div className="text-xs text-white/30 font-mono">{p.id}</div>
                    </td>
                    <td className="px-4 py-3 text-white/50 text-xs font-mono whitespace-nowrap">
                      {p.lat != null && p.lng != null
                        ? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`
                        : <span className="text-red-400/70">fehlt</span>}
                    </td>
                    <td className="px-4 py-3 text-white/60 text-xs">{p.region}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {labels.length === 0 && <span className="text-white/30 text-xs">—</span>}
                        {labels.map(l => (
                          <span key={l} className="bg-white/10 text-white/70 text-[10px] px-2 py-0.5 rounded-full">{l}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-[var(--color-amber)] text-xs font-semibold">★ {p.rating}</span>
                      <span className="text-white/30 text-xs ml-1">({p.reviews})</span>
                    </td>
                    <td className="px-4 py-3">
                      {/* Dropdown über alle Beiträge — die Auswahl bestimmt, was bearbeitet
                          oder gelöscht wird. Der Hauptbeitrag gehört der entdeckenden Person. */}
                      <select value={sel} onChange={e => setPick(s => ({ ...s, [p.id]: Number(e.target.value) }))}
                        className="bg-black/25 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80 outline-none focus:border-[var(--color-amber)] max-w-[190px]">
                        {articles.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.authorName}{a.isMain ? ' (Hauptbeitrag)' : a.status !== 'approved' ? ` (${a.status === 'pending' ? 'in Prüfung' : 'abgelehnt'})` : ''}
                          </option>
                        ))}
                      </select>
                      {articles.length > 1 && (
                        <div className="text-[10px] text-white/30 mt-1">{articles.length} Beiträge</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => edit(p, sel)}
                          title={sel === 0 ? 'Hauptbeitrag im Assistenten bearbeiten' : 'Beitrag bearbeiten'}
                          className="p-1.5 bg-[var(--color-amber)]/15 hover:bg-[var(--color-amber)]/30 rounded-lg text-[var(--color-amber)] transition-colors">
                          <i className="fa-solid fa-pen text-xs" />
                        </button>
                        <button onClick={() => setConfirm(sel === 0
                          ? { kind: 'place', id: p.id, name: p.name }
                          : { kind: 'article', id: sel, name: `${articles.find(a => a.id === sel)?.authorName ?? 'Beitrag'} · ${p.name}` })}
                          title={sel === 0 ? 'Ort löschen' : 'Diesen Beitrag löschen'}
                          className="p-1.5 bg-white/5 hover:bg-red-500/20 rounded-lg text-white/50 hover:text-red-400 transition-colors">
                          <i className="fa-solid fa-trash text-xs" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-8 text-white/30 text-sm">Keine Orte gefunden.</div>
          )}
        </div>
      )}

      {/* Zusatzbeitrag bearbeiten — dasselbe Formular wie für die Autor:innen */}
      {editArticle && (
        <ArticleSheet placeId={editArticle.placeId} placeName={editArticle.placeName}
          existing={editArticle.article}
          onClose={() => setEditArticle(null)}
          onSaved={() => { setEditArticle(null); load(); }} />
      )}

      {/* Löschen bestätigen */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1228] border border-white/10 rounded-2xl p-6 w-80 shadow-2xl text-center">
            <i className="fa-solid fa-triangle-exclamation text-red-400 text-3xl mb-3" />
            <p className="text-white font-semibold mb-1">
              {confirm.kind === 'place' ? 'Ort löschen?' : 'Beitrag löschen?'}
            </p>
            <p className="text-white/50 text-sm mb-4">
              {confirm.kind === 'place'
                ? 'Der Ort und alle Beiträge dazu verschwinden. Das lässt sich nicht rückgängig machen.'
                : `„${confirm.name}" wird entfernt. Der Ort selbst bleibt bestehen.`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => (confirm.kind === 'place' ? removePlace(confirm.id) : removeArticle(confirm.id))}
                className="flex-1 bg-red-500 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-red-600">
                Löschen
              </button>
              <button onClick={() => setConfirm(null)}
                className="flex-1 bg-white/5 text-white/70 py-2.5 rounded-xl text-sm hover:bg-white/10">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
