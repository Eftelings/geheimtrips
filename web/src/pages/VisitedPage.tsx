import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AppShell } from '../components/layout/AppShell.js';
import { LegalFooter } from '../components/layout/LegalFooter.js';
import { BottomSheet } from '../components/ui/BottomSheet.js';
import { PlaceImage } from '../components/ui/PlaceImage.js';
import { useAppStore } from '../store/useAppStore.js';
import { placesApi } from '../services/api.js';
import type { VisitedPlace } from '../services/api.js';
import type { Place, Rating } from '../types/index.js';

// ─── Rating-Sheet (unverändert) ───────────────────────────────────────────────
function RatingSheet({ existingRating, onSubmit }: { existingRating?: Rating; onSubmit: (r: Rating) => void }) {
  const [stars, setStars]     = useState(existingRating?.stars ?? 0);
  const [mood, setMood]       = useState(existingRating?.mood ?? 0);
  const [accurate, setAccurate] = useState(existingRating?.descriptionAccurate ?? 0);
  const [timeSpent, setTimeSpent] = useState<Rating['timeSpent']>(existingRating?.timeSpent);
  const [companions, setCompanions] = useState<string[]>(existingRating?.companions ?? []);

  const toggleCompanion = (c: string) => setCompanions(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  return (
    <>
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-2">Deine Bewertung</p>
        <div className="flex gap-2 justify-center">
          {[1,2,3,4,5].map(s => (
            <button key={s} onClick={() => setStars(s)}
              className={`text-3xl transition-transform active:scale-110 ${s <= stars ? 'text-[var(--color-amber)]' : 'text-[var(--color-bg-soft)]'}`}>★</button>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-1">Wie war die Stimmung vor Ort?</p>
        <p className="text-[11px] text-[var(--color-lavender-lt)] mb-2">Das Gefühl am Ort – unabhängig von der Sterne-Wertung.</p>
        <div className="flex gap-2">
          {['😞','😐','🙂','😊','🤩'].map((emoji, i) => (
            <button key={i} onClick={() => setMood(i + 1)}
              className={`flex-1 py-2 text-xl rounded-xl transition-all ${mood === i + 1 ? 'bg-[var(--color-amber)]/15 scale-110 ring-2 ring-[var(--color-amber)]' : 'bg-[var(--color-bg-soft)]'}`}>{emoji}</button>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-2">War die Beschreibung zutreffend?</p>
        <div className="flex gap-2">
          {['Gar nicht','Kaum','Teilweise','Größtenteils','Perfekt'].map((l, i) => (
            <button key={i} onClick={() => setAccurate(i + 1)}
              className={`flex-1 py-1.5 text-[10px] font-semibold rounded-xl transition-colors ${accurate === i + 1 ? 'bg-[var(--color-aubergine)] text-white' : 'bg-[var(--color-bg-soft)] text-[var(--color-lavender)]'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-2">Wie viel Zeit hast du verbracht?</p>
        <div className="grid grid-cols-2 gap-2">
          {([['<1h','< 1 Stunde'],['1-3h','1–3 Stunden'],['halber-tag','Halber Tag'],['tagesfüllend','Tagesfüllend']] as const).map(([val, l]) => (
            <button key={val} onClick={() => setTimeSpent(val as Rating['timeSpent'])}
              className={`py-2 text-xs font-semibold rounded-xl transition-colors ${timeSpent === val ? 'bg-[var(--color-aubergine)] text-white' : 'bg-[var(--color-bg-soft)] text-[var(--color-lavender)]'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-2">Mit wem warst du dort?</p>
        <div className="flex flex-wrap gap-2">
          {[{id:'solo',label:'Solo',icon:'fa-person'},{id:'date',label:'Date',icon:'fa-heart'},{id:'freunde',label:'Freunde',icon:'fa-users'},{id:'familie',label:'Familie',icon:'fa-house-user'}].map(c => (
            <button key={c.id} onClick={() => toggleCompanion(c.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${companions.includes(c.id) ? 'bg-[var(--color-aubergine)] text-white' : 'bg-[var(--color-bg-soft)] text-[var(--color-aubergine)]'}`}>
              <i className={`fa-solid ${c.icon} text-[10px]`} />{c.label}
            </button>
          ))}
        </div>
      </div>
      <button onClick={() => stars && onSubmit({ stars, mood: mood || undefined, descriptionAccurate: accurate || undefined, timeSpent, companions: companions.length ? companions : undefined })}
        disabled={!stars}
        className="w-full bg-[var(--color-amber)] text-white font-bold py-3.5 rounded-xl text-sm shadow-[var(--shadow-amber)] disabled:opacity-40">
        Bewertung speichern
      </button>
    </>
  );
}

// ─── Stars-Mini ───────────────────────────────────────────────────────────────
function Stars({ n }: { n: number }) {
  return <div className="flex">{[1,2,3,4,5].map(s => <span key={s} className={`text-sm ${s <= n ? 'text-[var(--color-amber)]' : 'text-[var(--color-bg-soft)]'}`}>★</span>)}</div>;
}

// ─── Sortierbare Lieblingsorte-Karte ──────────────────────────────────────────
function FavCard({ place, rank, stars, onOpen, onRate }: {
  place: VisitedPlace; rank: number; stars: number; onOpen: () => void; onRate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: place.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-3 bg-white rounded-2xl p-3 shadow-[var(--shadow-card)]">
      <button {...attributes} {...listeners} className="text-[var(--color-lavender-lt)] cursor-grab active:cursor-grabbing px-0.5 touch-none">
        <i className="fa-solid fa-grip-lines" />
      </button>
      <span className="font-display font-bold text-lg w-7 text-center flex-shrink-0"
        style={{ color: rank <= 3 ? 'var(--color-amber)' : 'var(--color-lavender-lt)' }}>{rank}</span>
      <button onClick={onOpen} className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
        <PlaceImage src={place.hero} category={place.category} alt={place.name} className="w-full h-full object-cover" iconClass="text-lg" />
      </button>
      <div className="flex-1 min-w-0" onClick={onOpen}>
        <div className="font-semibold text-sm text-[var(--color-aubergine)] truncate">{place.name}</div>
        <div className="text-xs text-[var(--color-lavender)] truncate">{place.region}</div>
        <div className="mt-1">{stars > 0 ? <Stars n={stars} /> : (
          <button onClick={e => { e.stopPropagation(); onRate(); }} className="text-[10px] font-semibold text-[var(--color-amber)]">
            <i className="fa-regular fa-star mr-1" />Bewerten
          </button>)}</div>
      </div>
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export function VisitedPage() {
  const navigate = useNavigate();
  const { ratings, addRating } = useAppStore();
  const [view, setView] = useState<'timeline' | 'favorites'>('timeline');
  const [visited, setVisited] = useState<VisitedPlace[]>([]);
  // null = automatisch nach Bewertung; Array = eigene (manuell gezogene) Reihenfolge
  const [manualOrder, setManualOrder] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratingTarget, setRatingTarget] = useState<Place | null>(null);
  const [toast, setToast] = useState('');

  const ratingFor = (id: string) => ratings[id]?.stars ?? 0;

  async function load() {
    const v = await placesApi.myVisited().catch(() => [] as VisitedPlace[]);
    setVisited(v);
    // Gespeicherte manuelle Reihenfolge übernehmen (sonst bleibt es Auto-Sortierung)
    const saved = v.filter(p => p.favoritePosition != null).sort((a, b) => a.favoritePosition! - b.favoritePosition!);
    setManualOrder(saved.length ? saved.map(p => p.id) : null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  // Auto-Sortierung: nach eigener Bewertung (absteigend), dann Besuchsdatum — live
  const ratingSorted = useMemo(() =>
    [...visited].sort((a, b) => ratingFor(b.id) - ratingFor(a.id) || (b.visitedAt ?? '').localeCompare(a.visitedAt ?? '')),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [visited, ratings]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Zeitstrahl: nach Datum (neueste oben), gruppiert nach Monat
  const timeline = useMemo(() => {
    const sorted = [...visited].sort((a, b) => (b.visitedAt ?? '').localeCompare(a.visitedAt ?? ''));
    const groups: { label: string; items: VisitedPlace[] }[] = [];
    for (const p of sorted) {
      const d = p.visitedAt ? new Date(p.visitedAt) : null;
      const label = d ? d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) : 'Ohne Datum';
      let g = groups.find(x => x.label === label);
      if (!g) { g = { label, items: [] }; groups.push(g); }
      g.items.push(p);
    }
    return groups;
  }, [visited]);

  // Anzeige-Reihenfolge: manuelle Reihenfolge falls vorhanden, sonst Auto nach Bewertung
  const favPlaces = useMemo(() => {
    if (!manualOrder) return ratingSorted;
    const byId = new Map(visited.map(p => [p.id, p]));
    const inOrder = manualOrder.map(id => byId.get(id)).filter((p): p is VisitedPlace => !!p);
    // neu hinzugekommene (noch nicht einsortierte) besuchte Orte hinten anhängen
    const missing = ratingSorted.filter(p => !manualOrder.includes(p.id));
    return [...inOrder, ...missing];
  }, [manualOrder, ratingSorted, visited]);

  const isManual = manualOrder !== null;

  function onDragEnd(e: { active: { id: unknown }; over: { id: unknown } | null }) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = favPlaces.map(p => p.id);
    const oldI = ids.indexOf(e.active.id as string);
    const newI = ids.indexOf(e.over.id as string);
    if (oldI < 0 || newI < 0) return;
    const next = arrayMove(ids, oldI, newI);
    setManualOrder(next);
    placesApi.saveFavorites(next).catch(() => {});
  }

  // Zurück zur automatischen Sortierung nach Bewertung (löscht die manuelle Reihenfolge)
  function resetToRating() {
    setManualOrder(null);
    placesApi.saveFavorites([]).catch(() => {});
  }

  async function handleRating(place: Place, rating: Rating) {
    await addRating(place.id, rating);
    setRatingTarget(null);
    setToast(place.name);
    setTimeout(() => setToast(''), 2500);
  }

  const ratedCount = visited.filter(p => ratingFor(p.id) > 0).length;

  return (
    <AppShell>
      <div className="px-6 pt-5 max-w-2xl mx-auto md:max-w-none md:px-8">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-1">Besuchte Orte</p>
        <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)] mb-1" style={{ letterSpacing: '-0.02em' }}>
          Wo ich schon <em className="italic text-[var(--color-amber)]">war</em>
        </h1>
        <p className="text-sm text-[var(--color-lavender)] mb-5">
          {visited.length} besuchte Orte — {ratedCount} bewertet
        </p>

        {/* View-Umschalter */}
        {visited.length > 0 && (
          <div className="flex gap-1 p-1 bg-[var(--color-bg-soft)] rounded-2xl mb-5 w-fit">
            {([['timeline','fa-timeline','Zeitstrahl'],['favorites','fa-heart','Lieblingsorte']] as const).map(([id, icon, label]) => (
              <button key={id} onClick={() => setView(id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${view === id ? 'bg-white text-[var(--color-aubergine)] shadow-sm' : 'text-[var(--color-lavender)]'}`}>
                <i className={`fa-solid ${icon}`} />{label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16 text-[var(--color-lavender-lt)]"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>
        ) : visited.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--color-lavender)]">
            <i className="fa-solid fa-map-location-dot text-5xl mb-4 opacity-20" />
            <p className="font-semibold mb-1">Noch keine besuchten Orte</p>
            <p className="text-sm text-center">Verifiziere deinen Besuch auf der Ortsseite, um Punkte zu sammeln.</p>
            <button onClick={() => navigate('/')} className="mt-4 bg-[var(--color-amber)] text-white font-bold px-5 py-2.5 rounded-full text-sm shadow-[var(--shadow-amber)]">
              Orte entdecken
            </button>
          </div>
        ) : view === 'timeline' ? (
          /* ── Zeitstrahl ── */
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-[var(--color-bg-soft)]" />
            <div className="flex flex-col gap-6">
              {timeline.map(group => (
                <div key={group.label}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-4 h-4 rounded-full bg-[var(--color-amber)] ring-4 ring-[var(--color-bg)] z-10 flex-shrink-0" />
                    <h2 className="font-display font-bold text-sm text-[var(--color-aubergine)] capitalize">{group.label}</h2>
                    <span className="text-[10px] text-[var(--color-lavender-lt)]">{group.items.length} Ort{group.items.length !== 1 ? 'e' : ''}</span>
                  </div>
                  <div className="flex flex-col gap-2.5 ml-8">
                    {group.items.map(place => {
                      const stars = ratingFor(place.id);
                      const d = place.visitedAt ? new Date(place.visitedAt) : null;
                      return (
                        <div key={place.id} className="bg-white rounded-2xl shadow-[var(--shadow-card)] flex gap-3 p-3">
                          <button onClick={() => navigate(`/ort/${place.id}`)} className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                            <PlaceImage src={place.hero} category={place.category} alt={place.name} className="w-full h-full object-cover" iconClass="text-lg" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-display font-semibold text-sm text-[var(--color-aubergine)] leading-tight truncate">{place.name}</div>
                                <div className="text-xs text-[var(--color-lavender)] flex items-center gap-1 mt-0.5">
                                  <i className="fa-solid fa-location-dot text-[10px]" />{place.region}
                                </div>
                              </div>
                              {d && <span className="flex-shrink-0 text-[10px] font-semibold text-[var(--color-lavender)]">{d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}</span>}
                            </div>
                            <div className="mt-2">
                              {stars > 0 ? (
                                <div className="flex items-center gap-2">
                                  <Stars n={stars} />
                                  <button onClick={() => setRatingTarget(place)} className="text-[10px] text-[var(--color-lavender-lt)] underline">Ändern</button>
                                </div>
                              ) : (
                                <button onClick={() => setRatingTarget(place)}
                                  className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-amber)] bg-[var(--color-amber)]/10 px-3 py-1 rounded-full">
                                  <i className="fa-regular fa-star text-[10px]" /> Bewerten
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── Lieblingsorte ── */
          <>
            <div className="flex items-start gap-2.5 bg-[#F1ECF4] rounded-2xl px-4 py-3 mb-3">
              <i className="fa-solid fa-wand-magic-sparkles text-[#71587A] mt-0.5" />
              <p className="text-xs text-[var(--color-lavender)] leading-relaxed">
                {isManual
                  ? 'Deine eigene Rangfolge. '
                  : 'Automatisch nach deiner Sterne-Bewertung sortiert — zieh die Karten für deine eigene Rangfolge. '}
                <strong className="text-[var(--color-aubergine)]">Deine Lieblingsorte beeinflussen, welche Orte wir dir vorschlagen.</strong>
              </p>
            </div>
            {isManual && (
              <button onClick={resetToRating}
                className="mb-3 text-xs font-bold text-[var(--color-amber)] flex items-center gap-1.5">
                <i className="fa-solid fa-arrow-rotate-left" />Automatisch nach Bewertung sortieren
              </button>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={favPlaces.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2.5">
                  {favPlaces.map((place, i) => (
                    <FavCard key={place.id} place={place} rank={i + 1} stars={ratingFor(place.id)}
                      onOpen={() => navigate(`/ort/${place.id}`)} onRate={() => setRatingTarget(place)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}
      </div>

      <BottomSheet open={!!ratingTarget} onClose={() => setRatingTarget(null)} title={ratingTarget ? `${ratingTarget.name} bewerten` : ''}>
        {ratingTarget && (
          <RatingSheet existingRating={ratings[ratingTarget.id]} onSubmit={r => handleRating(ratingTarget, r)} />
        )}
      </BottomSheet>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 bg-[var(--color-aubergine)] text-white px-4 py-2.5 rounded-full shadow-[var(--shadow-raised)] text-sm font-semibold"
          style={{ animation: 'gtFade 0.2s ease' }}>
          <i className="fa-solid fa-star text-[var(--color-amber)]" />{toast} bewertet!
        </div>
      )}

      <LegalFooter />
    </AppShell>
  );
}
