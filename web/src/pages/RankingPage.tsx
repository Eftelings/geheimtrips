import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/layout/AppShell.js';
import { LegalFooter } from '../components/layout/LegalFooter.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { rankingsApi } from '../services/api.js';
import type { MyRankStats } from '../services/api.js';
import type { RankingEntry, RankBoardId, PerkEntry } from '../types/index.js';
import { Avatar } from '../components/ui/Avatar.js';

// Board-Definitionen: Label, Icon, Erklärung, Wert-Formatierung
const BOARDS: {
  id: RankBoardId; label: string; icon: string; blurb: string;
  value: (e: RankingEntry) => string; sub?: (e: RankingEntry) => string;
}[] = [
  {
    id: 'orte', label: 'Besuchte Orte', icon: 'fa-location-dot',
    blurb: 'Wer war überall? Hier zählt jeder Ort, den du vor Ort per GPS als besucht bestätigt hast.',
    value: e => `${e.orte} Orte`,
  },
  {
    id: 'quiz', label: 'Geheimquiz', icon: 'fa-brain',
    blurb: 'Die besten Köpfe im Geheimquiz — sortiert nach gewonnenen Spielen. Spiel mit und klettere nach oben!',
    value: e => `${e.quizWins} Siege`,
    sub:   e => `${e.winRate} % Quote · ${e.quizPlayed} Spiele`,
  },
  {
    id: 'punkte', label: 'Geheimtripspunkte', icon: 'fa-star',
    blurb: 'Dein Gesamtscore: 10 Punkte je besuchtem Ort plus 20 Punkte je Quiz-Sieg. Die Allround-Wertung.',
    value: e => `${e.punkte} Pkt`,
    sub:   e => e.level.label,
  },
];

const BOARD_LABEL: Record<RankBoardId, string> = {
  orte: 'Besuchte Orte', quiz: 'Geheimquiz', punkte: 'Geheimtripspunkte',
};

export function RankingPage() {
  const { user } = useAuthStore();
  const [board, setBoard]     = useState<RankBoardId>('orte');
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [myStats, setMyStats] = useState<MyRankStats | null>(null);
  const [perks, setPerks]     = useState<PerkEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPerk, setOpenPerk] = useState<number | null>(null);

  // Rangliste hängt am gewählten Board
  useEffect(() => {
    setLoading(true);
    rankingsApi.leaderboard(board).then(setEntries).finally(() => setLoading(false));
  }, [board]);

  // Eigene Stats + ALLE Vorteile (board-unabhängig) — einmalig laden,
  // damit die Vorteile immer sichtbar sind, egal welches Ranking oben aktiv ist
  useEffect(() => {
    rankingsApi.me().then(setMyStats).catch(() => setMyStats(null));
    rankingsApi.perks().then(setPerks).catch(() => setPerks([]));
  }, []);

  const cfg = BOARDS.find(b => b.id === board)!;
  const myRank = myStats?.ranks[board] ?? null;

  // Fenster: 3 über mir + ich + 3 unter mir (sonst Top 7)
  const windowed = useMemo(() => {
    if (!entries.length) return [];
    const myIdx = user ? entries.findIndex(e => e.id === myStats?.id) : -1;
    if (myIdx < 0) return entries.slice(0, 7).map((e, i) => ({ e, rank: i + 1 }));
    const from = Math.max(0, myIdx - 3);
    const to = Math.min(entries.length, myIdx + 4);
    return entries.slice(from, to).map((e, i) => ({ e, rank: from + i + 1 }));
  }, [entries, myStats, user]);

  // Vorteile, für die ich qualifiziert bin — gemessen am Rang im JEWEILIGEN
  // Board des Vorteils (nicht am gerade ausgewählten), daher boardübergreifend sichtbar
  const myPerks = useMemo(
    () => perks.filter(p => {
      const r = myStats?.ranks[p.board];
      return r != null && r >= p.minRank && r <= p.maxRank;
    }),
    [perks, myStats],
  );

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;

  return (
    <AppShell>
      <div className="px-5 pt-5 max-w-2xl mx-auto md:max-w-none md:px-8">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-1">Ranking</p>
        <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)] mb-5" style={{ letterSpacing: '-0.02em' }}>
          Wer ist <em className="italic">vorne?</em>
        </h1>

        {/* Board-Auswahl */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {BOARDS.map(b => (
            <button key={b.id} onClick={() => { setBoard(b.id); setOpenPerk(null); }}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all ${
                board === b.id ? 'border-[var(--color-aubergine)] bg-[var(--color-aubergine)] text-white' : 'border-[var(--color-bg-soft)] bg-white text-[var(--color-lavender)] hover:border-[var(--color-aubergine)]'
              }`}>
              <i className={`fa-solid ${b.icon} text-lg`} />
              <span className="text-[11px] font-bold leading-tight text-center px-1">{b.label}</span>
            </button>
          ))}
        </div>

        {/* Kurz-Erläuterung des gewählten Rankings */}
        <div className="flex items-start gap-2.5 bg-[var(--color-bg-soft)] rounded-2xl px-4 py-3 mb-5">
          <i className={`fa-solid ${cfg.icon} text-[var(--color-amber)] mt-0.5`} />
          <p className="text-xs text-[var(--color-lavender)] leading-relaxed">{cfg.blurb}</p>
        </div>

        {/* Meine Position */}
        {myStats && user && (
          <div className="bg-[var(--color-amber)] rounded-2xl p-4 mb-5">
            <div className="flex items-center gap-3">
              <span className="font-display font-bold text-white text-2xl w-12 text-center">#{myRank ?? '—'}</span>
              <Avatar name={user.name} src={user.avatarUrl} size={40} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white truncate">Du, {user.name.split(' ')[0]}</div>
                <div className="text-white/85 text-sm">{cfg.value(myStats as unknown as RankingEntry)}</div>
              </div>
              {myPerks.length > 0 && (
                <div className="text-right">
                  <div className="text-white font-bold text-lg leading-none">{myPerks.length}</div>
                  <div className="text-white/70 text-[10px]">Vorteil{myPerks.length !== 1 ? 'e' : ''}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Leaderboard-Fenster: 3 über / 3 unter */}
        {loading ? (
          <div className="flex justify-center py-8 text-[var(--color-lavender-lt)]"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>
        ) : windowed.length === 0 ? (
          <div className="text-center py-12 text-[var(--color-lavender)] text-sm">
            <i className="fa-solid fa-ranking-star text-4xl mb-3 block opacity-30" />
            Noch keine Platzierungen — leg los und sammle die ersten Punkte!
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {windowed.map(({ e, rank }) => {
              const isMe = user && e.id === myStats?.id;
              return (
                <div key={e.id}
                  className={`flex items-center gap-3 p-3 rounded-xl ${isMe ? 'bg-[var(--color-amber)]/10 border border-[var(--color-amber)]' : 'bg-white shadow-[var(--shadow-card)]'}`}>
                  <span className={`font-bold text-sm w-7 text-center ${rank <= 3 ? 'text-[var(--color-amber)]' : 'text-[var(--color-lavender)]'}`}>
                    {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
                  </span>
                  <Avatar name={e.name} src={e.avatarUrl} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-[var(--color-aubergine)] truncate">{e.name}{isMe && ' (Du)'}</div>
                    {e.handle && <div className="text-[10px] text-[var(--color-lavender-lt)]">@{e.handle}</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm text-[var(--color-aubergine)]">{cfg.value(e)}</div>
                    {cfg.sub && <div className="text-[10px] text-[var(--color-lavender-lt)]">{cfg.sub(e)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Deine freigeschalteten Vorteile ── */}
        {myPerks.length > 0 && (
          <div className="mt-7 mb-2">
            <h2 className="font-display font-bold text-lg text-[var(--color-aubergine)] mb-1">Deine Vorteile</h2>
            <p className="text-xs text-[var(--color-lavender)] mb-4">
              Belohnungen für deine Platzierungen — immer sichtbar, egal welche Rangliste du oben ansiehst.
            </p>
            <div className="flex flex-col gap-3">
              {myPerks.map(p => {
                const open = openPerk === p.id;
                return (
                  <div key={p.id} className="rounded-2xl border-2 border-[var(--color-bg-soft)] bg-white overflow-hidden">
                    <button onClick={() => setOpenPerk(open ? null : p.id)} className="w-full flex items-center gap-3 p-4 text-left">
                      <div className="w-12 h-12 rounded-xl bg-[var(--color-bg-soft)] flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {p.logoUrl
                          ? <img src={p.logoUrl} alt={p.partner} className="w-full h-full object-contain p-1"
                              onError={e => { (e.currentTarget.style.display = 'none'); (e.currentTarget.parentElement!.textContent = p.partner[0]); }} />
                          : <span className="font-bold text-[var(--color-lavender)]">{p.partner[0]}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-[var(--color-aubergine)] leading-tight">{p.title}</div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--color-amber)]/15 text-[var(--color-amber)]">
                            {BOARD_LABEL[p.board]} · #{myStats?.ranks[p.board]}
                          </span>
                          <span className="text-[10px] font-semibold text-[var(--color-lavender)]">{p.partner}</span>
                          {p.validUntil && (
                            <span className="text-[10px] text-[var(--color-lavender-lt)]">· gültig bis {fmtDate(p.validUntil)}</span>
                          )}
                        </div>
                      </div>
                      {p.discount && (
                        <span className="font-display font-bold text-[var(--color-amber)] text-lg flex-shrink-0">{p.discount}</span>
                      )}
                      <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} text-[var(--color-lavender-lt)] text-xs flex-shrink-0`} />
                    </button>
                    {open && (
                      <div className="px-4 pb-4 -mt-1" style={{ animation: 'gtSlideUp 0.2s ease' }}>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-amber)] mb-1">Nur online einlösbar</div>
                        {p.terms && <p className="text-xs text-[var(--color-lavender)] leading-relaxed mb-3">{p.terms}</p>}
                        {p.redeemUrl && (
                          <a href={p.redeemUrl} target="_blank" rel="noopener noreferrer sponsored"
                            className="w-full flex items-center justify-center gap-2 bg-[var(--color-aubergine)] text-white font-bold py-3 rounded-xl text-sm hover:brightness-110 transition-all">
                            <i className="fa-solid fa-arrow-up-right-from-square" />
                            Jetzt einlösen bei {p.partner}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <LegalFooter />
    </AppShell>
  );
}
