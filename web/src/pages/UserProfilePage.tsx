import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { PlaceCard } from '../components/ui/PlaceCard.js';
import { Avatar } from '../components/ui/Avatar.js';
import { SocialLinks } from '../components/ui/SocialLinks.js';
import { usersApi, friendsApi, type PublicUser } from '../services/api.js';

export function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser]       = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy]       = useState(false);

  async function load() {
    setLoading(true);
    try { setUser(await usersApi.get(Number(id))); setNotFound(false); }
    catch { setNotFound(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  async function addFriend() {
    if (!user) return;
    setBusy(true);
    try { await friendsApi.request(user.handle); await load(); }
    catch (e) { alert((e as Error).message ?? 'Fehler'); }
    setBusy(false);
  }
  async function acceptFriend() {
    if (!user?.pendingRequestId) return;
    setBusy(true);
    try { await friendsApi.accept(user.pendingRequestId); await load(); } catch { /* */ }
    setBusy(false);
  }

  if (loading) return (
    <AppShell showBack>
      <div className="flex justify-center py-20 text-[var(--color-lavender-lt)]"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>
    </AppShell>
  );
  if (notFound || !user) return (
    <AppShell showBack>
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-[var(--color-lavender)]">
        <i className="fa-solid fa-user-slash text-4xl mb-3 opacity-30" />
        <p>Profil nicht gefunden</p>
      </div>
    </AppShell>
  );

  function friendButton() {
    if (!user) return null;
    switch (user.friendStatus) {
      case 'self':
        return <button onClick={() => navigate('/profile')} className="flex-1 bg-[var(--color-bg-soft)] text-[var(--color-aubergine)] font-bold py-3 rounded-xl text-sm">Dein Profil bearbeiten</button>;
      case 'friends':
        return <button disabled className="flex-1 bg-green-100 text-green-700 font-bold py-3 rounded-xl text-sm"><i className="fa-solid fa-user-check mr-2" />Befreundet</button>;
      case 'pending_out':
        return <button disabled className="flex-1 bg-[var(--color-bg-soft)] text-[var(--color-lavender)] font-bold py-3 rounded-xl text-sm"><i className="fa-solid fa-clock mr-2" />Anfrage gesendet</button>;
      case 'pending_in':
        return <button onClick={acceptFriend} disabled={busy} className="flex-1 bg-[var(--color-amber)] text-white font-bold py-3 rounded-xl text-sm shadow-[var(--shadow-amber)] disabled:opacity-60"><i className="fa-solid fa-user-check mr-2" />Anfrage annehmen</button>;
      default:
        return <button onClick={addFriend} disabled={busy} className="flex-1 bg-[var(--color-amber)] text-white font-bold py-3 rounded-xl text-sm shadow-[var(--shadow-amber)] disabled:opacity-60"><i className="fa-solid fa-user-plus mr-2" />Freund:in hinzufügen</button>;
    }
  }

  const wallPhotos = user.places.map(p => p.hero).filter(Boolean).slice(0, 12);

  return (
    <AppShell showBack title={user.name}>
      <div className="max-w-lg mx-auto pb-12">
        {/* ── Titelbild (querformatig, LinkedIn-Stil) ── */}
        <div className="h-32 sm:h-44 relative overflow-hidden sm:rounded-b-3xl">
          {user.coverUrl
            ? <img src={user.coverUrl} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #4a3268, #34254c 55%, #251539)' }} />}
        </div>

        <div className="px-6">
          {/* Avatar überlappt das Titelbild */}
          <div className="-mt-12 mb-3">
            <div className="inline-block rounded-full ring-4 ring-white">
              <Avatar name={user.name} src={user.avatarUrl} size={88} />
            </div>
          </div>

          <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)] flex items-center gap-2 flex-wrap">
            {user.name}
            {user.isLocalHero && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(249,144,57,0.15)', color: '#F99039' }}>
                <i className="fa-solid fa-shield-halved" /> Local Hero
              </span>
            )}
          </h1>
          <p className="text-sm text-[var(--color-lavender)]">@{user.handle}</p>
          {user.bio && <p className="text-sm text-[var(--color-body)] mt-2 leading-relaxed">{user.bio}</p>}

          {/* Social-Links */}
          <SocialLinks user={user} className="mt-3" />

          {/* Metriken: Besuchte & Beigetragene Orte */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {[
              { label: 'Besuchte Orte', value: user.visitedCount },
              { label: 'Beigetragene Orte', value: user.placeCount },
            ].map(m => (
              <div key={m.label} className="bg-white rounded-2xl p-3 text-center shadow-[var(--shadow-card)]">
                <div className="font-display font-bold text-2xl text-[var(--color-aubergine)]">{m.value}</div>
                <div className="text-[11px] text-[var(--color-lavender)] uppercase tracking-wider">{m.label}</div>
              </div>
            ))}
          </div>

          {/* Freund-Button */}
          <div className="flex gap-3 mt-5 mb-7">{friendButton()}</div>

          {/* Fotowand — Bilder aus den Beiträgen dieser Person */}
          {wallPhotos.length > 0 && (
            <div className="mb-7">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-3">Fotowand</p>
              <div className="grid grid-cols-3 gap-1.5">
                {wallPhotos.map((src, i) => (
                  <div key={i} className="aspect-square rounded-xl overflow-hidden">
                    <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Eingereichte Orte */}
          {user.placeCount > 0 && (
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-3">
              Orte von {user.name.split(' ')[0]}
            </p>
          )}
          {user.places.length === 0 ? (
            <div className="text-center py-8 text-[var(--color-lavender-lt)]">
              <i className="fa-solid fa-map-pin text-3xl mb-2 opacity-30" />
              <p className="text-sm">Noch keine Orte eingereicht.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {user.places.map(p => <PlaceCard key={p.id} place={p} />)}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
