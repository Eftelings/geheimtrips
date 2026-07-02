import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type AdminClaim, type AdminBusinessAccount, type AdminPlace } from '../../services/adminApi.js';

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Ausstehend', color: '#C9A227', bg: '#FFF8E1' },
  approved: { label: 'Genehmigt',  color: '#2e7d32', bg: '#e8f5e9' },
  rejected: { label: 'Abgelehnt',  color: '#C96442', bg: '#FDECEA' },
};

const INPUT = 'w-full rounded-xl px-4 py-2.5 text-sm outline-none';
const inputStyle = { background: '#2a1f3e', color: 'white', border: '1px solid rgba(255,255,255,0.1)' } as const;

export function AdminClaims() {
  const [claims, setClaims]   = useState<AdminClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<number | null>(null);
  const [rejectNote, setRejectNote]   = useState('');
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);

  // ── Business-Accounts ──────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<AdminBusinessAccount[]>([]);
  const [places, setPlaces]     = useState<AdminPlace[]>([]);
  const [form, setForm] = useState({ companyName: '', companyEmail: '', companyWebsite: '', description: '' });
  const [selected, setSelected] = useState<{ id: string; name: string }[]>([]);
  const [placeSearch, setPlaceSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ tempPassword: string; email: string; assigned: string[] } | null>(null);

  const loadClaims   = () => adminApi.claims().then(setClaims).catch(console.error);
  const loadAccounts = () => adminApi.businessAccounts().then(setAccounts).catch(console.error);

  useEffect(() => {
    Promise.all([loadClaims(), loadAccounts(), adminApi.places().then(setPlaces).catch(() => {})])
      .finally(() => setLoading(false));
  }, []);

  const approve = async (id: number) => {
    setWorking(id);
    try { await adminApi.approveClaim(id); await Promise.all([loadClaims(), loadAccounts()]); } finally { setWorking(null); }
  };
  const reject = async (id: number) => {
    setWorking(id);
    try { await adminApi.rejectClaim(id, { adminNote: rejectNote }); setRejectTarget(null); setRejectNote(''); await loadClaims(); }
    finally { setWorking(null); }
  };

  const placeResults = useMemo(() => {
    const q = placeSearch.trim().toLowerCase();
    if (!q) return [];
    const chosen = new Set(selected.map(s => s.id));
    return places.filter(p => !chosen.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [placeSearch, places, selected]);

  const createBiz = async () => {
    setCreating(true); setCreateErr(null); setResult(null);
    try {
      const res = await adminApi.createBusinessAccount({
        companyName: form.companyName.trim(),
        companyEmail: form.companyEmail.trim(),
        companyWebsite: form.companyWebsite.trim() || undefined,
        description: form.description.trim() || undefined,
        placeIds: selected.map(s => s.id),
      });
      setResult({ tempPassword: res.tempPassword, email: res.email, assigned: res.assigned });
      setForm({ companyName: '', companyEmail: '', companyWebsite: '', description: '' });
      setSelected([]); setPlaceSearch('');
      await loadAccounts();
    } catch (e) {
      setCreateErr((e as Error).message);
    } finally { setCreating(false); }
  };

  const pending  = claims.filter(c => c.status === 'pending');
  const resolved = claims.filter(c => c.status !== 'pending');
  const canCreate = form.companyName.trim() && /.+@.+\..+/.test(form.companyEmail.trim());

  return (
    <AdminLayout title="Unternehmen & Anfragen">
      {loading ? (
        <div className="flex items-center justify-center h-48 text-white/30">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl" />
        </div>
      ) : (
        <div className="space-y-10">

          {/* ── Unternehmen anlegen ─────────────────────────────────────────── */}
          <section>
            <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-1">Unternehmen anlegen</h2>
            <p className="text-xs text-white/30 mb-4">Erstellt einen Business-Account (Login + Profil). Zugewiesene Orte werden offiziell verwaltet — Änderungswünsche &amp; Fragen landen im Postfach des Unternehmens.</p>

            <div className="rounded-2xl p-5 space-y-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-white/50 block mb-1">Firmenname *</label>
                  <input className={INPUT} style={inputStyle} value={form.companyName}
                    onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} placeholder="z.B. Bergbahn Oberstdorf GmbH" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-white/50 block mb-1">Login-E-Mail *</label>
                  <input className={INPUT} style={inputStyle} type="email" value={form.companyEmail}
                    onChange={e => setForm(f => ({ ...f, companyEmail: e.target.value }))} placeholder="kontakt@firma.de" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-white/50 block mb-1">Website</label>
                  <input className={INPUT} style={inputStyle} value={form.companyWebsite}
                    onChange={e => setForm(f => ({ ...f, companyWebsite: e.target.value }))} placeholder="https://…" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-white/50 block mb-1">Kurzbeschreibung</label>
                  <input className={INPUT} style={inputStyle} value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="optional" />
                </div>
              </div>

              {/* Orte zuweisen */}
              <div>
                <label className="text-[11px] font-semibold text-white/50 block mb-1">Orte zuweisen (optional)</label>
                {selected.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selected.map(s => (
                      <span key={s.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                        style={{ background: 'rgba(249,144,57,0.18)', color: '#F99039' }}>
                        {s.name}
                        <button onClick={() => setSelected(prev => prev.filter(x => x.id !== s.id))} className="hover:text-white">
                          <i className="fa-solid fa-xmark text-[10px]" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <input className={INPUT} style={inputStyle} value={placeSearch}
                    onChange={e => setPlaceSearch(e.target.value)} placeholder="Ort suchen…" />
                  {placeResults.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 mt-1 rounded-xl overflow-hidden max-h-56 overflow-y-auto"
                      style={{ background: '#221836', border: '1px solid rgba(255,255,255,0.1)' }}>
                      {placeResults.map(p => (
                        <button key={p.id}
                          onClick={() => { setSelected(prev => [...prev, { id: p.id, name: p.name }]); setPlaceSearch(''); }}
                          className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors">
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {createErr && (
                <p className="text-xs font-semibold" style={{ color: '#ff8a80' }}>
                  <i className="fa-solid fa-triangle-exclamation mr-1" />{createErr}
                </p>
              )}

              <button onClick={createBiz} disabled={!canCreate || creating}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-40"
                style={{ background: '#F99039' }}>
                {creating ? <i className="fa-solid fa-circle-notch fa-spin" /> : <><i className="fa-solid fa-building-circle-check mr-1.5" />Unternehmen anlegen</>}
              </button>
            </div>

            {/* Erfolg: temporäres Passwort einmalig anzeigen */}
            {result && (
              <div className="mt-3 rounded-2xl p-4" style={{ background: 'rgba(46,125,50,0.15)', border: '1px solid rgba(76,175,80,0.3)' }}>
                <p className="text-sm font-bold text-white mb-1"><i className="fa-solid fa-circle-check mr-1.5" style={{ color: '#4caf50' }} />Unternehmen angelegt</p>
                <p className="text-xs text-white/60 mb-2">
                  Login: <span className="font-mono text-white/90">{result.email}</span>
                  {result.assigned.length > 0 && <> · {result.assigned.length} Ort(e) zugewiesen: {result.assigned.join(', ')}</>}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/50">Temporäres Passwort:</span>
                  <code className="px-2 py-1 rounded-lg text-sm font-mono text-white" style={{ background: 'rgba(0,0,0,0.35)' }}>{result.tempPassword}</code>
                  <button onClick={() => navigator.clipboard?.writeText(result.tempPassword)}
                    className="text-xs text-[var(--color-amber)] hover:underline"><i className="fa-solid fa-copy mr-1" />Kopieren</button>
                </div>
                <p className="text-[11px] text-white/40 mt-2">Einmalig sichtbar — teile es dem Unternehmen mit. Es kann das Passwort danach selbst ändern.</p>
              </div>
            )}
          </section>

          {/* ── Bestehende Unternehmen ──────────────────────────────────────── */}
          <section>
            <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-4">Unternehmen ({accounts.length})</h2>
            {accounts.length === 0 ? (
              <p className="text-white/30 text-sm">Noch keine Business-Accounts.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {accounts.map(a => (
                  <div key={a.id} className="rounded-2xl p-4 flex items-start justify-between gap-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-bold text-white text-sm">{a.companyName}</p>
                        {a.isVerified && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#e8f5e9', color: '#2e7d32' }}>
                            <i className="fa-solid fa-circle-check mr-1 text-[8px]" />Verifiziert
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/50 truncate">{a.companyEmail}{a.user && <span className="text-white/30"> · @{a.user.handle}</span>}</p>
                      {a.places.length > 0 && (
                        <p className="text-xs text-white/40 mt-1">
                          <i className="fa-solid fa-map-pin mr-1 text-[10px]" />{a.places.map(p => p.name).join(', ')}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-white/30 flex-shrink-0">{new Date(a.createdAt).toLocaleDateString('de-DE')}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Betreiber-Anfragen (Claims) ─────────────────────────────────── */}
          <section>
            <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-4">
              Betreiber-Anfragen · Ausstehend ({pending.length})
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

          {resolved.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-4">
                Bearbeitete Anfragen ({resolved.length})
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
