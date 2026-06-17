import { useEffect, useState } from 'react';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type AdminCategory } from '../../services/adminApi.js';

const EMPTY: Omit<AdminCategory, 'id'> = {
  slug: '', label: '', icon: 'fa-tag', color: '#71587A', keywords: '', sort: 0, active: true,
};

export function AdminCategories() {
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminCategory | (Omit<AdminCategory, 'id'> & { id?: number }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function load() { setCats(await adminApi.categories()); setLoading(false); }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing) return;
    setSaving(true); setErr('');
    try {
      if ('id' in editing && editing.id != null) await adminApi.updateCategory(editing.id, editing);
      else await adminApi.createCategory(editing);
      setEditing(null);
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  async function remove(id: number) {
    if (!confirm('Kategorie löschen? Orte behalten ihre Zuordnung, der Filter-Chip verschwindet nur.')) return;
    await adminApi.deleteCategory(id);
    await load();
  }

  const field = 'w-full bg-[#1a1228] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-amber)]';
  const label = 'text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1 block';

  return (
    <AdminLayout title={`Kategorien (${cats.length})`}>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-white/50 max-w-xl">
          Haupt-Kategorien für den Filter auf Startseite & Sammlung. <strong className="text-white/70">slug</strong> entspricht
          dem Kategorie-Wert der Orte; <strong className="text-white/70">Stichwörter</strong> fangen zusätzlich passende Orte ein.
        </p>
        <button onClick={() => { setEditing({ ...EMPTY, sort: cats.length }); setErr(''); }}
          className="bg-[var(--color-amber)] text-black font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2 flex-shrink-0">
          <i className="fa-solid fa-plus" /> Kategorie anlegen
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-white/30"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>
      ) : (
        <div className="grid gap-2">
          {cats.map(c => (
            <div key={c.id} className="bg-[#1a1228] border border-white/8 rounded-2xl p-4 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                style={{ background: (c.color ?? '#71587A') + '22', color: c.color ?? '#fff' }}>
                <i className={`fa-solid ${c.icon}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{c.label}</span>
                  <span className="text-[11px] text-white/30 font-mono">{c.slug}</span>
                  {!c.active && <span className="text-[10px] bg-white/10 text-white/40 px-1.5 py-0.5 rounded">inaktiv</span>}
                </div>
                {c.keywords && <div className="text-xs text-white/40 mt-0.5 truncate">Stichwörter: {c.keywords}</div>}
              </div>
              <span className="text-white/20 text-xs">#{c.sort}</span>
              <button onClick={() => { setEditing(c); setErr(''); }} className="text-white/40 hover:text-[var(--color-amber)] px-2"><i className="fa-solid fa-pen" /></button>
              <button onClick={() => remove(c.id)} className="text-white/40 hover:text-red-400 px-2"><i className="fa-solid fa-trash-can" /></button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="bg-[#0f0b1a] border border-white/10 rounded-2xl w-full max-w-md p-6">
            <h2 className="font-bold text-white text-lg mb-4">{'id' in editing && editing.id ? 'Kategorie bearbeiten' : 'Neue Kategorie'}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label}>Name</label>
                <input className={field} value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} placeholder="Wellness" /></div>
              <div><label className={label}>slug</label>
                <input className={field} value={editing.slug} onChange={e => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="wellness" /></div>
              <div><label className={label}>Icon (FontAwesome)</label>
                <input className={field} value={editing.icon} onChange={e => setEditing({ ...editing, icon: e.target.value })} placeholder="fa-spa" /></div>
              <div><label className={label}>Farbe</label>
                <input type="color" className={`${field} h-9 p-1`} value={editing.color ?? '#71587A'} onChange={e => setEditing({ ...editing, color: e.target.value })} /></div>
              <div className="col-span-2"><label className={label}>Stichwörter (kommagetrennt)</label>
                <input className={field} value={editing.keywords ?? ''} onChange={e => setEditing({ ...editing, keywords: e.target.value })} placeholder="therme, spa, sauna" /></div>
              <div><label className={label}>Reihenfolge</label>
                <input type="number" className={field} value={editing.sort} onChange={e => setEditing({ ...editing, sort: Number(e.target.value) })} /></div>
              <div className="flex items-end gap-2 pb-1.5">
                <input type="checkbox" id="catactive" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} />
                <label htmlFor="catactive" className="text-sm text-white/60">Aktiv</label>
              </div>
            </div>
            {editing.icon && (
              <div className="mt-3 flex items-center gap-2 text-xs text-white/40">
                Vorschau: <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[#34254c] font-semibold">
                  <i className={`fa-solid ${editing.icon} text-[10px]`} style={{ color: editing.color ?? undefined }} />{editing.label || 'Name'}
                </span>
              </div>
            )}
            {err && <p className="text-red-400 text-xs mt-3">{err}</p>}
            <div className="flex gap-2 mt-5">
              <button onClick={save} disabled={saving || !editing.label || !editing.slug}
                className="flex-1 bg-[var(--color-amber)] text-black font-bold py-2.5 rounded-xl text-sm disabled:opacity-50">
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
              <button onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-xl text-sm text-white/50 hover:text-white">Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
