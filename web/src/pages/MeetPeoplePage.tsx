import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { Avatar } from '../components/ui/Avatar.js';
import { peopleApi, friendsApi, type PersonSuggestion } from '../services/api.js';
import { requestGpsPosition } from '../services/geoService.js';
import { useAuthStore } from '../store/useAuthStore.js';

type Data = { meetPeopleEnabled: boolean; hasLocation: boolean; suggestions: PersonSuggestion[] };

export function MeetPeoplePage() {
  const navigate = useNavigate();
  const { updateUser } = useAuthStore();
  const [data, setData] = useState<Data | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [enabling, setEnabling] = useState(false);
  const [locating, setLocating] = useState(false);

  const load = () => peopleApi.suggestions().then(setData)
    .catch(() => setData({ meetPeopleEnabled: false, hasLocation: false, suggestions: [] }));

  useEffect(() => {
    peopleApi.suggestions().then(d => {
      setData(d);
      if (d.meetPeopleEnabled) shareLocation(true);   // stiller Standort-Refresh
    }).catch(() => setData({ meetPeopleEnabled: false, hasLocation: false, suggestions: [] }));
  }, []); // eslint-disable-line

  // Aktuellen GPS-Standort teilen (anderen wird nur die ungefähre Entfernung gezeigt)
  async function shareLocation(silent = false) {
    if (!silent) setLocating(true);
    try {
      const coords = await requestGpsPosition();
      await peopleApi.updateLocation(coords.lat, coords.lng);
      await load();
    } catch {
      /* Standort abgelehnt/nicht verfügbar — Prompt bleibt sichtbar */
    } finally {
      if (!silent) setLocating(false);
    }
  }

  async function enable() {
    setEnabling(true);
    await updateUser({ meetPeopleEnabled: true }).catch(() => {});
    await shareLocation();
    await load();
    setEnabling(false);
  }
  async function connect(handle: string) {
    setRequested(prev => new Set(prev).add(handle));
    await friendsApi.request(handle).catch(() => {});
  }

  const fmtDist = (km: number) => km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`;

  return (
    <AppShell title="Neue Leute">
      <div className="px-5 py-6 max-w-2xl mx-auto">
        <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)]" style={{ letterSpacing: '-0.02em' }}>
          Neue <em className="italic text-[var(--color-amber)]">Leute</em> kennenlernen
        </h1>
        <p className="text-sm text-[var(--color-lavender)] mt-1 mb-5">Menschen in deiner Nähe, die dieselben Geheimtipps mögen wie du.</p>

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

        {/* Standort teilen — aktiviert, aber noch kein Standort */}
        {data && data.meetPeopleEnabled && !data.hasLocation && (
          <div className="flex items-start gap-3 p-4 mb-5 rounded-2xl border-2 border-[var(--color-amber)] bg-[#FFF4EB]">
            <i className="fa-solid fa-location-crosshairs text-[var(--color-amber)] mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-aubergine)]">Leute in deiner Nähe finden</p>
              <p className="text-xs text-[var(--color-lavender)] mt-0.5">
                Teile deinen Standort, um Menschen aus der Umgebung zu entdecken. Andere sehen nur die ungefähre Entfernung — nie deinen genauen Standort.
              </p>
            </div>
            <button onClick={() => shareLocation()} disabled={locating}
              className="bg-[var(--color-amber)] text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60 flex-shrink-0">
              {locating ? '…' : 'Standort teilen'}
            </button>
          </div>
        )}

        {/* Nähe-Hinweis + Aktualisieren */}
        {data && data.meetPeopleEnabled && data.hasLocation && (
          <div className="flex items-center gap-2 mb-4 text-xs text-[var(--color-lavender)]">
            <i className="fa-solid fa-location-crosshairs text-[var(--color-amber)]" />
            <span>Nach Nähe zu deinem Standort sortiert</span>
            <button onClick={() => shareLocation()} disabled={locating}
              className="ml-auto font-semibold text-[var(--color-aubergine)] hover:underline disabled:opacity-60">
              {locating ? '…' : 'Aktualisieren'}
            </button>
          </div>
        )}

        {data === null ? (
          <div className="flex justify-center py-16 text-[var(--color-lavender)]"><i className="fa-solid fa-circle-notch fa-spin text-3xl" /></div>
        ) : data.suggestions.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-lavender)]">
            <i className="fa-regular fa-compass text-5xl mb-4 opacity-30" />
            <p className="font-semibold mb-1">Noch keine Vorschläge</p>
            <p className="text-sm">Merke dir ein paar Orte oder teile deinen Standort – dann finden wir passende Menschen.</p>
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
                    {p.distanceKm != null && (
                      <p className="text-[12px] text-[var(--color-aubergine)] mt-1 font-medium">
                        <i className="fa-solid fa-location-dot text-[var(--color-amber)] text-[10px] mr-1" />
                        {fmtDist(p.distanceKm)} entfernt
                      </p>
                    )}
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
