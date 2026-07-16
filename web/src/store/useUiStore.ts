import { create } from 'zustand';

/**
 * Flüchtiger UI-Zustand über Layout-Grenzen hinweg (bewusst NICHT persistiert).
 *
 * `navPeek`: Die Bottom-Nav fährt um ihre eigene Höhe nach unten — stehen bleibt nur der
 * Überstand des Entdecken-Kompasses. Der Swipe-Modus braucht das Bild ganz, soll den Weg
 * zurück aber nicht komplett verschlucken. Die Nav lebt in der AppShell, der Auslöser in der
 * Entdecken-Seite — deshalb ein Store statt Props.
 */
interface UiState {
  navPeek: boolean;
  setNavPeek: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  navPeek: false,
  setNavPeek: (navPeek) => set({ navPeek }),
}));
