import { useEffect, useState } from 'react';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type TaxPending } from '../../services/adminApi.js';

export function AdminTaxonomyMod() {
  const [data, setData] = useState<TaxPending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => adminApi.taxPending().then(setData).catch(console.error);
  useEffect(() => { load(); }, []);

  const act = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); try { await fn(); await load(); } finally { setBusy(null); } };

  if (!data) return (
    <AdminLayout title="Taxonomie-Moderation">
      <div className="flex justify-center items-center h-48 text-white/30"><i className="fa-solid fa-circle-notch fa-spin text-3xl" /></div>
    </AdminLayout>
  );

  const nothing = !data.merkmale.length && !data.vibes.length && !data.links.length;

  return (
    <AdminLayout title="Taxonomie-Moderation">
      <div className="space-y-8">
        <p className="text-xs text-white/30 -mt-2">Von Nutzer:innen neu hinzugefügte Merkmale/Vibes und ungewöhnliche Tag-Verknüpfungen prüfen: freigeben, löschen oder als Synonym zusammenführen.</p>
        {nothing && <p className="text-white/40 text-sm">Nichts zu prüfen — alles freigegeben. 🎉</p>}

        {data.merkmale.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-4">Neue Merkmale ({data.merkmale.length})</h2>
            <div className="flex flex-col gap-3">
              {data.merkmale.map(m => (
                <TermRow key={m.slug} label={m.label} by={m.byName} targets={data.allMerkmale.filter(x => x.slug !== m.slug)}
                  busy={busy === 'm-' + m.slug}
                  onApprove={() => act('m-' + m.slug, () => adminApi.taxApproveMerkmal(m.slug))}
                  onDelete={() => act('m-' + m.slug, () => adminApi.taxDeleteMerkmal(m.slug))}
                  onMerge={t => act('m-' + m.slug, () => adminApi.taxMerge(m.slug, t, 'merkmal'))} />
              ))}
            </div>
          </section>
        )}

        {data.vibes.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-4">Neue Vibes ({data.vibes.length})</h2>
            <div className="flex flex-col gap-3">
              {data.vibes.map(v => (
                <TermRow key={v.slug} label={v.label} by={v.byName} targets={data.allVibes.filter(x => x.slug !== v.slug)}
                  busy={busy === 'v-' + v.slug}
                  onApprove={() => act('v-' + v.slug, () => adminApi.taxApproveVibe(v.slug))}
                  onDelete={() => act('v-' + v.slug, () => adminApi.taxDeleteVibe(v.slug))}
                  onMerge={t => act('v-' + v.slug, () => adminApi.taxMerge(v.slug, t, 'vibe'))} />
              ))}
            </div>
          </section>
        )}

        {data.links.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-4">Ungewöhnliche Verknüpfungen ({data.links.length})</h2>
            <div className="flex flex-col gap-3">
              {data.links.map(l => {
                const key = 'l-' + l.tagSlug + '-' + l.merkmalSlug;
                return (
                  <div key={key} className="rounded-2xl p-4 flex items-center justify-between gap-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="min-w-0">
                      <p className="text-white text-sm"><strong>{l.tagLabel}</strong> <span className="text-white/40">bekommt</span> <span style={{ color: '#F99039' }}>{l.merkmalLabel}</span></p>
                      {l.byName && <p className="text-xs text-white/40 mt-0.5">von {l.byName}</p>}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => act(key, () => adminApi.taxLink(l.tagSlug, l.merkmalSlug, false))} disabled={busy === key}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(201,100,66,0.15)', color: '#C96442' }}>Löschen</button>
                      <button onClick={() => act(key, () => adminApi.taxLink(l.tagSlug, l.merkmalSlug, true))} disabled={busy === key}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(46,125,50,0.25)', color: '#4caf50' }}>Freigeben</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </AdminLayout>
  );
}

function TermRow({ label, by, targets, busy, onApprove, onDelete, onMerge }: {
  label: string; by: string | null; targets: { slug: string; label: string }[]; busy: boolean;
  onApprove: () => void; onDelete: () => void; onMerge: (target: string) => void;
}) {
  const [mergeTo, setMergeTo] = useState('');
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="min-w-0">
          <p className="font-bold text-white text-sm">{label}</p>
          {by && <p className="text-xs text-white/40">von {by}</p>}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={onDelete} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(201,100,66,0.15)', color: '#C96442' }}>Löschen</button>
          <button onClick={onApprove} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(46,125,50,0.25)', color: '#4caf50' }}>Freigeben</button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-white/40 flex-shrink-0">oder Synonym von:</span>
        <select value={mergeTo} onChange={e => setMergeTo(e.target.value)}
          className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs outline-none" style={{ background: '#2a1f3e', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}>
          <option value="">— wählen —</option>
          {targets.map(t => <option key={t.slug} value={t.slug}>{t.label}</option>)}
        </select>
        <button onClick={() => mergeTo && onMerge(mergeTo)} disabled={!mergeTo || busy}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 disabled:opacity-40" style={{ background: 'rgba(138,111,179,0.25)', color: '#b9a8c4' }}>Zusammenführen</button>
      </div>
    </div>
  );
}
