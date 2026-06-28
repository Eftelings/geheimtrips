import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { Avatar } from '../components/ui/Avatar.js';
import { peopleApi, friendsApi, type PersonSuggestion } from '../services/api.js';
import { useAuthStore } from '../store/useAuthStore.js';

export function MeetPeoplePage() {
  const navigate = useNavigate();
  const { updateUser } = useAuthStore();
  const [data, setData] = useState<{ meetPeopleEnabled: boolean; suggestions: PersonSuggestion[] } | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [enabling, setEnabling] = useState(false);

  const load = () => peopleApi.suggestions().then(setData).catch(() => setData({ meetPeopleEnabled: false, suggestions: [] }));
  useEffect(() => { load(); }, []);

  async function enable() {
    setEnabling(true);
    await updateUser({ meetPeopleEnabled: true }).catch(() => {});
    await load();
    setEnabling(false);
  }
  async function connect(handle: string) {
    setRequested(prev => new Set(prev).add(handle));
    await friendsApi.request(handle).catch(() => {});
  }

  return (
    <AppShell title="Neue Leute">
      <div className="px-5 py-6 max-w-2xl mx-auto">
        <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)]" style={{ letterSpacing: '-0.02em' }}>
          Neue <em className="italic text-[var(--color-amber)]">Leute</em> kennenlernen
        </h1>
        <p className="text-sm text-[var(--color-lavender)] mt-1 mb-5">Menschen, die dieselben Geheimtipps mögen wie du.</p>

        {/* Opt-in */}
        {data && !data.meetPeopleEnabled && (
          <div className="flex items-start gap-3 p-4 mb-5 rounded-2xl border-2 border-[var(--color-amber)] bg-[#FFF4EB]">
            <i className="fa-solid fa-user-group text-[var(--color-amber)] mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-aubergine)]">Sei sichtbar für andere</p>
              <p className="text-xs text-[var(--color-lavender)] mt-0.5">Aktiviere „Neue Leute", damit auch andere dich hier entdecken können.</p>
            </div>
            <button onClick={enable} disabled={enabling}
              className="bg-[var(--color-amber)] text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60 flex-shrink-0">
              {enabling ? '…' : 'Aktivieren'}
            </button>
          </div>
        )}

        {data === null ? (
          <div className="flex justify-center py-16 text-[var(--color-lavender)]"><i className="fa-solid fa-circle-notch fa-spin text-3xl" /></div>
        ) : data.suggestions.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-lavender)]">
            <i className="fa-regular fa-compass text-5xl mb-4 opacity-30" />
            <p className="font-semibold mb-1">Noch keine Vorschläge</p>
            <p className="text-sm">Merke dir ein paar Orte – dann finden wir Menschen mit ähnlichem Geschmack.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {data.suggestions.map(p => {
              const sent = requested.has(p.handle);
              return (
                <div key={p.id} className="flex items-start gap-3 p-4 bg-white rounded-2xl shadow-[var(--shadow-card)]">
                  <button onClick={() => navigate(`/u/${p.id}`)} className="flex-shrink-0">
                    <Avatar name={p.name} src={p.avatarUrl} size={52} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <button onClick={() => navigate(`/u/${p.id}`)} className="text-left block">
                      <span className="font-display font-semibold text-[var(--color-aubergine)] text-sm">
                        {p.name}{p.isLocalHero && <i className="fa-solid fa-star text-[var(--color-amber)] text-[10px] ml-1" />}
                      </span>
                      <span className="text-xs text-[var(--color-lavender)] ml-1.5">@{p.handle}{p.age ? ` · ${p.age}` : ''}</span>
                    </button>
                    {p.bio && <p className="text-xs text-[var(--color-lavender)] mt-0.5 line-clamp-2">{p.bio}</p>}
                    {p.sharedCount > 0 && (
                      <p className="text-[12px] text-[var(--color-aubergine)] mt-1.5 font-medium">
                        <i className="fa-solid fa-bookmark text-[var(--color-amber)] text-[10px] mr-1" />
                        {p.sharedCount} gemeinsame{p.sharedCount === 1 ? 'r Ort' : ' Orte'}
                        {p.sharedPlaces.length > 0 && <span className="text-[var(--color-lavender)] font-normal"> · {p.sharedPlaces.join(', ')}</span>}
                      </p>
                    )}
                  </div>
                  <button onClick={() => connect(p.handle)} disabled={sent}
                    className={`flex-shrink-0 font-bold px-3.5 py-2 rounded-xl text-xs transition-colors ${sent ? 'bg-[var(--color-bg-soft)] text-[var(--color-lavender)]' : 'bg-[var(--color-aubergine)] text-white'}`}>
                    {sent ? <><i className="fa-solid fa-check mr-1" />Gesendet</> : <><i className="fa-solid fa-user-plus mr-1" />Vernetzen</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
