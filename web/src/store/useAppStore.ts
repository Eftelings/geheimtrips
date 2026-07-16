import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Place, Trip, FunnelAnswers, Rating } from '../types/index.js';
import { placesApi, tripsApi, discoverApi } from '../services/api.js';

interface AppState {
  // ── Saved / Visited ─────────────────────────────────────────
  savedIds:   Set<string>;
  visitedIds: Set<string>;
  ratings:    Record<string, Rating>;
  savedTags:  Record<string, string[]>;   // placeId → eigene Tags
  photoLikes: Set<string>;                // gelikte Foto-URLs (Likes sortieren die Galerie)

  // ── Swipe-Entscheidungen ─────────────────────────────────────
  nopeIds:    Set<string>;   // „Nicht meins" — fliegt aus dem Feed & wird ausgeblendet

  toggleSave:  (placeId: string) => Promise<void>;
  markVisited: (placeId: string) => Promise<void>;
  swipeNope:   (placeId: string) => void;   // „Nicht meins" — entmerkt auch
  swipeSkip:   (placeId: string) => void;   // „Nächstes" — nur Signal, keine bleibende Wirkung
  togglePhotoLike: (placeId: string, url: string) => Promise<void>;
  addRating:   (placeId: string, rating: Rating) => Promise<void>;
  loadSavedTags: () => Promise<void>;
  setPlaceTags:  (placeId: string, tags: string[]) => Promise<void>;

  // ── Places cache ─────────────────────────────────────────────
  places:        Place[];
  placesLoaded:  boolean;
  placesLoadedAt: number;   // timestamp of last successful load
  loadPlaces:    () => Promise<void>;
  invalidatePlaces: () => void;  // force re-fetch on next loadPlaces call

  // ── Trips ─────────────────────────────────────────────────────
  trips:       Trip[];
  tripsLoaded: boolean;
  loadTrips:   () => Promise<void>;
  createTrip:  (data: { title: string; placeIds?: string[] }) => Promise<Trip>;
  updateTrip:  (id: number, data: object) => Promise<void>;
  deleteTrip:  (id: number) => Promise<void>;
  addPlaceToTrip: (tripId: number, placeId: string) => Promise<void>;

  // ── Funnel ────────────────────────────────────────────────────
  funnelAnswers: FunnelAnswers | null;
  setFunnelAnswers: (a: FunnelAnswers) => void;

  // ── Settings ──────────────────────────────────────────────────
  playVideos: boolean;
  setPlayVideos: (v: boolean) => void;
}

const DEFAULT_FUNNEL: FunnelAnswers = {
  when: null, location: '', transport: null,
  distanceMin: 60, budget: null,
  vibe: [50, 50, 50, 50],
  social: null, meetPeople: false,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      savedIds:   new Set<string>(),
      visitedIds: new Set<string>(),
      nopeIds:    new Set<string>(),
      photoLikes: new Set<string>(),
      ratings:    {},
      savedTags:  {},
      places:        [],
      placesLoaded:  false,
      placesLoadedAt: 0,
      trips:      [],
      tripsLoaded: false,
      funnelAnswers: null,
      playVideos: true,

      toggleSave: async (placeId) => {
        const { savedIds } = get();
        const isSaved = savedIds.has(placeId);
        const next = new Set(savedIds);
        if (isSaved) { next.delete(placeId); await placesApi.unsave(placeId).catch(() => {}); }
        else          { next.add(placeId);    await placesApi.save(placeId).catch(() => {}); }
        set({ savedIds: next });
      },

      markVisited: async (placeId) => {
        await placesApi.visit(placeId).catch(() => {});
        const next = new Set(get().visitedIds);
        next.add(placeId);
        set({ visitedIds: next });
      },

      // „Nicht meins" entmerkt auch: sonst stünde ein Ort weiter in „Meine Orte", über den man
      // gerade gesagt hat, dass er es nicht ist. Gilt bewusst überall, nicht nur im Aufräum-Modus.
      swipeNope: (placeId) => {
        discoverApi.swipe(placeId, 'dislike').catch(() => {});
        const saved = new Set(get().savedIds);
        if (saved.delete(placeId)) placesApi.unsave(placeId).catch(() => {});
        set({ nopeIds: new Set(get().nopeIds).add(placeId), savedIds: saved });
      },

      // „Nächstes": nur weiterblättern. Bewusst KEIN Merk-Set — der Ort kommt künftig wieder vor;
      // ans Backend geht ein „skip" (mildes Minus), nicht das alte „maybe" (+0.3 wäre gelogen).
      swipeSkip: (placeId) => { discoverApi.swipe(placeId, 'skip').catch(() => {}); },

      // Foto-Likes sortieren die Galerie (und damit das Titelbild). Zustand liegt wie savedIds
      // lokal + gespiegelt beim Server; die Server-Antwort gewinnt, falls wir danebenlagen.
      togglePhotoLike: async (placeId, url) => {
        const next = new Set(get().photoLikes);
        if (next.has(url)) next.delete(url); else next.add(url);
        set({ photoLikes: next });
        const res = await placesApi.likePhoto(placeId, url).catch(() => null);
        if (res && res.liked !== get().photoLikes.has(url)) {
          const fixed = new Set(get().photoLikes);
          if (res.liked) fixed.add(url); else fixed.delete(url);
          set({ photoLikes: fixed });
        }
      },

      addRating: async (placeId, rating) => {
        await placesApi.rate(placeId, rating).catch(() => {});
        set({ ratings: { ...get().ratings, [placeId]: rating } });
      },

      loadSavedTags: async () => {
        try { set({ savedTags: await placesApi.savedTags() }); } catch { /* */ }
      },

      setPlaceTags: async (placeId, tags) => {
        set({ savedTags: { ...get().savedTags, [placeId]: tags } });           // optimistisch
        try {
          const res = await placesApi.setTags(placeId, tags);
          set({ savedTags: { ...get().savedTags, [placeId]: res.tags } });
          if (!get().savedIds.has(placeId)) set({ savedIds: new Set(get().savedIds).add(placeId) });
        } catch { /* */ }
      },

      loadPlaces: async () => {
        const { placesLoaded, placesLoadedAt } = get();
        // Skip if loaded within the last 30 seconds (prevents excessive fetches)
        if (placesLoaded && Date.now() - placesLoadedAt < 30_000) return;
        const places = await placesApi.list();
        set({ places, placesLoaded: true, placesLoadedAt: Date.now() });
      },

      invalidatePlaces: () => set({ placesLoaded: false, placesLoadedAt: 0 }),

      loadTrips: async () => {
        const trips = await tripsApi.list();
        set({ trips, tripsLoaded: true });
      },

      createTrip: async (data) => {
        const trip = await tripsApi.create(data);
        set({ trips: [...get().trips, trip] });
        return trip;
      },

      updateTrip: async (id, data) => {
        const trip = await tripsApi.update(id, data);
        set({ trips: get().trips.map(t => t.id === id ? trip : t) });
      },

      deleteTrip: async (id) => {
        await tripsApi.delete(id);
        set({ trips: get().trips.filter(t => t.id !== id) });
      },

      addPlaceToTrip: async (tripId, placeId) => {
        await tripsApi.addPlace(tripId, placeId);
        await get().loadTrips();
      },

      setFunnelAnswers: (a) => set({ funnelAnswers: a }),
      setPlayVideos: (v) => set({ playVideos: v }),
    }),
    {
      name: 'geheimtrips-app',
      partialize: (s) => ({
        savedIds:    [...s.savedIds],
        visitedIds:  [...s.visitedIds],
        nopeIds:     [...s.nopeIds],
        photoLikes:  [...s.photoLikes],
        ratings:     s.ratings,
        savedTags:   s.savedTags,
        funnelAnswers: s.funnelAnswers,
        playVideos:  s.playVideos,
      }),
      merge: (persisted: any, current) => ({
        ...current,
        ...persisted,
        savedIds:   new Set<string>(persisted?.savedIds  ?? []),
        visitedIds: new Set<string>(persisted?.visitedIds ?? []),
        nopeIds:    new Set<string>(persisted?.nopeIds  ?? []),
        photoLikes: new Set<string>(persisted?.photoLikes ?? []),
      }),
    }
  )
);
