import { useEffect, useState } from 'react';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type AdminUser } from '../../services/adminApi.js';
import { useAuthStore } from '../../store/useAuthStore.js';

export function AdminUsers() {
  const [users, setUsers]   = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const { user: self }        = useAuthStore();
  // Lösch-Dialog: entweder Artikel anonymisieren oder an eine andere Person übertragen
  const [delTarget, setDelTarget] = useState<AdminUser | null>(null);
  const [transferTo, setTransferTo] = useState<number | ''>('');
  const [delBusy, setDelBusy]     = useState(false);
  const [delErr, setDelErr]       = useState('');

  async function load() {
    const u = await adminApi.users();
    setUsers(u); setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggle(user: AdminUser, field: 'isAdmin' | 'isBanned') {
    await adminApi.updateUser(user.id, { [field]: !user[field] });
    load();
  }

  function openDelete(u: AdminUser) { setDelTarget(u); setTransferTo(''); setDelErr(''); }

  async function confirmDelete() {
    if (!delTarget) return;
    setDelBusy(true); setDelErr('');
    try {
      await adminApi.deleteUser(delTarget.id, transferTo === '' ? null : transferTo);
      setDelTarget(null);
      await load();
    } catch (e) {
      setDelErr((e as Error).message || 'Löschen fehlgeschlagen.');
    } finally {
      setDelBusy(false);
    }
  }

  const filtered = users.filter(u =>
    !search ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.handle.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout title={`Nutzer:innen (${users.length})`}>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, E-Mail oder Handle suchen…"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[var(--color-amber)] mb-5" />

      {loading ? (
        <div className="flex justify-center py-12 text-white/30">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl" />
        </div>
      ) : (
        <div className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                {['Name / Handle','E-Mail','Registriert','Admin','Gesperrt','Aktionen'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const isSelf = u.id === self?.id;
                return (
                  <tr key={u.id} className={`border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors ${u.isBanned ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white/90">{u.name}</div>
                      <div className="text-xs text-white/30">@{u.handle}</div>
                    </td>
                    <td className="px-4 py-3 text-white/50 text-xs">{u.email}</td>
                    <td className="px-4 py-3 text-white/40 text-xs">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString('de') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Toggle on={!!u.isAdmin} disabled={isSelf}
                        onChange={() => toggle(u, 'isAdmin')}
                        activeColor="var(--color-amber)" />
                    </td>
                    <td className="px-4 py-3">
                      <Toggle on={!!u.isBanned} disabled={isSelf}
                        onChange={() => toggle(u, 'isBanned')}
                        activeColor="#ef4444" />
                    </td>
                    <td className="px-4 py-3">
                      {!isSelf && (
                        <button onClick={() => openDelete(u)}
                          className="p-1.5 bg-white/5 hover:bg-red-500/20 rounded-lg text-white/40 hover:text-red-400 transition-colors">
                          <i className="fa-solid fa-trash text-xs" />
                        </button>
                      )}
                      {isSelf && <span className="text-[10px] text-white/20">Du</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-8 text-white/30 text-sm">Keine Nutzer:innen gefunden.</div>
          )}
        </div>
      )}

      {/* Lösch-Dialog: Artikel anonymisieren ODER an eine andere Person übertragen */}
      {delTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !delBusy && setDelTarget(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 p-5" style={{ background: '#160f24' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-bold text-lg mb-1">Nutzer:in löschen</h3>
            <p className="text-white/50 text-sm mb-4">
              <span className="text-white/80 font-semibold">{delTarget.name}</span> (@{delTarget.handle}) wird
              unwiderruflich gelöscht. Was soll mit den eingereichten Artikeln passieren?
            </p>

            <div className="space-y-2 mb-4">
              <label className="flex items-start gap-3 p-3 rounded-xl border border-white/10 cursor-pointer hover:bg-white/5 transition-colors">
                <input type="radio" name="transfer" checked={transferTo === ''} onChange={() => setTransferTo('')}
                  className="mt-1 accent-[var(--color-amber)]" />
                <span>
                  <span className="block text-sm font-semibold text-white/90">Anonymisieren</span>
                  <span className="block text-xs text-white/40">Artikel bleiben erhalten, verlieren aber den persönlichen Bezug.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-xl border border-white/10 cursor-pointer hover:bg-white/5 transition-colors">
                <input type="radio" name="transfer" checked={transferTo !== ''}
                  onChange={() => setTransferTo(users.find(u => u.id !== delTarget.id && u.id !== self?.id)?.id ?? '')}
                  className="mt-1 accent-[var(--color-amber)]" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-white/90">An andere Person übertragen</span>
                  <span className="block text-xs text-white/40 mb-2">Alle Artikel &amp; Foto-Beiträge werden dieser Person zugeordnet.</span>
                  {transferTo !== '' && (
                    <select value={transferTo} onChange={e => setTransferTo(Number(e.target.value))}
                      className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-amber)]">
                      {users.filter(u => u.id !== delTarget.id).map(u => (
                        <option key={u.id} value={u.id} className="bg-[#160f24]">{u.name} (@{u.handle})</option>
                      ))}
                    </select>
                  )}
                </span>
              </label>
            </div>

            {delErr && <p className="text-red-400 text-xs mb-3"><i className="fa-solid fa-triangle-exclamation mr-1" />{delErr}</p>}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setDelTarget(null)} disabled={delBusy}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white/60 hover:bg-white/5 transition-colors disabled:opacity-40">
                Abbrechen
              </button>
              <button onClick={confirmDelete} disabled={delBusy}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-red-500/80 hover:bg-red-500 transition-colors disabled:opacity-40">
                {delBusy ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function Toggle({ on, onChange, disabled, activeColor }: { on: boolean; onChange: () => void; disabled?: boolean; activeColor?: string }) {
  return (
    <button onClick={onChange} disabled={disabled}
      className={`w-10 h-5 rounded-full relative transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
      style={{ backgroundColor: on ? (activeColor ?? '#22c55e') : 'rgba(255,255,255,0.1)' }}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${on ? 'right-0.5' : 'left-0.5'}`} />
    </button>
  );
}
