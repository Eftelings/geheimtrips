import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from './AdminLayout.js';
import { adminApi } from '../../services/adminApi.js';
import type { AdminArticle } from '../../services/adminApi.js';

/**
 * Prüfung der zusätzlichen Beiträge zu Orten. Beiträge sind erst nach Freigabe
 * öffentlich; wer seinen Beitrag später ändert, landet wieder hier.
 */
const TABS: { id: 'pending' | 'approved' | 'rejected'; label: string }[] = [
  { id: 'pending',  label: 'In Prüfung' },
  { id: 'approved', label: 'Freigegeben' },
  { id: 'rejected', label: 'Abgelehnt' },
];

export function AdminArticles() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [rows, setRows]     = useState<AdminArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]     = useState<number | null>(null);
  const [note, setNote]     = useState<Record<number, string>>({});

  function load() {
    setLoading(true);
    adminApi.articles(status).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }
  useEffect(load, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function review(id: number, next: 'approved' | 'rejected') {
    setBusy(id);
    try {
      await adminApi.reviewArticle(id, next, note[id]);
      setRows(rs => rs.filter(r => r.id !== id));
    } catch { /* Liste bleibt stehen */ }
    setBusy(null);
  }

  return (
    <AdminLayout title={`Beiträge${status === 'pending' && rows.length ? ` (${rows.length})` : ''}`}>
      <div className="flex gap-2 mb-5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setStatus(t.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
              status === t.id ? 'bg-[var(--color-amber)] text-black' : 'bg-white/5 text-white/50 hover:bg-white/8'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-white/30">
          <i className="fa-solid fa-circle-notch fa-spin text-2xl" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-white/40 text-sm">Hier liegt gerade nichts.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map(a => {
            let highlights: { title: string; description: string; photos: string[] }[] = [];
            try { highlights = JSON.parse(a.highlightsJson) ?? []; } catch { /* egal */ }
            return (
              <div key={a.id} className="bg-white/5 border border-white/8 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <button onClick={() => navigate(`/ort/${a.placeId}`)}
                      className="font-bold text-white hover:text-[var(--color-amber)] transition-colors text-left">
                      {a.placeName}
                    </button>
                    <p className="text-xs text-white/40">
                      {a.placeRegion} · von{' '}
                      <button onClick={() => navigate(`/u/${a.authorId}`)} className="hover:text-white/70">
                        {a.authorName} (@{a.authorHandle})
                      </button>
                      {a.createdAt && ` · ${new Date(a.createdAt).toLocaleDateString('de-DE')}`}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-white/80 mb-2"><span className="text-white/40">Das Besondere: </span>{a.short}</p>
                <div className="text-sm text-white/70 leading-relaxed max-h-56 overflow-y-auto rounded-xl bg-black/20 p-3 mb-2
                  [&_p]:mb-2 [&_img]:rounded-lg [&_img]:my-2"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: a.long }} />
                {a.triviaText && (
                  <p className="text-sm text-white/70 mb-2"><span className="text-white/40">Wusstest du schon: </span>{a.triviaText}</p>
                )}
                {highlights.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-white/40 mb-1.5">Highlights</p>
                    <div className="flex flex-col gap-2">
                      {highlights.map((h, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <div className="flex gap-1 flex-shrink-0">
                            {h.photos.slice(0, 3).map((u, j) => (
                              <img key={j} src={u} alt="" className="w-12 h-12 rounded-lg object-cover" />
                            ))}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-white/80 font-semibold">{h.title}</p>
                            {h.description && <p className="text-xs text-white/50">{h.description}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {status !== 'approved' && (
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/8">
                    <input value={note[a.id] ?? ''} onChange={e => setNote(n => ({ ...n, [a.id]: e.target.value }))}
                      placeholder="Begründung (optional, geht an die Person)"
                      className="flex-1 min-w-[180px] bg-black/25 border border-white/10 rounded-xl px-3 h-9 text-sm text-white/80 outline-none focus:border-[var(--color-amber)]" />
                    <button onClick={() => review(a.id, 'approved')} disabled={busy === a.id}
                      className="px-3.5 h-9 rounded-xl text-xs font-bold bg-[var(--color-success)] text-white disabled:opacity-50">
                      <i className="fa-solid fa-check mr-1.5" />Freigeben
                    </button>
                    <button onClick={() => review(a.id, 'rejected')} disabled={busy === a.id}
                      className="px-3.5 h-9 rounded-xl text-xs font-bold bg-white/8 text-white/70 disabled:opacity-50">
                      <i className="fa-solid fa-xmark mr-1.5" />Ablehnen
                    </button>
                  </div>
                )}
                {status === 'approved' && (
                  <div className="pt-3 border-t border-white/8">
                    <button onClick={() => review(a.id, 'rejected')} disabled={busy === a.id}
                      className="px-3.5 h-9 rounded-xl text-xs font-bold bg-white/8 text-white/70 disabled:opacity-50">
                      Zurückziehen
                    </button>
                  </div>
                )}
                {a.reviewNote && <p className="text-xs text-white/40 mt-2">Notiz: {a.reviewNote}</p>}
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
