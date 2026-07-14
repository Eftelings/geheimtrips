import { useCallback } from 'react';
import { useAuthStore } from '../store/useAuthStore.js';
import { useAuthGate } from '../store/useAuthGate.js';

/**
 * Gibt eine Funktion `gate(action, reason?)` zurück:
 *  - eingeloggt  → führt die Aktion aus
 *  - ausgeloggt  → öffnet stattdessen das Login-Lightbox (Aktion wird nicht ausgeführt)
 *
 * Für Buttons: `onClick={() => gate(() => save())}`.
 * `isLoggedIn` hilft bei rein anzeigenden Fällen (z.B. Link vs. Gate).
 */
export function useRequireAuth() {
  const user = useAuthStore(s => s.user);
  const openGate = useAuthGate(s => s.openGate);

  const gate = useCallback(
    (action?: () => void, reason?: string): boolean => {
      if (user) { action?.(); return true; }
      openGate(reason);
      return false;
    },
    [user, openGate],
  );

  return { gate, isLoggedIn: !!user };
}
