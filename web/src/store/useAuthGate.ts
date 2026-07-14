import { create } from 'zustand';

/**
 * Soft-Gate: die Seite ist öffentlich browsbar; sobald eine Interaktion ein Konto
 * braucht (speichern, einreichen, bewerten …), öffnet ein Login-Lightbox statt der Aktion.
 */
interface AuthGateState {
  open: boolean;
  /** Kurzer Kontext, warum das Login-Fenster kam (z.B. „um Orte zu speichern"). */
  reason: string | null;
  openGate: (reason?: string) => void;
  closeGate: () => void;
}

export const useAuthGate = create<AuthGateState>((set) => ({
  open: false,
  reason: null,
  openGate: (reason) => set({ open: true, reason: reason ?? null }),
  closeGate: () => set({ open: false, reason: null }),
}));
