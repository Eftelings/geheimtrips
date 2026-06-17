import { useEffect, useState } from 'react';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type AdminPlace, type AdminAuthor } from '../../services/adminApi.js';

const CATEGORIES = ['natur','kultur','genuss','aktiv','mystisch','wasser'];
const CATEGORY_LABELS: Record<string,string> = { natur:'Natur', kultur:'Kultur', genuss:'Genuss', aktiv:'Aktiv', mystisch:'Mystisch', wasser:'Am Wasser' };

function PlaceForm({ place, authors, onSave, onCancel }: {
  place?: AdminPlace | null;
  authors: AdminAuthor[];
  onSave: (data: object, isNew: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const isNew = !place;
  const [f, setF] = useState({
    id: place?.id ?? '', name: place?.name ?? '', region: place?.region ?? '',
    category: place?.category ?? 'natur', categoryLabel: place?.categoryLabel ?? 'Natur',
    short: place?.short ?? '', long: place?.long ?? '', hero: place?.hero ?? '',
    cost: place?.cost ?? 1, costLabel: place?.costLabel ?? '€',
    distanceMin: place?.distanceMin ?? 30, distanceLabel: place?.distanceLabel ?? '30 Min',
    lat: place?.lat ?? null, lng: place?.lng ?? null,
    authorId: place?.authorId ?? null,
    vibe: (place?.vibe ?? []).join(', '),
    gallery: (place?.gallery ?? []).join('\n'),
    tips: (place?.tips ?? []).join('\n'),
    parking: place?.parking ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await onSave({
        ...f,
        vibe:    f.vibe.split(',').map(s => s.trim()).filter(Boolean),
        gallery: f.gallery.split('\n').map(s => s.trim()).filter(Boolean),
        tips:    f.tips.split('\n').map(s => s.trim()).filter(Boolean),
        parking: f.parking || null,
      }, isNew);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  }

  const field = (label: string, key: keyof typeof f, opts?: { textarea?: boolean; type?: string; required?: boolean }) => (
    <div key={key}>
      <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">{label}</label>
      {opts?.textarea ? (
        <textarea value={f[key] as string} onChange={e => setF(p => ({ ...p, [key]: e.target.value }))}
          rows={3} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-amber)] resize-none" />
      ) : (
        <input type={opts?.type ?? 'text'} value={f[key] as string} required={opts?.required}
          onChange={e => setF(p => ({ ...p, [key]: opts?.type === 'number' ? Number(e.target.value) : e.target.value }))}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-amber)]" />
      )}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-4">
        {isNew && field('ID (URL-Slug)', 'id', { required: true })}
        {field('Name', 'name', { required: true })}
        {field('Region', 'region', { required: true })}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">Kategorie</label>
          <select value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value, categoryLabel: CATEGORY_LABELS[e.target.value] }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none">
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">Autor</label>
          <select value={f.authorId ?? ''} onChange={e => setF(p => ({ ...p, authorId: e.target.value ? Number(e.target.value) : null }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none">
            <option value="">— kein Autor —</option>
            {authors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {field('Kurzbeschreibung', 'short', { required: true })}
      {field('Langbeschreibung', 'long', { textarea: true })}
      {field('Hero-Bild URL', 'hero', { required: true })}

      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">Kosten (1-3)</label>
          <select value={f.cost} onChange={e => {
            const v = Number(e.target.value);
            const labels: Record<number,string> = {1:'€',2:'€€',3:'€€€'};
            setF(p => ({ ...p, cost: v, costLabel: labels[v] }));
          }} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none">
            <option value={1}>€ Kostenlos/günstig</option>
            <option value={2}>€€ Moderat</option>
            <option value={3}>€€€ Teurer</option>
          </select>
        </div>
        {field('Distanz (Min)', 'distanceMin', { type: 'number' })}
        {field('Distanz Label', 'distanceLabel')}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {field('Latitude', 'lat', { type: 'number' })}
        {field('Longitude', 'lng', { type: 'number' })}
      </div>

      {field('Vibes (komma-getrennt)', 'vibe')}
      {field('Galerie-URLs (eine pro Zeile)', 'gallery', { textarea: true })}
      {field('Tipps (eine pro Zeile)', 'tips', { textarea: true })}

      <div>
        <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">
          Parkmöglichkeiten
        </label>
        <select value={f.parking} onChange={e => setF(p => ({ ...p, parking: e.target.value }))}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-amber)]">
          <option value="">— nicht angegeben —</option>
          <option value="free">Kostenlos</option>
          <option value="paid">Kostenpflichtig</option>
          <option value="limited">Begrenzt / schwierig</option>
        </select>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving}
          className="flex-1 bg-[var(--color-amber)] text-black font-bold py-2.5 rounded-xl text-sm disabled:opacity-50">
          {saving ? 'Speichern…' : isNew ? 'Ort erstellen' : 'Änderungen speichern'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2.5 bg-white/5 text-white/60 rounded-xl text-sm hover:bg-white/10">
          Abbrechen
        </button>
      </div>
    </form>
  );
}

export function AdminPlaces() {
  const [places, setPlaces]   = useState<AdminPlace[]>([]);
  const [authors, setAuthors] = useState<AdminAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminPlace | null | 'new'>(null);
  const [search, setSearch]   = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);

  async function load() {
    const [p, a] = await Promise.all([adminApi.places(), adminApi.authors()]);
    setPlaces(p); setAuthors(a); setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave(data: object, isNew: boolean) {
    if (isNew) await adminApi.createPlace(data);
    else       await adminApi.updatePlace((editing as AdminPlace).id, data);
    setEditing(null);
    load();
  }

  async function handleDelete(id: string) {
    try {
      await adminApi.deletePlace(id);
    } catch (e) {
      alert(`Löschen fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setConfirm(null);
      load();
    }
  }

  const filtered = places.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.region.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout title={`Orte (${places.length})`}>
      <div className="flex items-center gap-3 mb-5">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche…"
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[var(--color-amber)]" />
        <button onClick={() => setEditing('new')}
          className="bg-[var(--color-amber)] text-black font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2">
          <i className="fa-solid fa-plus" /> Ort hinzufügen
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-white/30">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl" />
        </div>
      ) : (
        <div className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                {['Bild','Name','Region','Kat.','Kosten','Bewertung','Aktionen'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3 w-12">
                    <img src={p.hero} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white/90">{p.name}</div>
                    <div className="text-xs text-white/30 font-mono">{p.id}</div>
                  </td>
                  <td className="px-4 py-3 text-white/60 text-xs">{p.region}</td>
                  <td className="px-4 py-3">
                    <span className="bg-white/10 text-white/70 text-[10px] px-2 py-0.5 rounded-full">{p.categoryLabel}</span>
                  </td>
                  <td className="px-4 py-3 text-white/60 text-xs">{p.costLabel}</td>
                  <td className="px-4 py-3">
                    <span className="text-[var(--color-amber)] text-xs font-semibold">★ {p.rating}</span>
                    <span className="text-white/30 text-xs ml-1">({p.reviews})</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => setEditing(p)}
                        className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors">
                        <i className="fa-solid fa-pen text-xs" />
                      </button>
                      <button onClick={() => setConfirm(p.id)}
                        className="p-1.5 bg-white/5 hover:bg-red-500/20 rounded-lg text-white/50 hover:text-red-400 transition-colors">
                        <i className="fa-solid fa-trash text-xs" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-8 text-white/30 text-sm">Keine Orte gefunden.</div>
          )}
        </div>
      )}

      {/* Edit/Create Overlay */}
      {editing !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1a1228] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
              <h2 className="font-bold text-white">{editing === 'new' ? 'Neuer Ort' : `Bearbeiten: ${(editing as AdminPlace).name}`}</h2>
              <button onClick={() => setEditing(null)} className="text-white/40 hover:text-white text-lg">✕</button>
            </div>
            <div className="p-6">
              <PlaceForm
                place={editing === 'new' ? null : editing as AdminPlace}
                authors={authors}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1228] border border-white/10 rounded-2xl p-6 w-80 shadow-2xl text-center">
            <i className="fa-solid fa-triangle-exclamation text-red-400 text-3xl mb-3" />
            <p className="text-white font-semibold mb-1">Ort löschen?</p>
            <p className="text-white/50 text-sm mb-4">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(confirm)}
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
