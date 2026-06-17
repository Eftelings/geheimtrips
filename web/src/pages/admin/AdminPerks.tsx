import { useEffect, useState } from 'react';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type AdminPerk } from '../../services/adminApi.js';

const BOARDS = [
  { id: 'orte',   label: 'Besuchte Orte' },
  { id: 'quiz',   label: 'Geheimquiz' },
  { id: 'punkte', label: 'Geheimtripspunkte' },
] as const;

const EMPTY: Omit<AdminPerk, 'id'> = {
  board: 'quiz', minRank: 1, maxRank: 50, partner: '', title: '',
  discount: '', logoUrl: '', terms: '', redeemUrl: '', validUntil: '', active: true, sort: 0,
};

export function AdminPerks() {
  const [perks, setPerks] = useState<AdminPerk[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminPerk | (Omit<AdminPerk, 'id'> & { id?: number }) | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() { setPerks(await adminApi.perks()); setLoading(false); }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const payload = { ...editing };
      if ('id' in editing && editing.id != null) await adminApi.updatePerk(editing.id, payload);
      else await adminApi.createPerk(payload);
      setEditing(null);
      await load();
    } finally { setSaving(false); }
  }

  async function remove(id: number) {
    if (!confirm('Diesen Vorteil wirklich löschen?')) return;
    await adminApi.deletePerk(id);
    await load();
  }

  const field = 'w-full bg-[#1a1228] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-amber)]';
  const label = 'text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1 block';
  const boardLabel = (b: string) => BOARDS.find(x => x.id === b)?.label ?? b;

  return (
    <AdminLayout title={`Vorteile (${perks.length})`}>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-white/50 max-w-xl">
          Partner-Vorteile je Ranking. Nutzer:innen sehen einen Vorteil, wenn ihr Rang im angegebenen
          Bereich liegt (z.&nbsp;B. <strong className="text-white/70">Geheimquiz, Rang 1–50</strong>).
        </p>
        <button onClick={() => setEditing({ ...EMPTY })}
          className="bg-[var(--color-amber)] text-black font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2 flex-shrink-0">
          <i className="fa-solid fa-plus" /> Vorteil anlegen
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-white/30"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>
      ) : (
        <div className="grid gap-3">
          {perks.map(p => (
            <div key={p.id} className="bg-[#1a1228] border border-white/8 rounded-2xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {p.logoUrl
                  ? <img src={p.logoUrl} alt="" className="w-full h-full object-contain p-1" />
                  : <span className="font-bold text-white/40">{p.partner[0]}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white truncate">{p.title}</span>
                  {!p.active && <span className="text-[10px] bg-white/10 text-white/40 px-1.5 py-0.5 rounded">inaktiv</span>}
                </div>
                <div className="text-xs text-white/40 mt-0.5">
                  {p.partner} · {boardLabel(p.board)} · Rang {p.minRank}–{p.maxRank}
                  {p.discount && ` · ${p.discount}`}
                  {p.validUntil && ` · bis ${p.validUntil}`}
                </div>
              </div>
              <button onClick={() => setEditing(p)} className="text-white/40 hover:text-[var(--color-amber)] px-2"><i className="fa-solid fa-pen" /></button>
              <button onClick={() => remove(p.id)} className="text-white/40 hover:text-red-400 px-2"><i className="fa-solid fa-trash-can" /></button>
            </div>
          ))}
          {perks.length === 0 && <p className="text-white/30 text-sm py-8 text-center">Noch keine Vorteile angelegt.</p>}
        </div>
      )}

      {/* ── Edit-Modal ── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="bg-[#0f0b1a] border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto p-6">
            <h2 className="font-bold text-white text-lg mb-4">{'id' in editing && editing.id ? 'Vorteil bearbeiten' : 'Neuer Vorteil'}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className={label}>Titel</label>
                <input className={field} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="20% Gutschrift bei Europcar" /></div>
              <div><label className={label}>Partner</label>
                <input className={field} value={editing.partner} onChange={e => setEditing({ ...editing, partner: e.target.value })} placeholder="Europcar" /></div>
              <div><label className={label}>Rabatt-Badge</label>
                <input className={field} value={editing.discount ?? ''} onChange={e => setEditing({ ...editing, discount: e.target.value })} placeholder="20%" /></div>
              <div><label className={label}>Ranking</label>
                <select className={field} value={editing.board} onChange={e => setEditing({ ...editing, board: e.target.value as AdminPerk['board'] })}>
                  {BOARDS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={label}>Rang von</label>
                  <input type="number" min={1} className={field} value={editing.minRank} onChange={e => setEditing({ ...editing, minRank: Number(e.target.value) })} /></div>
                <div><label className={label}>bis</label>
                  <input type="number" min={1} className={field} value={editing.maxRank} onChange={e => setEditing({ ...editing, maxRank: Number(e.target.value) })} /></div>
              </div>
              <div className="col-span-2"><label className={label}>Logo-URL</label>
                <input className={field} value={editing.logoUrl ?? ''} onChange={e => setEditing({ ...editing, logoUrl: e.target.value })} placeholder="https://logo.clearbit.com/europcar.com" /></div>
              <div><label className={label}>Einlöse-Link</label>
                <input className={field} value={editing.redeemUrl ?? ''} onChange={e => setEditing({ ...editing, redeemUrl: e.target.value })} placeholder="https://www.europcar.de" /></div>
              <div><label className={label}>Gültig bis</label>
                <input type="date" className={field} value={editing.validUntil ?? ''} onChange={e => setEditing({ ...editing, validUntil: e.target.value })} /></div>
              <div className="col-span-2"><label className={label}>Vertragsbedingungen</label>
                <textarea rows={3} className={field} value={editing.terms ?? ''} onChange={e => setEditing({ ...editing, terms: e.target.value })} placeholder="Nur online einlösbar…" /></div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="active" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} />
                <label htmlFor="active" className="text-sm text-white/60">Aktiv (für Nutzer:innen sichtbar)</label>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={save} disabled={saving || !editing.title || !editing.partner}
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
