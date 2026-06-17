import { useEffect, useState } from 'react';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type AdminAuthor } from '../../services/adminApi.js';

const COLORS = ['#8A6FB3','#5B8F6E','#D97757','#C9A227','#F99039','#71587A','#4A8C7A'];

export function AdminAuthors() {
  const [authors, setAuthors] = useState<AdminAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ name:'', handle:'', bio:'', instagram:'', tiktok:'', website:'', avatarColor: COLORS[0] });
  const [saving, setSaving]  = useState(false);

  async function load() {
    const a = await adminApi.authors();
    setAuthors(a); setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await adminApi.createAuthor(f);
    setCreating(false);
    setF({ name:'', handle:'', bio:'', instagram:'', tiktok:'', website:'', avatarColor: COLORS[0] });
    load();
    setSaving(false);
  }

  return (
    <AdminLayout title={`Autoren (${authors.length})`}>
      <div className="flex justify-end mb-5">
        <button onClick={() => setCreating(true)}
          className="bg-[var(--color-amber)] text-black font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2">
          <i className="fa-solid fa-plus" /> Autor:in hinzufügen
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-white/30">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {authors.map(a => (
            <div key={a.id} className="bg-white/5 border border-white/8 rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-base flex-shrink-0"
                  style={{ backgroundColor: a.avatarColor }}>
                  {a.name[0]}
                </div>
                <div>
                  <div className="font-semibold text-white/90">{a.name}</div>
                  <div className="text-xs text-white/40">@{a.handle}</div>
                </div>
              </div>
              {a.bio && <p className="text-xs text-white/50 mb-2 line-clamp-2">{a.bio}</p>}
              <div className="flex gap-2 text-white/30 text-xs">
                {a.instagram && <span><i className="fa-brands fa-instagram" /> {a.instagram}</span>}
                {a.tiktok && <span><i className="fa-brands fa-tiktok" /> {a.tiktok}</span>}
              </div>
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5 text-[10px] text-white/30">
                <span><i className="fa-solid fa-map-pin text-white/20 mr-1" />{a.placeCount} Orte</span>
                <span><i className="fa-solid fa-star text-[var(--color-amber)] mr-1" />{a.avgStars.toFixed(1)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#1a1228] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <h2 className="font-bold text-white">Neue:r Autor:in</h2>
              <button onClick={() => setCreating(false)} className="text-white/40 hover:text-white">✕</button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-3">
              {(['name','handle','bio','instagram','tiktok','website'] as const).map(k => (
                <div key={k}>
                  <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">{k}</label>
                  <input value={f[k]} onChange={e => setF(p => ({ ...p, [k]: e.target.value }))}
                    required={k === 'name' || k === 'handle'}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-amber)]" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Avatar-Farbe</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setF(p => ({ ...p, avatarColor: c }))}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-lg transition-all ${f.avatarColor === c ? 'ring-2 ring-white scale-110' : ''}`} />
                  ))}
                </div>
              </div>
              <button type="submit" disabled={saving}
                className="w-full bg-[var(--color-amber)] text-black font-bold py-2.5 rounded-xl text-sm disabled:opacity-50 mt-2">
                {saving ? 'Speichern…' : 'Autor:in erstellen'}
              </button>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
