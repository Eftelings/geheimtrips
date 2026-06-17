import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Place, Trip, FunnelAnswers, Rating } from '../types/index.js';
import { placesApi, tripsApi } from '../services/api.js';

interface AppState {
  // ── Saved / Visited ─────────────────────────────────────────
  savedIds:   Set<string>;
  visitedIds: Set<string>;
  ratings:    Record<string, Rating>;

  toggleSave:  (placeId: string) => Promise<void>;
  markVisited: (placeId: string) => Promise<void>;
  addRating:   (placeId: string, rating: Rating) => Promise<void>;

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
      ratings:    {},
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

      addRating: async (placeId, rating) => {
        await placesApi.rate(placeId, rating).catch(() => {});
        set({ ratings: { ...get().ratings, [placeId]: rating } });
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
        ratings:     s.ratings,
        funnelAnswers: s.funnelAnswers,
        playVideos:  s.playVideos,
      }),
      merge: (persisted: any, current) => ({
        ...current,
        ...persisted,
        savedIds:   new Set<string>(persisted?.savedIds  ?? []),
        visitedIds: new Set<string>(persisted?.visitedIds ?? []),
      }),
    }
  )
);
