import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Avatar } from './Avatar.js';
import { rankingsApi } from '../../services/api.js';
import type { MyRankStats } from '../../services/api.js';
import type { RankingEntry, RankBoardId } from '../../types/index.js';

/**
 * Status-Stufen, Boards und die dazugehörigen Bausteine — eine Quelle für die
 * Prämien-Seite („Dein Status") UND das persönliche Profil, das dieselbe Kachel,
 * denselben Slider und eine auf 5 Plätze gekürzte Rangliste zeigt.
 */

// ─── Status-Stufen (monatlich) ────────────────────────────────────────────────
export type TierKey = 'legende' | 'insider' | 'localhero' | 'entdecker' | 'reisende' | 'rookie';

export const TIERS: {
  key: TierKey; name: string; pctLabel: string; icon: string; color: string; benefits: string[];
}[] = [
  { key: 'legende',   name: 'Legende',      pctLabel: 'Top 1 %',     icon: 'fa-crown',         color: '#E8A317',
    benefits: ['Maximale Rabatte bei allen Partnern', 'Exklusive Deals & goldenes Badge', 'Persönliches Dankeschön von David & Lea'] },
  { key: 'insider',   name: 'Insider:in',   pctLabel: 'Top 10 %',    icon: 'fa-gem',           color: '#7E57C2',
    benefits: ['Höhere Rabatte bei Museen & Freizeitparks', 'Früher Zugang zu neuen Features', 'Deine Tipps werden hervorgehoben'] },
  { key: 'localhero', name: 'Local Hero',   pctLabel: 'Top 25 %',    icon: 'fa-shield-halved', color: '#F99039',
    benefits: ['Rabatte bei Museen, Freizeitparks & Partnern', 'Local-Hero-Badge auf Profil & deinen Orten', 'Deine Geheimtipps erscheinen bevorzugt'] },
  { key: 'entdecker', name: 'Entdecker:in', pctLabel: 'Top 50 %',    icon: 'fa-compass',       color: '#8A6FB3',
    benefits: ['Du wirst anderen häufiger vorgeschlagen', 'Nur noch eine Stufe bis zu echten Rabatten!'] },
  { key: 'reisende',  name: 'Reisende:r',   pctLabel: 'Top 75 %',    icon: 'fa-person-hiking', color: '#A98FC4',
    benefits: ['Dein Entdecker-Profil ist freigeschaltet'] },
  { key: 'rookie',    name: 'Rookie',       pctLabel: 'Frisch dabei', icon: 'fa-seedling',     color: '#9AA0A6',
    benefits: ['Willkommen an Bord — sammle Punkte und steig auf!'] },
];
export const tierByKey = (k: string) => TIERS.find(t => t.key === k) ?? TIERS[TIERS.length - 1];

// ─── Rangliste-Boards ─────────────────────────────────────────────────────────
export const BOARDS: {
  id: RankBoardId; label: string; short: string; icon: string; noun: string; blurb: string;
  value: (e: RankingEntry) => string; sub?: (e: RankingEntry) => string;
}[] = [
  { id: 'gesamt', label: 'Gesamt', short: 'Gesamt', icon: 'fa-trophy', noun: 'Geheimtriper',
    blurb: 'Dein Monats-Score: 10 Punkte je besuchtem Ort · 20 je eingereichtem Ort · 15 je Quiz-Sieg. Er setzt sich jeden Monat zurück — bleib am Ball, um deinen Status zu halten!',
    value: e => `${e.mScore} Pkt`, sub: () => 'Monat' },
  { id: 'orte', label: 'Besuchte Orte', short: 'Besucht', icon: 'fa-location-dot', noun: 'Entdecker:innen',
    blurb: 'Wer war überall? Jeder Ort, den du vor Ort als besucht bestätigt hast, zählt hier.',
    value: e => `${e.orte} Orte` },
  { id: 'eingereicht', label: 'Eingereichte Orte', short: 'Eingereicht', icon: 'fa-pen-to-square', noun: 'Geheimtipp-Geber:innen',
    blurb: 'Wer teilt die meisten Geheimtipps? Jeder Ort, den du eingereicht hast, zählt hier.',
    value: e => `${e.eingereicht} Orte` },
  { id: 'quiz', label: 'Geheimquiz', short: 'Quiz', icon: 'fa-brain', noun: 'Geheimquizzer:innen',
    blurb: 'Die besten Köpfe im Geheimquiz — sortiert nach gewonnenen Spielen.',
    value: e => `${e.quizWins} Siege`, sub: e => `${e.winRate} % Quote` },
];

// ─── Status-Kachel ────────────────────────────────────────────────────────────
export function StatusTile({ stats, compact }: { stats: MyRankStats; compact?: boolean }) {
  const tier = tierByKey(stats.tierKey);
  const inactive = stats.mScore === 0;
  return (
    <div className={`rounded-3xl text-white relative overflow-hidden ${compact ? 'p-4' : 'p-5'}`}
      style={{ background: 'var(--color-lavender)' }}>
      <div className="relative flex items-center gap-4">
        <div className={`rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0 ${compact ? 'w-12 h-12' : 'w-16 h-16'}`}>
          <i className={`fa-solid ${tier.icon} ${compact ? 'text-2xl' : 'text-3xl'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white/70 text-xs font-semibold uppercase tracking-wider">Dein Status diesen Monat</div>
          <div className={`font-display font-bold leading-tight ${compact ? 'text-xl' : 'text-2xl'}`}>{tier.name}</div>
          <div className="text-white/80 text-sm">
            {inactive ? 'Werde aktiv, um aufzusteigen' : <>Du gehörst zu den <strong>{tier.pctLabel}</strong></>}
          </div>
        </div>
        {stats.isLocalHero && (
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <i className="fa-solid fa-shield-halved text-[var(--color-amber)] text-xl" />
            <span className="text-[9px] font-bold uppercase tracking-wide text-white/90 text-center leading-none">Local<br/>Hero</span>
          </div>
        )}
      </div>
      <div className="relative flex items-center gap-4 mt-4 pt-4 border-t border-white/15 text-sm">
        <div><span className="font-bold text-lg">#{stats.ranks.gesamt ?? '—'}</span> <span className="text-white/60">von {stats.total}</span></div>
        <div className="ml-auto text-white/80"><span className="font-bold">{stats.mScore}</span> Punkte im Monat</div>
      </div>
    </div>
  );
}

// ─── Status-Slider (alle Stufen + Boni) ───────────────────────────────────────
export function StatusSlider({ tierKey }: { tierKey: string }) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const drag      = useRef({ active: false, startX: 0, startScroll: 0 });
  const myTier    = tierByKey(tierKey);
  // Von links (Rookie) nach rechts (Legende) — Aufstieg nach rechts
  const sliderTiers = useMemo(() => [...TIERS].reverse(), []);

  // Eine Stufenkarte mittig zentrieren (Randkarten dank seitlicher Spacer ebenfalls)
  useEffect(() => {
    const cont = sliderRef.current;
    const el = cont?.querySelector<HTMLElement>(`[data-tier="${myTier.key}"]`);
    if (cont && el) cont.scrollTo({ left: el.offsetLeft - cont.clientWidth / 2 + el.clientWidth / 2 });
  }, [myTier.key]);

  const nudge = (dir: number) => sliderRef.current?.scrollBy({ left: dir * 236, behavior: 'smooth' });

  // Maus-Ziehen (Desktop) zusätzlich zum nativen Touch-Wischen
  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const cont = sliderRef.current; if (!cont) return;
    drag.current = { active: true, startX: e.clientX, startScroll: cont.scrollLeft };
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const cont = sliderRef.current; if (!cont || !drag.current.active) return;
    cont.scrollLeft = drag.current.startScroll - (e.clientX - drag.current.startX);
  };
  const onDragEnd = () => { drag.current.active = false; };

  return (
    <div className="relative">
      <button aria-label="Zurück" onClick={() => nudge(-1)}
        className="hidden md:flex absolute left-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white shadow-md items-center justify-center text-[var(--color-aubergine)] hover:bg-[var(--color-bg-soft)] transition-colors">
        <i className="fa-solid fa-chevron-left text-sm" />
      </button>
      <button aria-label="Weiter" onClick={() => nudge(1)}
        className="hidden md:flex absolute right-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white shadow-md items-center justify-center text-[var(--color-aubergine)] hover:bg-[var(--color-bg-soft)] transition-colors">
        <i className="fa-solid fa-chevron-right text-sm" />
      </button>

      <div ref={sliderRef}
        onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerLeave={onDragEnd}
        className="flex gap-3 overflow-x-auto pb-2 cursor-grab active:cursor-grabbing select-none touch-pan-x"
        style={{ scrollbarWidth: 'none', scrollSnapType: 'x proximity',
          maskImage: 'linear-gradient(to right, transparent 0, #000 2.5rem, #000 calc(100% - 2.5rem), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0, #000 2.5rem, #000 calc(100% - 2.5rem), transparent 100%)' }}>

        {/* Spacer links — erlaubt das mittige Zentrieren auch der ersten Karte */}
        <div aria-hidden className="flex-shrink-0" style={{ width: 'calc(50% - 7rem)' }} />

        {sliderTiers.map(t => {
          const active = t.key === myTier.key;
          return (
            <div key={t.key} data-tier={t.key}
              className={`flex-shrink-0 w-56 rounded-2xl p-4 border-2 transition-all ${
                active ? 'border-transparent text-white shadow-xl scale-[1.03]' : 'border-[var(--color-bg-soft)] bg-white'}`}
              style={{ scrollSnapAlign: 'center', ...(active ? { background: 'linear-gradient(135deg, #4a3268, #34254c)' } : {}) }}>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: active ? 'rgba(255,255,255,0.15)' : `${t.color}1a` }}>
                  <i className={`fa-solid ${t.icon} text-lg`} style={{ color: active ? '#fff' : t.color }} />
                </div>
                <div>
                  <div className={`font-bold text-sm leading-tight ${active ? 'text-white' : 'text-[var(--color-aubergine)]'}`}>{t.name}</div>
                  <div className={`text-[11px] font-semibold ${active ? 'text-[var(--color-amber)]' : 'text-[var(--color-lavender)]'}`}>{t.pctLabel}</div>
                </div>
              </div>
              <ul className="flex flex-col gap-1.5 mt-2">
                {t.benefits.map(b => (
                  <li key={b} className={`flex items-start gap-1.5 text-[11px] leading-snug ${active ? 'text-white/85' : 'text-[var(--color-lavender)]'}`}>
                    <i className={`fa-solid fa-check text-[9px] mt-1 flex-shrink-0 ${active ? 'text-[var(--color-amber)]' : 'text-[var(--color-lavender-lt)]'}`} />
                    {b}
                  </li>
                ))}
              </ul>
              {active && <div className="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-amber)]">◆ Deine Stufe</div>}
            </div>
          );
        })}

        {/* Spacer rechts */}
        <div aria-hidden className="flex-shrink-0" style={{ width: 'calc(50% - 7rem)' }} />
      </div>
    </div>
  );
}

// ─── Rangliste, gekürzt (fürs Profil) ─────────────────────────────────────────
export function MiniLeaderboard({ limit = 5, myId, onOpenUser, onOpenAll }: {
  limit?: number; myId?: number; onOpenUser: (id: number) => void; onOpenAll: () => void;
}) {
  const [board, setBoard]     = useState<RankBoardId>('gesamt');
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    rankingsApi.leaderboard(board).then(setEntries).catch(() => setEntries([])).finally(() => setLoading(false));
  }, [board]);

  const sel = BOARDS.find(b => b.id === board)!;

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {BOARDS.map(b => (
          <button key={b.id} onClick={() => setBoard(b.id)}
            className={`flex flex-col items-center gap-1.5 py-2 rounded-2xl border-2 transition-all ${
              board === b.id ? 'border-[var(--color-aubergine)] bg-[var(--color-aubergine)] text-white'
                             : 'border-[var(--color-bg-soft)] bg-white text-[var(--color-lavender)]'}`}>
            <i className={`fa-solid ${b.icon} text-sm`} />
            <span className="text-[10px] font-bold leading-tight text-center">{b.short}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-6 text-[var(--color-lavender-lt)]"><i className="fa-solid fa-circle-notch fa-spin" /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-6 text-[var(--color-lavender)] text-sm">Noch keine Platzierungen — sei der/die Erste!</div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.slice(0, limit).map((e, i) => {
            const rank = i + 1;
            const isMe = myId != null && e.id === myId;
            return (
              <button key={e.id} onClick={() => onOpenUser(e.id)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left active:scale-[0.99] transition-transform ${
                  isMe ? 'bg-[var(--color-amber)]/10 border-2 border-[var(--color-amber)]' : 'bg-white shadow-[var(--shadow-card)]'}`}>
                <span className={`font-bold text-sm w-6 text-center flex-shrink-0 ${rank <= 3 ? 'text-[var(--color-amber)]' : 'text-[var(--color-lavender)]'}`}>
                  {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
                </span>
                <Avatar name={e.name} src={e.avatarUrl} size={30} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-[var(--color-aubergine)] truncate flex items-center gap-1.5">
                    {e.name}{isMe && ' (Du)'}
                    {e.isLocalHero && <i className="fa-solid fa-shield-halved text-[var(--color-amber)] text-[11px]" title="Local Hero" />}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-bold text-sm text-[var(--color-aubergine)]">{sel.value(e)}</div>
                  {sel.sub && <div className="text-[10px] text-[var(--color-lavender-lt)]">{sel.sub(e)}</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <button onClick={onOpenAll} className="w-full mt-2.5 text-[11px] font-bold text-[var(--color-amber)] py-1.5">
        Ganze Rangliste ansehen <i className="fa-solid fa-chevron-right text-[9px] ml-0.5" />
      </button>
    </div>
  );
}
