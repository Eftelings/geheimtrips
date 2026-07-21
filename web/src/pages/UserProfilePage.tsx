import { useEffect, useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { PlaceCard } from '../components/ui/PlaceCard.js';
import { Avatar } from '../components/ui/Avatar.js';
import { SocialLinks } from '../components/ui/SocialLinks.js';
import { ProfileCounts } from '../components/ui/ProfileCounts.js';
import { usersApi, friendsApi, type PublicUser } from '../services/api.js';

interface Props {
  /** Eingebettet im Entdecken-Overlay: ID kommt als Prop, nicht aus der URL. */
  userId?: number;
  /** Ohne AppShell rendern (das Overlay bringt Rahmen und Griff schon mit). */
  embedded?: boolean;
  /** Meldet das geladene Profil nach oben (z.B. für die Beschriftung des Personenfilters). */
  onUser?: (u: PublicUser) => void;
}

export function UserProfilePage({ userId, embedded, onUser }: Props = {}) {
  const { id: paramId } = useParams<{ id: string }>();
  const id = userId ?? Number(paramId);
  const navigate = useNavigate();
  const [user, setUser]       = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy]       = useState(false);

  async function load() {
    setLoading(true);
    try { const u = await usersApi.get(Number(id)); setUser(u); onUser?.(u); setNotFound(false); }
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
  async function toggleFollow() {
    if (!user) return;
    const willFollow = !user.isFollowing;
    // optimistisch (Button + Zähler), bei Fehler zurückrollen
    setUser({ ...user, isFollowing: willFollow, followerCount: user.followerCount + (willFollow ? 1 : -1) });
    try { await (willFollow ? usersApi.follow(user.id) : usersApi.unfollow(user.id)); }
    catch (e) { setUser(u => u && { ...u, isFollowing: !willFollow, followerCount: u.followerCount + (willFollow ? -1 : 1) }); alert((e as Error).message ?? 'Fehler'); }
  }

  // Eingebettet bringt das Overlay den Rahmen schon mit — dann ohne AppShell rendern.
  const wrap = (content: ReactNode) => (embedded ? <>{content}</> : <AppShell showBack>{content}</AppShell>);

  if (loading) return wrap(
    <div className="flex justify-center py-20 text-[var(--color-lavender-lt)]"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>
  );
  if (notFound || !user) return wrap(
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-[var(--color-lavender)]">
      <i className="fa-solid fa-user-slash text-4xl mb-3 opacity-30" />
      <p>Profil nicht gefunden</p>
    </div>
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

  return wrap(
    <div className="max-w-lg mx-auto pb-12">
        {/* ── Header wie eine Ortsseite; das Profilbild liegt zur Hälfte darüber/darunter ── */}
        <div className="relative">
          {/* Bild + Overlay (geclippt) */}
          <div className="relative h-56 sm:h-64 overflow-hidden sm:rounded-b-3xl">
            {user.coverUrl
              ? <img src={user.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: `${user.coverCropX * 100}% ${user.coverCropY * 100}%` }} />
              : <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #4a3268, #34254c 55%, #251539)' }} />}
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.62) 0%, transparent 52%)' }} />

            {/* Overlay: Badge (wie Hauptkategorie) · Name (wie Ortsname) · Statistik (wie Ort) */}
            <div className="absolute bottom-0 left-0 right-0 p-5 pr-32">
              {user.isLocalHero && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full mb-1.5"
                  style={{ background: 'rgba(249,144,57,0.92)', color: 'white' }}>
                  <i className="fa-solid fa-shield-halved" /> Local Hero
                </span>
              )}
              <h1 className="font-display font-bold text-white leading-tight"
                style={{ fontSize: 'clamp(1.35rem, 5vw, 1.9rem)', letterSpacing: '-0.01em', textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
                {user.name}
              </h1>
              {/* Nur die Zahlen, die diese Person freigegeben hat */}
              <ProfileCounts onImage className="mt-2" items={[
                ...(user.visitedPublic ? [{ icon: 'fa-timeline', value: user.visitedCount, label: 'besuchte Orte' }] : []),
                ...(user.createdPublic ? [{ icon: 'fa-feather-pointed', value: user.placeCount, label: 'erstellte Orte' }] : []),
                ...(user.savedPublic ? [{ icon: 'fa-bookmark', value: user.savedCount, label: 'gemerkte Orte' }] : []),
              ]} />
            </div>
          </div>

          {/* Rundes Profilbild rechts — genau zur Hälfte im Header, zur Hälfte darunter.
              Der Ring nimmt die Hintergrundfarbe der Seite auf, nicht Weiß. */}
          <div className="absolute right-5 bottom-0 translate-y-1/2 z-10 rounded-full shadow-lg"
            style={{ boxShadow: '0 0 0 5px var(--color-bg), 0 8px 20px rgba(52,37,76,0.22)' }}>
            <Avatar name={user.name} src={user.avatarUrl} size={96} cropX={user.avatarCropX} cropY={user.avatarCropY} />
          </div>
        </div>

        <div className="px-6 pt-4">
          {/* Social-Buttons — direkt unter dem Header, links neben dem Profilbild */}
          <SocialLinks user={user} className="mb-1.5 pr-28" />
          <p className="text-xs text-[var(--color-lavender)] mb-3">
            @{user.handle}
            {user.allowFollowers && <> · <strong className="text-[var(--color-aubergine)]">{user.followerCount}</strong> Follower · <strong className="text-[var(--color-aubergine)]">{user.followingCount}</strong> folgt</>}
          </p>

          {/* Persönlicher Text */}
          {user.bio && <p className="text-sm text-[var(--color-body)] leading-relaxed mb-4">{user.bio}</p>}

          {/* Freund- + Folgen-Button */}
          <div className="flex gap-3 mb-7">
            {friendButton()}
            {user.allowFollowers && user.friendStatus !== 'self' && (
              <button onClick={toggleFollow}
                className={`flex-1 font-bold py-3 rounded-xl text-sm transition-colors ${user.isFollowing ? 'bg-[var(--color-bg-soft)] text-[var(--color-aubergine)]' : 'bg-[var(--color-aubergine)] text-white'}`}>
                <i className={`fa-solid ${user.isFollowing ? 'fa-user-check' : 'fa-user-plus'} mr-2`} />
                {user.isFollowing ? 'Folge ich' : 'Folgen'}
              </button>
            )}
          </div>

          {/* Kein „auf der Karte"-Knopf: das Overlay herunterziehen zeigt genau das —
              die Karte, bereits über den Personenfilter auf diese Person eingestellt. */}

          {/* Trips — horizontaler Slider mit hochformatigen Kacheln (nur veröffentlichte) */}
          {user.trips.length > 0 && (
            <div className="mb-7">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-3">Meine Trips</p>
              <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-6 px-6 pb-1">
                {user.trips.map(t => (
                  <button key={t.id} onClick={() => navigate(`/trips/${t.id}`)}
                    className="relative flex-shrink-0 w-36 aspect-[3/4] rounded-2xl overflow-hidden shadow-[var(--shadow-card)] active:scale-95 transition-transform">
                    {t.hero
                      ? <img src={t.hero} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                      : <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #4a3268, #34254c)' }} />}
                    <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 55%)' }} />
                    <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
                      <p className="text-white font-display font-bold text-sm leading-tight line-clamp-2">{t.title}</p>
                      {t.subtitle && <p className="text-white/75 text-[11px] mt-0.5 line-clamp-1">{t.subtitle}</p>}
                      <p className="text-white/70 text-[10px] mt-1"><i className="fa-solid fa-map-pin mr-1" />{t.places.length} Orte</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Veröffentlichte Orte */}
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
  );
}
