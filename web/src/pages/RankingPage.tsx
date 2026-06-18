import { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../components/layout/AppShell.js';
import { LegalFooter } from '../components/layout/LegalFooter.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { rankingsApi } from '../services/api.js';
import type { MyRankStats } from '../services/api.js';
import type { RankingEntry, RankBoardId } from '../types/index.js';
import { Avatar } from '../components/ui/Avatar.js';

// ─── Status-Stufen (monatlich) ────────────────────────────────────────────────
type TierKey = 'legende' | 'insider' | 'localhero' | 'entdecker' | 'reisende' | 'rookie';

const TIERS: {
  key: TierKey; name: string; pctLabel: string; icon: string; color: string; benefits: string[];
}[] = [
  { key: 'legende',   name: 'Legende',      pctLabel: 'Top 1 %',     icon: 'fa-crown',         color: '#E8A317',
    benefits: ['Exklusive Partner-Deals', 'Goldenes Legenden-Badge', 'Persönliches Dankeschön von David & Lea'] },
  { key: 'insider',   name: 'Insider:in',   pctLabel: 'Top 10 %',    icon: 'fa-gem',           color: '#7E57C2',
    benefits: ['Früher Zugang zu neuen Features', 'Local-Hero-Badge', 'Deine Tipps werden hervorgehoben'] },
  { key: 'localhero', name: 'Local Hero',   pctLabel: 'Top 25 %',    icon: 'fa-shield-halved', color: '#F99039',
    benefits: ['Local-Hero-Badge auf Profil & deinen Orten', 'Deine Geheimtipps erscheinen bevorzugt'] },
  { key: 'entdecker', name: 'Entdecker:in', pctLabel: 'Top 50 %',    icon: 'fa-compass',       color: '#8A6FB3',
    benefits: ['Du wirst anderen häufiger vorgeschlagen'] },
  { key: 'reisende',  name: 'Reisende:r',   pctLabel: 'Top 75 %',    icon: 'fa-person-hiking', color: '#A98FC4',
    benefits: ['Dein Entdecker-Profil ist freigeschaltet'] },
  { key: 'rookie',    name: 'Rookie',       pctLabel: 'Frisch dabei', icon: 'fa-seedling',     color: '#9AA0A6',
    benefits: ['Willkommen an Bord — sammle Punkte und steig auf!'] },
];
const tierByKey = (k: string) => TIERS.find(t => t.key === k) ?? TIERS[TIERS.length - 1];

// ─── Rangliste-Boards ─────────────────────────────────────────────────────────
const BOARDS: {
  id: RankBoardId; label: string; short: string; icon: string; noun: string; blurb: string;
  value: (e: RankingEntry) => string; sub?: (e: RankingEntry) => string;
}[] = [
  { id: 'gesamt', label: 'Gesamt', short: 'Gesamt', icon: 'fa-trophy', noun: 'Geheimtripper',
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

export function RankingPage() {
  const { user } = useAuthStore();
  const [board, setBoard]           = useState<RankBoardId>('gesamt');
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [entries, setEntries]       = useState<RankingEntry[]>([]);
  const [myStats, setMyStats]       = useState<MyRankStats | null>(null);
  const [loading, setLoading]       = useState(true);

  const listRef   = useRef<HTMLDivElement>(null);
  const meRowRef  = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => { rankingsApi.me().then(setMyStats).catch(() => setMyStats(null)); }, []);

  useEffect(() => {
    setLoading(true);
    rankingsApi.leaderboard(board, friendsOnly).then(setEntries).finally(() => setLoading(false));
  }, [board, friendsOnly]);

  const myTier = tierByKey(myStats?.tierKey ?? 'rookie');
  // Slider von links (Rookie) nach rechts (Legende) — Aufstieg nach rechts
  const sliderTiers = useMemo(() => [...TIERS].reverse(), []);

  // Aktuelle Stufe im Slider zentrieren
  useEffect(() => {
    const cont = sliderRef.current;
    const el = cont?.querySelector<HTMLElement>(`[data-tier="${myTier.key}"]`);
    if (cont && el) cont.scrollLeft = el.offsetLeft - cont.clientWidth / 2 + el.clientWidth / 2;
  }, [myTier.key]);

  // Eigene Zeile im Ranglisten-Fenster zentrieren
  useEffect(() => {
    const cont = listRef.current, row = meRowRef.current;
    if (cont && row) cont.scrollTop = row.offsetTop - cont.clientHeight / 2 + row.clientHeight / 2;
  }, [entries]);

  const selBoard = BOARDS.find(b => b.id === board)!;
  const myRank   = myStats?.ranks[board] ?? null;
  const total    = myStats?.total ?? 0;

  // Perzentil für die „Top X %"-Überschrift
  const pct = board === 'gesamt'
    ? (myStats?.percentile ?? 1)
    : (myRank && total ? myRank / total : 1);
  const topPct = Math.max(1, Math.ceil(pct * 100));
  const inactiveGesamt = board === 'gesamt' && (myStats?.mScore ?? 0) === 0;
  const showTopline = !!user && !!myRank && !inactiveGesamt;

  return (
    <AppShell>
      <div className="px-5 pt-5 max-w-2xl mx-auto md:max-w-3xl md:px-8 pb-10">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-1">Prämien</p>
        <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)] mb-5" style={{ letterSpacing: '-0.02em' }}>
          Dein <em className="italic">Status</em>
        </h1>

        {/* ── Status-Kachel ── */}
        {myStats && user && (
          <div className="rounded-3xl p-5 mb-4 text-white relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${myTier.color}, #34254c 75%)` }}>
            <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-20"
              style={{ background: 'radial-gradient(circle, #fff, transparent 70%)' }} />
            <div className="relative flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <i className={`fa-solid ${myTier.icon} text-3xl`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white/70 text-xs font-semibold uppercase tracking-wider">Dein Status diesen Monat</div>
                <div className="font-display font-bold text-2xl leading-tight">{myTier.name}</div>
                <div className="text-white/80 text-sm">
                  {inactiveGesamt
                    ? 'Werde aktiv, um aufzusteigen'
                    : <>Du gehörst zu den <strong>{myTier.pctLabel.replace('Top ', 'Top ')}</strong></>}
                </div>
              </div>
              {myStats.isLocalHero && (
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <i className="fa-solid fa-shield-halved text-[var(--color-amber)] text-xl" />
                  <span className="text-[9px] font-bold uppercase tracking-wide text-white/90 text-center leading-none">Local<br/>Hero</span>
                </div>
              )}
            </div>
            <div className="relative flex items-center gap-4 mt-4 pt-4 border-t border-white/15 text-sm">
              <div><span className="font-bold text-lg">#{myStats.ranks.gesamt ?? '—'}</span> <span className="text-white/60">von {total}</span></div>
              <div className="ml-auto text-white/80"><span className="font-bold">{myStats.mScore}</span> Punkte im Monat</div>
            </div>
          </div>
        )}

        {/* ── Status-Slider (alle Stufen + Boni) ── */}
        <div ref={sliderRef} className="flex gap-3 overflow-x-auto pb-2 mb-6 -mx-5 px-5 snap-x"
          style={{ scrollbarWidth: 'none' }}>
          {sliderTiers.map(t => {
            const active = t.key === myTier.key;
            return (
              <div key={t.key} data-tier={t.key}
                className={`flex-shrink-0 w-56 rounded-2xl p-4 snap-center border-2 transition-all ${
                  active ? 'border-transparent text-white shadow-lg' : 'border-[var(--color-bg-soft)] bg-white'}`}
                style={active ? { background: 'linear-gradient(135deg, #4a3268, #34254c)' } : undefined}>
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
        </div>

        {/* ── Board-Auswahl ── */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {BOARDS.map(b => (
            <button key={b.id} onClick={() => setBoard(b.id)}
              className={`flex flex-col items-center gap-1.5 py-2.5 rounded-2xl border-2 transition-all ${
                board === b.id ? 'border-[var(--color-aubergine)] bg-[var(--color-aubergine)] text-white'
                               : 'border-[var(--color-bg-soft)] bg-white text-[var(--color-lavender)] hover:border-[var(--color-aubergine)]'}`}>
              <i className={`fa-solid ${b.icon} text-base`} />
              <span className="text-[10px] font-bold leading-tight text-center">{b.short}</span>
            </button>
          ))}
        </div>

        {/* Erläuterung des gewählten Boards */}
        <div className="flex items-start gap-2.5 bg-[var(--color-bg-soft)] rounded-2xl px-4 py-3 mb-4">
          <i className={`fa-solid ${selBoard.icon} text-[var(--color-amber)] mt-0.5`} />
          <p className="text-xs text-[var(--color-lavender)] leading-relaxed">{selBoard.blurb}</p>
        </div>

        {/* „Top X %"-Überschrift (LinkedIn-Stil) + Freunde-Toggle */}
        <div className="flex items-center justify-between gap-3 mb-3">
          {showTopline ? (
            <div className="flex items-center gap-2 min-w-0">
              <i className={`fa-solid ${selBoard.icon} text-[var(--color-amber)]`} />
              <p className="text-sm text-[var(--color-aubergine)] font-semibold truncate">
                Top <span className="text-[var(--color-amber)] font-bold">{topPct} %</span> der {selBoard.noun}
              </p>
            </div>
          ) : <div className="text-xs text-[var(--color-lavender)]">Noch nicht platziert — leg los!</div>}

          <button onClick={() => setFriendsOnly(v => !v)}
            className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-full border-2 flex-shrink-0 transition-all ${
              friendsOnly ? 'border-[var(--color-amber)] bg-[var(--color-amber)] text-white'
                          : 'border-[var(--color-bg-soft)] text-[var(--color-lavender)]'}`}>
            <i className="fa-solid fa-user-group" /> Nur Freunde
          </button>
        </div>

        {/* ── Ranglisten-Fenster (scrollbar, eigene Position zentriert) ── */}
        {loading ? (
          <div className="flex justify-center py-8 text-[var(--color-lavender-lt)]"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-[var(--color-lavender)] text-sm">
            <i className="fa-solid fa-ranking-star text-4xl mb-3 block opacity-30" />
            {friendsOnly ? 'Noch keine Freunde in dieser Wertung.' : 'Noch keine Platzierungen — sei der/die Erste!'}
          </div>
        ) : (
          <div ref={listRef} className="flex flex-col gap-2 overflow-y-auto pr-1" style={{ maxHeight: 320 }}>
            {entries.map((e, i) => {
              const rank = i + 1;
              const isMe = user && e.id === myStats?.id;
              return (
                <div key={e.id} ref={isMe ? meRowRef : undefined}
                  className={`flex items-center gap-3 p-3 rounded-xl flex-shrink-0 ${
                    isMe ? 'bg-[var(--color-amber)]/10 border-2 border-[var(--color-amber)]' : 'bg-white shadow-[var(--shadow-card)]'}`}>
                  <span className={`font-bold text-sm w-7 text-center flex-shrink-0 ${rank <= 3 ? 'text-[var(--color-amber)]' : 'text-[var(--color-lavender)]'}`}>
                    {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
                  </span>
                  <Avatar name={e.name} src={e.avatarUrl} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-[var(--color-aubergine)] truncate flex items-center gap-1.5">
                      {e.name}{isMe && ' (Du)'}
                      {e.isLocalHero && <i className="fa-solid fa-shield-halved text-[var(--color-amber)] text-[11px]" title="Local Hero" />}
                    </div>
                    {e.handle && <div className="text-[10px] text-[var(--color-lavender-lt)]">@{e.handle}</div>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-sm text-[var(--color-aubergine)]">{selBoard.value(e)}</div>
                    {selBoard.sub && <div className="text-[10px] text-[var(--color-lavender-lt)]">{selBoard.sub(e)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {entries.length > 5 && !loading && (
          <p className="text-center text-[10px] text-[var(--color-lavender-lt)] mt-2">
            <i className="fa-solid fa-arrows-up-down mr-1" /> Scrolle durch die gesamte Rangliste
          </p>
        )}
      </div>
      <LegalFooter />
    </AppShell>
  );
}
