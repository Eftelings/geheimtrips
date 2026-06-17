import { useEffect, useState } from 'react';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type AdminReport } from '../../services/adminApi.js';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open:       { label: 'Offen',       color: 'text-[var(--color-amber)] bg-[var(--color-amber)]/20' },
  in_review:  { label: 'In Prüfung',  color: 'text-blue-400 bg-blue-500/20' },
  resolved:   { label: 'Erledigt',    color: 'text-[var(--color-success)] bg-[var(--color-success)]/20' },
  dismissed:  { label: 'Abgewiesen', color: 'text-white/40 bg-white/10' },
};

export function AdminTakedown() {
  const [reports, setReports]    = useState<AdminReport[]>([]);
  const [loading, setLoading]    = useState(true);
  const [selected, setSelected]  = useState<AdminReport | null>(null);
  const [note, setNote]          = useState('');
  const [filter, setFilter]      = useState<string>('all');

  async function load() {
    const r = await adminApi.reports();
    setReports(r); setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function updateStatus(id: number, status: AdminReport['status']) {
    await adminApi.updateReport(id, { status, adminNote: note || undefined });
    setSelected(null); setNote('');
    load();
  }

  const filtered = filter === 'all' ? reports : reports.filter(r => r.status === filter);

  return (
    <AdminLayout title={`Notice & Takedown (${reports.filter(r => r.status === 'open').length} offen)`}>
      {/* Filter */}
      <div className="flex gap-2 mb-5 overflow-x-auto">
        {['all','open','in_review','resolved','dismissed'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === f ? 'bg-[var(--color-amber)] text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'
            }`}>
            {f === 'all' ? 'Alle' : STATUS_LABELS[f]?.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-white/30">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <i className="fa-solid fa-flag text-5xl text-white/10 mb-4" />
          <p className="text-white/40">Keine Meldungen</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(r => {
            const s = STATUS_LABELS[r.status] ?? STATUS_LABELS.open;
            return (
              <div key={r.id} className="bg-white/5 border border-white/8 rounded-2xl p-4 hover:bg-white/7 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                      <span className="text-[10px] text-white/30">#{r.id}</span>
                      <span className="text-[10px] text-white/30">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString('de') : '—'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white/90 mb-0.5">
                      Von {r.reporterName} &lt;{r.reporterEmail}&gt;
                    </p>
                    {r.placeId && (
                      <p className="text-xs text-white/40">Ort: <span className="font-mono text-white/60">{r.placeId}</span></p>
                    )}
                    {r.infringingUrl && (
                      <p className="text-xs text-white/40 truncate">URL: <a href={r.infringingUrl} target="_blank" rel="noreferrer" className="text-[var(--color-amber)] hover:underline">{r.infringingUrl}</a></p>
                    )}
                  </div>
                  <button onClick={() => { setSelected(r); setNote(r.adminNote ?? ''); }}
                    className="flex-shrink-0 bg-white/10 hover:bg-white/15 text-white/60 px-3 py-1.5 rounded-xl text-xs transition-colors">
                    Bearbeiten
                  </button>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-xs text-white/60 leading-relaxed">
                  {r.description}
                </div>
                {r.adminNote && (
                  <div className="mt-2 bg-blue-500/10 rounded-xl p-3 text-xs text-blue-300">
                    <i className="fa-solid fa-note-sticky mr-1" /> {r.adminNote}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Detail/Action Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#1a1228] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <h2 className="font-bold text-white">Meldung #{selected.id}</h2>
              <button onClick={() => setSelected(null)} className="text-white/40 hover:text-white">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-white/5 rounded-xl p-3 text-xs text-white/60">{selected.description}</div>
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">Admin-Notiz</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-amber)] resize-none"
                  placeholder="Interne Notiz (optional)…" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => updateStatus(selected.id, 'in_review')}
                  className="py-2 bg-blue-500/20 text-blue-400 font-semibold rounded-xl text-xs hover:bg-blue-500/30">
                  In Prüfung setzen
                </button>
                <button onClick={() => updateStatus(selected.id, 'dismissed')}
                  className="py-2 bg-white/5 text-white/50 font-semibold rounded-xl text-xs hover:bg-white/10">
                  Abweisen
                </button>
                <button onClick={() => updateStatus(selected.id, 'resolved')}
                  className="col-span-2 py-2.5 bg-[var(--color-success)]/20 text-[var(--color-success)] font-bold rounded-xl text-sm hover:bg-[var(--color-success)]/30">
                  <i className="fa-solid fa-check mr-2" />Als erledigt markieren (Inhalt bereits gelöscht)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
