import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { PlaceCard } from '../components/ui/PlaceCard.js';
import { useAppStore } from '../store/useAppStore.js';
import type { Author, Place } from '../types/index.js';

// Inline author data from our demo data (matched by ID)
const DEMO_AUTHORS: Author[] = [
  { id: 1, name: 'Tobias M.', handle: 'tobias_wandert',  bio: 'Unterwegs in NRW & Rheinland. Ich teile die Orte, die ich wirklich liebe.', avatarUrl: null, avatarColor: '#8A6FB3', instagram: 'tobias.wandert', tiktok: null, website: null, placeCount: 3, savedCount: 120, avgStars: 4.6 },
  { id: 2, name: 'Sophie K.', handle: 'sophie_entdeckt', bio: 'Wochenend-Abenteurerin aus Berlin. Natur, Wasser, gutes Essen.', avatarUrl: null, avatarColor: '#5B8F6E', instagram: null, tiktok: 'sophie_entdeckt', website: 'sophieentdeckt.de', placeCount: 5, savedCount: 200, avgStars: 4.8 },
  { id: 3, name: 'Lena W.',   handle: 'lenawandert',     bio: 'Ich liebe die Sächsische Schweiz und alles mit Bergen.',             avatarUrl: null, avatarColor: '#D97757', instagram: 'lena.wandert', tiktok: null, website: null, placeCount: 2, savedCount: 88,  avgStars: 4.9 },
  { id: 4, name: 'Max R.',    handle: 'max_geheim',      bio: 'Mystische Orte, alte Wege und vergessene Geschichte.',               avatarUrl: null, avatarColor: '#C9A227', instagram: null, tiktok: null, website: null, placeCount: 4, savedCount: 310, avgStars: 4.4 },
];

export function AuthorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { places, loadPlaces } = useAppStore();
  const [following, setFollowing] = useState(false);

  useEffect(() => { loadPlaces(); }, []);

  const author = DEMO_AUTHORS.find(a => a.id === Number(id));
  const authorPlaces: Place[] = places.filter(p => p.authorId === Number(id));

  if (!author) return (
    <AppShell showBack>
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-[var(--color-lavender)]">
        <i className="fa-solid fa-user-slash text-4xl mb-3 opacity-30" />
        <p>Autor:in nicht gefunden</p>
      </div>
    </AppShell>
  );

  return (
    <AppShell showBack>
      <div className="px-5 pt-5 max-w-lg mx-auto pb-12">
        {/* Header */}
        <div className="flex items-start gap-4 mb-5">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
            style={{ background: author.avatarColor }}
          >
            {author.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-xl text-[var(--color-aubergine)]">{author.name}</h1>
            <p className="text-sm text-[var(--color-lavender)]">@{author.handle}</p>
            {author.bio && (
              <p className="text-sm text-[var(--color-body)] mt-1 leading-relaxed">{author.bio}</p>
            )}
            {/* Socials */}
            <div className="flex gap-3 mt-2">
              {author.instagram && (
                <a href={`https://instagram.com/${author.instagram}`} target="_blank" rel="noreferrer"
                  className="text-[var(--color-lavender)] hover:text-[var(--color-amber)] transition-colors">
                  <i className="fa-brands fa-instagram" />
                </a>
              )}
              {author.tiktok && (
                <a href={`https://tiktok.com/@${author.tiktok}`} target="_blank" rel="noreferrer"
                  className="text-[var(--color-lavender)] hover:text-[var(--color-amber)] transition-colors">
                  <i className="fa-brands fa-tiktok" />
                </a>
              )}
              {author.website && (
                <a href={`https://${author.website}`} target="_blank" rel="noreferrer"
                  className="text-[var(--color-lavender)] hover:text-[var(--color-amber)] transition-colors">
                  <i className="fa-solid fa-link text-sm" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Orte',     value: author.placeCount  },
            { label: 'Gemerkt',  value: author.savedCount  },
            { label: 'Ø Sterne', value: author.avgStars.toFixed(1) },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-3 text-center shadow-[var(--shadow-card)]">
              <div className="font-display font-bold text-xl text-[var(--color-aubergine)]">{s.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-lavender)]">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Follow + Message */}
        <div className="flex gap-3 mb-7">
          <button
            onClick={() => setFollowing(f => !f)}
            className={`flex-1 font-bold py-3 rounded-xl text-sm transition-colors ${
              following
                ? 'bg-[var(--color-bg-soft)] text-[var(--color-aubergine)]'
                : 'bg-[var(--color-amber)] text-white shadow-[var(--shadow-amber)]'
            }`}
          >
            <i className={`fa-solid ${following ? 'fa-user-check' : 'fa-user-plus'} mr-2`} />
            {following ? 'Gefolgt' : 'Folgen'}
          </button>
          <button className="w-12 h-12 bg-[var(--color-bg-soft)] rounded-xl flex items-center justify-center text-[var(--color-aubergine)]">
            <i className="fa-solid fa-message" />
          </button>
        </div>

        {/* Places by this author */}
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-3">
          Orte von {author.name.split(' ')[0]}
        </p>

        {authorPlaces.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-lavender-lt)]">
            <i className="fa-solid fa-map-pin text-3xl mb-2 opacity-30" />
            <p className="text-sm">Noch keine Orte veröffentlicht.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {authorPlaces.map(p => <PlaceCard key={p.id} place={p} />)}
          </div>
        )}
      </div>
    </AppShell>
  );
}
