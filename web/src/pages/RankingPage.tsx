import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { LegalFooter } from '../components/layout/LegalFooter.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { rankingsApi } from '../services/api.js';
import type { MyRankStats } from '../services/api.js';
import type { RankingEntry, RankBoardId } from '../types/index.js';
import { Avatar } from '../components/ui/Avatar.js';
// Stufen, Boards, Kachel und Slider teilt sich diese Seite mit dem persönlichen Profil
import { BOARDS, StatusTile, StatusSlider, tierByKey } from '../components/ui/StatusTiers.js';

export function RankingPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [board, setBoard]           = useState<RankBoardId>('gesamt');
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [entries, setEntries]       = useState<RankingEntry[]>([]);
  const [myStats, setMyStats]       = useState<MyRankStats | null>(null);
  const [loading, setLoading]       = useState(true);

  const listRef   = useRef<HTMLDivElement>(null);
  const meRowRef  = useRef<HTMLDivElement>(null);

  useEffect(() => { rankingsApi.me().then(setMyStats).catch(() => setMyStats(null)); }, []);

  useEffect(() => {
    setLoading(true);
    rankingsApi.leaderboard(board, friendsOnly).then(setEntries).finally(() => setLoading(false));
  }, [board, friendsOnly]);

  const myTier = tierByKey(myStats?.tierKey ?? 'rookie');

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
      <div className="px-6 pt-5 max-w-2xl mx-auto md:max-w-3xl md:px-8 pb-10">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-1">Prämien</p>
        <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)] mb-5" style={{ letterSpacing: '-0.02em' }}>
          Dein <em className="italic text-[var(--color-lavender-lt)]">Status</em>
        </h1>

        {/* ── Status-Kachel ── */}
        {myStats && user && <div className="mb-4"><StatusTile stats={myStats} /></div>}

        {/* ── Status-Slider (alle Stufen + Boni) ── */}
        <div className="mb-6"><StatusSlider tierKey={myTier.key} /></div>

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
                  onClick={() => navigate(`/u/${e.id}`)}
                  className={`flex items-center gap-3 p-3 rounded-xl flex-shrink-0 cursor-pointer active:scale-[0.99] transition-transform ${
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
