import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { useAppStore } from '../store/useAppStore.js';
import { SpotlightCard } from './DiscoverPage.js';

export function AwardsPage() {
  const navigate = useNavigate();
  const { places, loadPlaces } = useAppStore();
  useEffect(() => { loadPlaces(); }, []); // eslint-disable-line

  return (
    <AppShell title="Awards" showBack>
      <div className="px-5 py-6 max-w-3xl mx-auto">
        <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)] mb-1" style={{ letterSpacing: '-0.02em' }}>
          Geheimtrips <em className="italic text-[var(--color-amber)]">Awards</em>
        </h1>
        <p className="text-sm text-[var(--color-lavender)] mb-5">
          Die bestbewerteten Geheimtipps — von verifizierten Besucher:innen gekürt.
        </p>
        <SpotlightCard places={places} onNavigate={navigate} />
      </div>
    </AppShell>
  );
}
