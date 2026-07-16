import { create } from 'zustand';

/**
 * Flüchtiger UI-Zustand über Layout-Grenzen hinweg (bewusst NICHT persistiert).
 *
 * `navPeek`: Die Bottom-Nav fährt nach unten aus dem Bild — der Swipe-Modus gehört ganz dem Ort.
 * Die Nav lebt in der AppShell, der Auslöser in der Entdecken-Seite — deshalb ein Store statt Props.
 */
interface UiState {
  navPeek: boolean;
  setNavPeek: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  navPeek: false,
  setNavPeek: (navPeek) => set({ navPeek }),
}));
