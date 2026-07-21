import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { LegalFooter } from '../components/layout/LegalFooter.js';
import { Avatar } from '../components/ui/Avatar.js';
import { usersApi, friendsApi, type FollowedUser } from '../services/api.js';
import type { Friend } from '../types/index.js';

/**
 * „Traveler" — Personen, denen ich folge, und meine Freund:innen. Von hier kommt man
 * am schnellsten auf deren Blog. Ersetzt „Besuchte Orte" in der Bottom-Nav (die liegen
 * jetzt im persönlichen Profil).
 */
export function TravelerPage() {
  const navigate = useNavigate();
  const [following, setFollowing] = useState<FollowedUser[]>([]);
  const [friends, setFriends]     = useState<Friend[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      usersApi.following().catch(() => [] as FollowedUser[]),
      friendsApi.list().catch(() => [] as Friend[]),
    ]).then(([f, fr]) => { setFollowing(f); setFriends(fr); }).finally(() => setLoading(false));
  }, []);

  const Row = ({ id, name, handle, avatarUrl, cropX, cropY }: {
    id: number; name: string; handle: string; avatarUrl: string | null; cropX?: number; cropY?: number;
  }) => (
    <button onClick={() => navigate(`/u/${id}`)}
      className="w-full flex items-center gap-3 bg-white rounded-2xl p-2.5 shadow-[var(--shadow-card)] active:scale-[0.99] transition-transform text-left">
      <Avatar name={name} src={avatarUrl} size={44} cropX={cropX} cropY={cropY} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--color-aubergine)] truncate">{name}</p>
        <p className="text-xs text-[var(--color-lavender)] truncate">@{handle}</p>
      </div>
      <i className="fa-solid fa-chevron-right text-[var(--color-lavender-lt)] text-sm" />
    </button>
  );

  return (
    <AppShell>
      <div className="px-6 pt-5 max-w-lg mx-auto pb-10">
        {/* Neue Leute kennenlernen — gehört hierher, nicht ins eigene Profil */}
        <button onClick={() => navigate('/leute')}
          className="w-full flex items-center gap-3 bg-white border-2 border-[var(--color-amber)]/30 text-[var(--color-aubergine)] font-semibold py-3 px-4 rounded-xl text-sm mb-5 active:scale-[0.98] transition-transform">
          <span className="w-8 h-8 rounded-xl bg-[var(--color-amber)]/15 flex items-center justify-center"><i className="fa-solid fa-user-plus text-[var(--color-amber)]" /></span>
          <span className="flex-1 text-left">Neue Leute kennenlernen</span>
          <i className="fa-solid fa-chevron-right text-[var(--color-lavender-lt)]" />
        </button>

        {loading ? (
          <div className="flex justify-center py-16 text-[var(--color-lavender-lt)]">
            <i className="fa-solid fa-circle-notch fa-spin text-2xl" />
          </div>
        ) : (
          <>
            {/* Personen, denen ich folge */}
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-3">
              Ich folge ({following.length})
            </p>
            {following.length === 0 ? (
              <div className="text-center py-8 text-[var(--color-lavender-lt)] mb-6">
                <i className="fa-solid fa-user-plus text-3xl mb-2 opacity-30" />
                <p className="text-sm">Du folgst noch niemandem.</p>
                <p className="text-xs mt-1">Auf einem Blog auf „Folgen" tippen.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mb-7">
                {following.map(u => (
                  <Row key={u.id} id={u.id} name={u.name} handle={u.handle}
                    avatarUrl={u.avatarUrl} cropX={u.avatarCropX} cropY={u.avatarCropY} />
                ))}
              </div>
            )}

            {/* Freund:innen */}
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-3">
              Freunde ({friends.length})
            </p>
            {friends.length === 0 ? (
              <div className="text-center py-8 text-[var(--color-lavender-lt)]">
                <i className="fa-solid fa-user-group text-3xl mb-2 opacity-30" />
                <p className="text-sm">Noch keine Freund:innen.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {friends.map(f => (
                  <Row key={f.id} id={f.id} name={f.name} handle={f.handle} avatarUrl={f.avatarUrl} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <LegalFooter />
    </AppShell>
  );
}
