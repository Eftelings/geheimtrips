import { useEffect, useState } from 'react';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type AdminUser } from '../../services/adminApi.js';
import { useAuthStore } from '../../store/useAuthStore.js';

export function AdminUsers() {
  const [users, setUsers]   = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const { user: self }        = useAuthStore();

  async function load() {
    const u = await adminApi.users();
    setUsers(u); setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggle(user: AdminUser, field: 'isAdmin' | 'isBanned') {
    await adminApi.updateUser(user.id, { [field]: !user[field] });
    load();
  }

  async function deleteUser(id: number) {
    if (!confirm('Nutzer:in unwiderruflich löschen?')) return;
    await adminApi.deleteUser(id);
    load();
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
                        <button onClick={() => deleteUser(u.id)}
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
