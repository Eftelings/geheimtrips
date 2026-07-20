import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { LegalFooter } from '../components/layout/LegalFooter.js';
import { BottomSheet } from '../components/ui/BottomSheet.js';
import { Avatar } from '../components/ui/Avatar.js';
import { AvatarUpload } from '../components/ui/AvatarUpload.js';
import { ImageFocusSheet } from '../components/ui/ImageFocusSheet.js';
import { SocialLinks } from '../components/ui/SocialLinks.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { useAppStore } from '../store/useAppStore.js';
import { authApi, mediaApi, rankingsApi, friendsApi, placesApi, notificationsApi } from '../services/api.js';
import { RankingCard } from './DiscoverPage.js';
import type { MyRankStats } from '../services/api.js';
import type { FriendRequest, Friend, Place } from '../types/index.js';

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, updateUser, logout } = useAuthStore();
  const { visitedIds, places, playVideos, setPlayVideos } = useAppStore();
  const [editOpen, setEditOpen]         = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editData, setEditData]         = useState({ name: user?.name ?? '', bio: user?.bio ?? '', instagram: user?.instagram ?? '', tiktok: user?.tiktok ?? '', website: user?.website ?? '', facebook: user?.facebook ?? '', snapchat: user?.snapchat ?? '', age: user?.age != null ? String(user.age) : '' });
  const coverInputRef                   = useRef<HTMLInputElement>(null);
  const [coverBusy, setCoverBusy]       = useState(false);
  // Nach dem Hochladen: Ausschnitt (Fokuspunkt) anpassen — rund fürs Avatar, quer fürs Titelbild
  const [cropTarget, setCropTarget]     = useState<{ kind: 'cover' | 'avatar'; url: string } | null>(null);
  const [pwData, setPwData]             = useState({ current: '', next: '' });
  const [pwError, setPwError]           = useState('');
  const [saving, setSaving]             = useState(false);
  const [rankInfo, setRankInfo]         = useState<MyRankStats | null>(null);
  const [requests, setRequests]         = useState<FriendRequest[]>([]);
  const [friends, setFriends]           = useState<Friend[]>([]);
  const [myPlaces, setMyPlaces]         = useState<Place[]>([]);
  const [notif, setNotif]               = useState(0);

  useEffect(() => {
    rankingsApi.me().then(setRankInfo).catch(() => {});
    friendsApi.requests().then(setRequests).catch(() => {});
    friendsApi.list().then(setFriends).catch(() => {});
    placesApi.myCreated().then(setMyPlaces).catch(() => {});
    notificationsApi.count().then(r => setNotif(r.count)).catch(() => {});
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
    const { age, ...rest } = editData;
    await updateUser({ ...rest, age: age.trim() === '' ? null : Number(age) }).catch(() => {});
    setSaving(false);
    setEditOpen(false);
  }

  // Titelbild hochladen (Server optimiert zu WebP) → danach Ausschnitt anpassen
  async function onCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCoverBusy(true);
    try {
      const { url } = await mediaApi.upload(file);
      setCropTarget({ kind: 'cover', url });
    } catch { /* still ok */ }
    setCoverBusy(false);
  }

  // Ausschnitt (Fokuspunkt) übernehmen und Bild + Fokus speichern
  async function saveCrop(cropX: number, cropY: number) {
    const t = cropTarget; if (!t) return;
    if (t.kind === 'cover') await updateUser({ coverUrl: t.url, coverCropX: cropX, coverCropY: cropY }).catch(() => {});
    else await updateUser({ avatarUrl: t.url, avatarCropX: cropX, avatarCropY: cropY }).catch(() => {});
    setCropTarget(null);
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
      <div className="max-w-lg mx-auto">
        {/* ── Titelbild (LinkedIn-Stil) ── */}
        <div className="h-28 sm:h-36 relative overflow-hidden sm:rounded-b-3xl">
          {user.coverUrl
            ? <img src={user.coverUrl} alt="" className="w-full h-full object-cover" style={{ objectPosition: `${user.coverCropX * 100}% ${user.coverCropY * 100}%` }} />
            : <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #4a3268, #34254c 55%, #251539)' }} />}
          <button onClick={() => coverInputRef.current?.click()} disabled={coverBusy} title="Titelbild ändern"
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/55 transition-colors">
            <i className={`fa-solid ${coverBusy ? 'fa-circle-notch fa-spin' : 'fa-camera'} text-sm`} />
          </button>
          <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={onCoverFile} />
        </div>

        <div className="px-6">
          {/* Avatar überlappt das Titelbild + Einstellungen */}
          <div className="flex items-end justify-between -mt-11 mb-3">
            <div className="rounded-full ring-4 ring-white">
              <AvatarUpload name={user.name} src={user.avatarUrl} size={80}
                cropX={user.avatarCropX} cropY={user.avatarCropY}
                onUploaded={url => setCropTarget({ kind: 'avatar', url })} />
            </div>
            <button onClick={() => setSettingsOpen(true)} className="mb-1 text-[var(--color-lavender)] hover:text-[var(--color-aubergine)]">
              <i className="fa-solid fa-gear text-lg" />
            </button>
          </div>
          <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)]">{user.name}</h1>
          <p className="text-sm text-[var(--color-lavender)]">@{user.handle}</p>
          {rankInfo?.isLocalHero && (
            <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(249,144,57,0.15)', color: '#F99039' }}
              title="Top 25 % der Geheimtriper diesen Monat">
              <i className="fa-solid fa-shield-halved" /> Local Hero
            </span>
          )}
          {user.bio && <p className="text-sm text-[var(--color-body)] mt-2">{user.bio}</p>}
          <SocialLinks user={user} className="mt-3 mb-6" />

        {/* Postfach — Benachrichtigungen liegen jetzt im Profil (lila hervorgehoben) */}
        <button onClick={() => { setNotif(0); navigate('/notifications'); }}
          className="w-full flex items-center gap-3 rounded-2xl p-3.5 mb-4 active:scale-[0.99] transition-transform text-white"
          style={{ background: 'linear-gradient(135deg, #4a3268, #34254c)', boxShadow: '0 6px 20px rgba(52,37,76,0.30)' }}>
          <span className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0 relative">
            <i className="fa-regular fa-bell text-white text-lg" />
            {notif > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-amber)] text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#34254c]">{notif > 9 ? '9+' : notif}</span>}
          </span>
          <div className="flex-1 min-w-0 text-left">
            <p className="font-semibold text-sm">Postfach</p>
            <p className="text-xs text-white/70">{notif > 0 ? `${notif} neue Benachrichtigung${notif > 1 ? 'en' : ''}` : 'Keine neuen Nachrichten'}</p>
          </div>
          <i className="fa-solid fa-chevron-right text-white/60" />
        </button>

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

        {/* Stats — Besucht/Gemerkt führen zu den jeweiligen Seiten */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Besucht',   value: visitedIds.size, to: '/visited' as string | null },
            { label: 'Gemerkt',   value: useAppStore.getState().savedIds.size, to: '/saved' as string | null },
            { label: 'Ø Sterne',  value: avgStars, to: null },
          ].map(s => {
            const cls = 'bg-white rounded-2xl p-3 text-center shadow-[var(--shadow-card)]';
            const inner = (
              <>
                <div className="font-display font-bold text-2xl text-[var(--color-aubergine)]">{s.value}</div>
                <div className="text-[11px] text-[var(--color-lavender)] uppercase tracking-wider">{s.label}</div>
              </>
            );
            return s.to
              ? <button key={s.label} onClick={() => navigate(s.to!)} className={`${cls} active:scale-95 transition-transform`}>{inner}</button>
              : <div key={s.label} className={cls}>{inner}</div>;
          })}
        </div>

        {/* TripCounting — von der Entdecken-Seite ins Profil verlegt */}
        <div className="mb-6">
          <RankingCard onNavigate={navigate} />
        </div>

        {/* Neue Leute kennenlernen */}
        <button onClick={() => navigate('/people')}
          className="w-full flex items-center gap-3 bg-white border-2 border-[var(--color-amber)]/30 text-[var(--color-aubergine)] font-semibold py-3 px-4 rounded-xl text-sm mb-3 active:scale-[0.98] transition-transform">
          <span className="w-8 h-8 rounded-xl bg-[var(--color-amber)]/15 flex items-center justify-center"><i className="fa-solid fa-user-group text-[var(--color-amber)]" /></span>
          <span className="flex-1 text-left">Neue Leute kennenlernen</span>
          <i className="fa-solid fa-chevron-right text-[var(--color-lavender-lt)]" />
        </button>

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

        {/* Meine erstellten Orte (inkl. „in Prüfung") */}
        {myPlaces.length > 0 && (
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-3">Meine Orte ({myPlaces.length})</p>
            <div className="grid grid-cols-3 gap-1.5">
              {myPlaces.map(p => (
                <button key={p.id} onClick={() => navigate(`/ort/${p.id}`)} className="aspect-square rounded-xl overflow-hidden relative active:scale-95 transition-transform">
                  <img src={p.hero} alt={p.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent flex items-end p-1.5">
                    <span className="text-white text-[9px] font-bold leading-tight text-left">{p.name}</span>
                  </div>
                  {p.isUserSubmitted && (
                    <span className="absolute top-1 left-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-amber)', color: 'white' }}>In Prüfung</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Meine Freunde */}
        {friends.length > 0 && (
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-3">Meine Freunde ({friends.length})</p>
            <div className="flex flex-col gap-2">
              {friends.map(f => (
                <button key={f.id} onClick={() => navigate(`/u/${f.id}`)}
                  className="flex items-center gap-3 bg-white rounded-2xl p-2.5 shadow-[var(--shadow-card)] active:scale-[0.99] transition-transform text-left">
                  <Avatar name={f.name} src={f.avatarUrl} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-aubergine)] truncate">{f.name}</p>
                    <p className="text-xs text-[var(--color-lavender)] truncate">@{f.handle}</p>
                  </div>
                  <i className="fa-solid fa-chevron-right text-[var(--color-lavender-lt)] text-sm" />
                </button>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Edit Profile Sheet */}
      <BottomSheet open={editOpen} onClose={() => setEditOpen(false)} title="Profil bearbeiten">
        <div className="flex flex-col gap-4">
          {[
            { key: 'name' as const, label: 'Name', placeholder: 'Dein Name' },
            { key: 'bio' as const, label: 'Bio', placeholder: 'Kurze Beschreibung…', multiline: true },
            { key: 'instagram' as const, label: 'Instagram', placeholder: 'handle' },
            { key: 'tiktok' as const,    label: 'TikTok',    placeholder: 'handle' },
            { key: 'facebook' as const,  label: 'Facebook',  placeholder: 'seiten-name oder profil.id' },
            { key: 'snapchat' as const,  label: 'Snapchat',  placeholder: 'username' },
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
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-1 block">Alter</label>
            <input type="number" min={13} max={120} value={editData.age}
              onChange={e => setEditData(d => ({ ...d, age: e.target.value }))}
              placeholder="z.B. 28"
              className="w-full border border-[var(--color-bg-soft)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-aubergine)] outline-none focus:border-[var(--color-amber)]" />
          </div>
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
            { label: 'Follower zulassen', key: 'allowFollowers' as const, val: user.allowFollowers },
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

      {cropTarget && (
        <ImageFocusSheet
          src={cropTarget.url}
          shape={cropTarget.kind === 'avatar' ? 'round' : 'cover'}
          initX={cropTarget.kind === 'avatar' ? user.avatarCropX : user.coverCropX}
          initY={cropTarget.kind === 'avatar' ? user.avatarCropY : user.coverCropY}
          onSave={saveCrop}
          onClose={() => setCropTarget(null)}
        />
      )}

      <LegalFooter />
    </AppShell>
  );
}
