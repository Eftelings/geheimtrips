import { useEffect, useState } from 'react';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type AdminClaim } from '../../services/adminApi.js';

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Ausstehend', color: '#C9A227', bg: '#FFF8E1' },
  approved: { label: 'Genehmigt',  color: '#2e7d32', bg: '#e8f5e9' },
  rejected: { label: 'Abgelehnt',  color: '#C96442', bg: '#FDECEA' },
};

export function AdminClaims() {
  const [claims, setClaims]   = useState<AdminClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<number | null>(null);
  const [rejectNote, setRejectNote]   = useState('');
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);

  const load = () => adminApi.claims().then(setClaims).catch(console.error).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const approve = async (id: number) => {
    setWorking(id);
    try { await adminApi.approveClaim(id); await load(); } finally { setWorking(null); }
  };

  const reject = async (id: number) => {
    setWorking(id);
    try { await adminApi.rejectClaim(id, { adminNote: rejectNote }); setRejectTarget(null); setRejectNote(''); await load(); }
    finally { setWorking(null); }
  };

  const pending  = claims.filter(c => c.status === 'pending');
  const resolved = claims.filter(c => c.status !== 'pending');

  return (
    <AdminLayout title="Betreiber-Anfragen">
      {loading ? (
        <div className="flex items-center justify-center h-48 text-white/30">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl" />
        </div>
      ) : (
        <div className="space-y-8">

          {/* Pending */}
          <section>
            <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-4">
              Ausstehend ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <p className="text-white/30 text-sm">Keine offenen Anfragen.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {pending.map(c => (
                  <ClaimCard key={c.id} claim={c}
                    onApprove={() => approve(c.id)}
                    onRejectClick={() => setRejectTarget(c.id)}
                    working={working === c.id} />
                ))}
              </div>
            )}
          </section>

          {/* Resolved */}
          {resolved.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-4">
                Bearbeitet ({resolved.length})
              </h2>
              <div className="flex flex-col gap-3">
                {resolved.map(c => (
                  <ClaimCard key={c.id} claim={c} working={false} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm rounded-3xl p-6" style={{ background: '#1e1530' }}>
            <h3 className="text-white font-bold text-lg mb-3">Anfrage ablehnen</h3>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)}
              rows={3} placeholder="Grund der Ablehnung (optional)"
              className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none mb-4"
              style={{ background: '#2a1f3e', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }} />
            <div className="flex gap-2">
              <button onClick={() => { setRejectTarget(null); setRejectNote(''); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/50 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                Abbrechen
              </button>
              <button onClick={() => reject(rejectTarget!)} disabled={working !== null}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-40"
                style={{ background: '#C96442' }}>
                {working ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Ablehnen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

// ─── Claim card ───────────────────────────────────────────────────────────────

function ClaimCard({
  claim, working, onApprove, onRejectClick,
}: {
  claim: AdminClaim;
  working: boolean;
  onApprove?: () => void;
  onRejectClick?: () => void;
}) {
  const s = STATUS_LABEL[claim.status] ?? STATUS_LABEL.pending;

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-bold text-white text-sm">{claim.businessName}</p>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: s.bg, color: s.color }}>
              {s.label}
            </span>
          </div>
          <p className="text-xs text-white/50 truncate">{claim.contactEmail}</p>
          {claim.contactWebsite && (
            <a href={claim.contactWebsite} target="_blank" rel="noopener noreferrer"
              className="text-xs text-[var(--color-amber)] hover:underline truncate block">
              {claim.contactWebsite}
            </a>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-white/40">{new Date(claim.createdAt).toLocaleDateString('de-DE')}</p>
          {claim.place && (
            <p className="text-xs font-semibold text-[var(--color-amber)] mt-0.5">{claim.place.name}</p>
          )}
        </div>
      </div>

      {claim.user && (
        <div className="flex items-center gap-2 text-xs text-white/50">
          <i className="fa-solid fa-user text-[10px]" />
          {claim.user.name} ({claim.user.email})
        </div>
      )}

      {claim.message && (
        <div className="rounded-xl px-3 py-2 text-xs text-white/70 italic"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          „{claim.message}"
        </div>
      )}

      {claim.adminNote && (
        <div className="rounded-xl px-3 py-2 text-xs text-white/50"
          style={{ background: 'rgba(255,255,255,0.04)' }}>
          Admin-Notiz: {claim.adminNote}
        </div>
      )}

      {claim.status === 'pending' && onApprove && onRejectClick && (
        <div className="flex gap-2 pt-1">
          <button onClick={onRejectClick}
            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all hover:brightness-110"
            style={{ background: 'rgba(201,100,66,0.15)', color: '#C96442' }}>
            <i className="fa-solid fa-xmark mr-1" />Ablehnen
          </button>
          <button onClick={onApprove} disabled={working}
            className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-40"
            style={{ background: 'rgba(46,125,50,0.25)', color: '#4caf50' }}>
            {working
              ? <i className="fa-solid fa-circle-notch fa-spin" />
              : <><i className="fa-solid fa-check mr-1" />Genehmigen</>
            }
          </button>
        </div>
      )}
    </div>
  );
}
