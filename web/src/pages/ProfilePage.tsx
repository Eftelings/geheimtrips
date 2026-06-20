import { useState, useEffect } from 'react';
import { AppShell } from '../components/layout/AppShell.js';
import { LegalFooter } from '../components/layout/LegalFooter.js';
import { BottomSheet } from '../components/ui/BottomSheet.js';
import { Avatar } from '../components/ui/Avatar.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { useAppStore } from '../store/useAppStore.js';
import { authApi, rankingsApi, friendsApi } from '../services/api.js';
import type { MyRankStats } from '../services/api.js';
import type { FriendRequest } from '../types/index.js';

export function ProfilePage() {
  const { user, updateUser, logout } = useAuthStore();
  const { visitedIds, places, playVideos, setPlayVideos } = useAppStore();
  const [editOpen, setEditOpen]         = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editData, setEditData]         = useState({ name: user?.name ?? '', bio: user?.bio ?? '', instagram: user?.instagram ?? '', tiktok: user?.tiktok ?? '', website: user?.website ?? '' });
  const [pwData, setPwData]             = useState({ current: '', next: '' });
  const [pwError, setPwError]           = useState('');
  const [saving, setSaving]             = useState(false);
  const [rankInfo, setRankInfo]         = useState<MyRankStats | null>(null);
  const [requests, setRequests]         = useState<FriendRequest[]>([]);

  useEffect(() => {
    rankingsApi.me().then(setRankInfo).catch(() => {});
    friendsApi.requests().then(setRequests).catch(() => {});
  }, []);

  async function respondRequest(friendshipId: number, accept: boolean) {
    try {
      if (accept) await friendsApi.accept(friendshipId); else await friendsApi.decline(friendshipId);
      setRequests(rs => rs.filter(r => r.friendshipId !== friendshipId));
    } catch { /* */ }
  }

  if (!user) return null;

  const visitedPlaces = places.filter(p => visitedIds.has(p.id));
  const avgStars = visitedPlaces.length
    ? (visitedPlaces.reduce((s, p) => s + p.rating, 0) / visitedPlaces.length).toFixed(1)
    : '—';

  async function saveProfile() {
    setSaving(true);
    await updateUser(editData).catch(() => {});
    setSaving(false);
    setEditOpen(false);
  }

  async function changePassword() {
    setPwError('');
    try {
      await authApi.changePassword(pwData.current, pwData.next);
      setPwData({ current: '', next: '' });
    } catch (e: any) {
      setPwError(e.message ?? 'Fehler');
    }
  }

  return (
    <AppShell title="Profil">
      <div className="px-6 pt-5 max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <Avatar name={user.name} src={user.avatarUrl} size={64} />
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-xl text-[var(--color-aubergine)]">{user.name}</h1>
            <p className="text-sm text-[var(--color-lavender)]">@{user.handle}</p>
            {rankInfo?.isLocalHero && (
              <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(249,144,57,0.15)', color: '#F99039' }}
                title="Top 25 % der Geheimtripper diesen Monat">
                <i className="fa-solid fa-shield-halved" /> Local Hero
              </span>
            )}
            {user.bio && <p className="text-sm text-[var(--color-body)] mt-1">{user.bio}</p>}
            {/* Socials */}
            <div className="flex gap-3 mt-2">
              {user.instagram && <a href={`https://instagram.com/${user.instagram}`} target="_blank" rel="noreferrer" className="text-[var(--color-lavender)] hover:text-[var(--color-amber)]"><i className="fa-brands fa-instagram" /></a>}
              {user.tiktok    && <a href={`https://tiktok.com/@${user.tiktok}`}      target="_blank" rel="noreferrer" className="text-[var(--color-lavender)] hover:text-[var(--color-amber)]"><i className="fa-brands fa-tiktok" /></a>}
              {user.website   && <a href={user.website} target="_blank" rel="noreferrer" className="text-[var(--color-lavender)] hover:text-[var(--color-amber)]"><i className="fa-solid fa-link" /></a>}
            </div>
          </div>
          <button onClick={() => setSettingsOpen(true)} className="text-[var(--color-lavender)] hover:text-[var(--color-aubergine)]">
            <i className="fa-solid fa-gear text-lg" />
          </button>
        </div>

        {/* Freundschaftsanfragen */}
        {requests.length > 0 && (
          <div className="mb-6 rounded-2xl border-2 border-[var(--color-amber)]/40 bg-[var(--color-amber)]/5 p-4">
            <h2 className="font-display font-bold text-sm text-[var(--color-aubergine)] mb-3 flex items-center gap-2">
              <i className="fa-solid fa-user-plus text-[var(--color-amber)]" />
              Freundschaftsanfragen
              <span className="text-[10px] font-bold bg-[var(--color-amber)] text-white rounded-full px-1.5 py-0.5">{requests.length}</span>
            </h2>
            <div className="flex flex-col gap-2.5">
              {requests.map(r => (
                <div key={r.friendshipId} className="flex items-center gap-3">
                  <Avatar name={r.name} src={r.avatarUrl} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[var(--color-aubergine)] truncate">{r.name}</div>
                    <div className="text-[10px] text-[var(--color-lavender-lt)]">@{r.handle}</div>
                  </div>
                  <button onClick={() => respondRequest(r.friendshipId, true)}
                    className="bg-[var(--color-amber)] text-white font-bold text-xs px-3 py-1.5 rounded-full shadow-[var(--shadow-amber)]">Annehmen</button>
                  <button onClick={() => respondRequest(r.friendshipId, false)}
                    className="text-[var(--color-lavender)] hover:text-[#e05858] px-1.5" aria-label="Ablehnen">
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Besucht',   value: visitedIds.size  },
            { label: 'Gemerkt',   value: useAppStore.getState().savedIds.size },
            { label: 'Ø Sterne',  value: avgStars         },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-3 text-center shadow-[var(--shadow-card)]">
              <div className="font-display font-bold text-2xl text-[var(--color-aubergine)]">{s.value}</div>
              <div className="text-[11px] text-[var(--color-lavender)] uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Edit Profile */}
        <button onClick={() => setEditOpen(true)}
          className="w-full flex items-center justify-center gap-2 bg-[var(--color-bg-soft)] text-[var(--color-aubergine)] font-semibold py-3 rounded-xl text-sm mb-6 active:scale-[0.98] transition-transform">
          <i className="fa-solid fa-pen" />
          Profil bearbeiten
        </button>

        {/* Visited places */}
        {visitedPlaces.length > 0 && (
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-3">Besuchte Orte</p>
            <div className="grid grid-cols-3 gap-1.5">
              {visitedPlaces.slice(0, 9).map(p => (
                <div key={p.id} className="aspect-square rounded-xl overflow-hidden relative">
                  <img src={p.hero} alt={p.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-1.5">
                    <span className="text-white text-[9px] font-bold leading-tight">{p.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Profile Sheet */}
      <BottomSheet open={editOpen} onClose={() => setEditOpen(false)} title="Profil bearbeiten">
        <div className="flex flex-col gap-4">
          {[
            { key: 'name' as const, label: 'Name', placeholder: 'Dein Name' },
            { key: 'bio' as const, label: 'Bio', placeholder: 'Kurze Beschreibung…', multiline: true },
            { key: 'instagram' as const, label: 'Instagram', placeholder: 'handle' },
            { key: 'tiktok' as const,    label: 'TikTok',    placeholder: 'handle' },
            { key: 'website' as const,   label: 'Website',   placeholder: 'https://…' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-1 block">{f.label}</label>
              {f.multiline ? (
                <textarea value={editData[f.key]} onChange={e => setEditData(d => ({ ...d, [f.key]: e.target.value }))}
                  placeholder={f.placeholder} rows={3}
                  className="w-full border border-[var(--color-bg-soft)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-aubergine)] outline-none focus:border-[var(--color-amber)] resize-none" />
              ) : (
                <input type="text" value={editData[f.key]} onChange={e => setEditData(d => ({ ...d, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full border border-[var(--color-bg-soft)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-aubergine)] outline-none focus:border-[var(--color-amber)]" />
              )}
            </div>
          ))}
          <button onClick={saveProfile} disabled={saving}
            className="w-full bg-[var(--color-amber)] text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50">
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </BottomSheet>

      {/* Settings Sheet */}
      <BottomSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Einstellungen">
        <div className="flex flex-col gap-5">
          {/* Toggles */}
          {[
            { label: 'Profil sichtbar', key: 'profileVisible' as const, val: user.profileVisible },
            { label: 'Benachrichtigungen', key: 'notificationsEnabled' as const, val: user.notificationsEnabled },
            { label: 'Meet People aktivieren', key: 'meetPeopleEnabled' as const, val: user.meetPeopleEnabled },
          ].map(s => (
            <div key={s.key} className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-aubergine)] font-medium">{s.label}</span>
              <button onClick={() => updateUser({ [s.key]: !s.val })}
                className={`w-12 h-6 rounded-full relative transition-colors ${s.val ? 'bg-[var(--color-amber)]' : 'bg-[var(--color-bg-soft)]'}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${s.val ? 'right-0.5' : 'left-0.5'}`} />
              </button>
            </div>
          ))}

          {/* Videos toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-[var(--color-aubergine)] font-medium">Videos abspielen</span>
              <p className="text-xs text-[var(--color-lavender)]">Autoplay in Ergebnissen & Details</p>
            </div>
            <button onClick={() => setPlayVideos(!playVideos)}
              className={`w-12 h-6 rounded-full relative transition-colors ${playVideos ? 'bg-[var(--color-amber)]' : 'bg-[var(--color-bg-soft)]'}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${playVideos ? 'right-0.5' : 'left-0.5'}`} />
            </button>
          </div>

          {/* Change password */}
          <div className="border-t border-[var(--color-bg-soft)] pt-4">
            <p className="text-sm font-bold text-[var(--color-aubergine)] mb-3">Passwort ändern</p>
            <div className="flex flex-col gap-2">
              <input type="password" placeholder="Aktuelles Passwort" value={pwData.current} onChange={e => setPwData(d => ({ ...d, current: e.target.value }))}
                className="w-full border border-[var(--color-bg-soft)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-amber)]" />
              <input type="password" placeholder="Neues Passwort" value={pwData.next} onChange={e => setPwData(d => ({ ...d, next: e.target.value }))}
                className="w-full border border-[var(--color-bg-soft)] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-amber)]" />
              {pwError && <p className="text-xs text-[var(--color-danger)]">{pwError}</p>}
              <button onClick={changePassword}
                className="bg-[var(--color-bg-soft)] text-[var(--color-aubergine)] font-semibold py-2.5 rounded-xl text-sm">
                Passwort ändern
              </button>
            </div>
          </div>

          {/* Logout */}
          <button onClick={logout}
            className="w-full text-[var(--color-danger)] font-semibold py-3 rounded-xl text-sm border border-[var(--color-danger)]/20 active:bg-[var(--color-danger)]/5">
            <i className="fa-solid fa-arrow-right-from-bracket mr-2" />
            Abmelden
          </button>
        </div>
      </BottomSheet>

      <LegalFooter />
    </AppShell>
  );
}
