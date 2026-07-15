import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type TaxAll } from '../../services/adminApi.js';

/**
 * Verwaltet die LIVE-Taxonomie (tax_groups / tax_tags / tax_merkmale / tax_vibes) —
 * also genau das Vokabular, das Typ-Auswahl, Filter und der Fragen-Block wirklich nutzen.
 * Der alte L1/L2/L3-Code-Baum (mit Fragen) ist damit abgelöst; Fragen liegen unter „Fragen".
 *
 * Datenmodell (bestimmt, was gefahrlos ist):
 *  · Orte speichern TAGS als Slug            → Tag/Kategorie umbenennen = nur Label, keine Migration
 *  · Orte speichern MERKMALE/VIBES als Label → Umbenennen zieht die Orte serverseitig mit
 */
function InlineEdit({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  if (!editing) {
    return (
      <button onClick={() => { setDraft(value); setEditing(true); }}
        className="text-left group inline-flex items-center gap-1.5">
        <span>{value}</span>
        <i className="fa-solid fa-pen text-[9px] text-white/25 group-hover:text-[var(--color-amber)]" />
      </button>
    );
  }
  const save = async () => {
    const v = draft.trim();
    if (!v || v === value) { setEditing(false); return; }
    setBusy(true);
    try { await onSave(v); setEditing(false); } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} disabled={busy}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-sm text-white outline-none focus:border-[var(--color-amber)] w-44" />
      <button onClick={save} disabled={busy} className="text-[var(--color-amber)] px-1.5 text-xs">
        <i className={`fa-solid ${busy ? 'fa-circle-notch fa-spin' : 'fa-check'}`} />
      </button>
      <button onClick={() => setEditing(false)} className="text-white/35 px-1 text-xs"><i className="fa-solid fa-xmark" /></button>
    </span>
  );
}

function AddRow({ label, onAdd }: { label: string; onAdd: (v: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11px] font-semibold text-[var(--color-amber)] hover:underline mt-1.5">
        <i className="fa-solid fa-plus mr-1" />{label}
      </button>
    );
  }
  const add = async () => {
    if (!v.trim()) return;
    setBusy(true);
    try { await onAdd(v.trim()); setV(''); setOpen(false); } finally { setBusy(false); }
  };
  return (
    <div className="flex gap-2 mt-2">
      <input autoFocus value={v} onChange={e => setV(e.target.value)} placeholder={label}
        onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setOpen(false); }}
        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white/90 outline-none focus:border-[var(--color-amber)]" />
      <button onClick={add} disabled={busy || !v.trim()} className="bg-[var(--color-amber)] text-black font-semibold px-3 rounded-lg text-xs disabled:opacity-40">
        {busy ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Anlegen'}
      </button>
      <button onClick={() => setOpen(false)} className="text-white/40 px-2 text-xs">Abbrechen</button>
    </div>
  );
}

export function AdminTaxonomy() {
  const [data, setData] = useState<TaxAll | null>(null);
  const [error, setError] = useState('');
  const [mergeTag, setMergeTag] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState('');

  const load = () => adminApi.taxAll().then(setData).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  async function run(fn: () => Promise<unknown>) {
    setError('');
    try { await fn(); await load(); }
    catch (e) { setError((e as Error).message || 'Aktion fehlgeschlagen.'); }
  }

  const tagsByGroup = useMemo(() => {
    const m: Record<string, TaxAll['tags']> = {};
    for (const t of data?.tags ?? []) (m[t.groupSlug ?? 'ohne'] ??= []).push(t);
    return m;
  }, [data]);

  if (!data) {
    return (
      <AdminLayout title="Kategorien & Merkmale">
        <div className="text-white/40 py-12 text-center"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Kategorien & Merkmale">
      <div className="max-w-3xl space-y-8">
        <p className="text-xs text-white/50 leading-relaxed">
          Das ist die <strong className="text-white/80">Live-Taxonomie</strong> — genau das Vokabular, das Typ-Auswahl,
          Filter und der Fragen-Block nutzen. Kategorien und Tags umbenennen ist gefahrlos (Orte merken sich den Slug);
          Merkmale/Vibes umbenennen zieht die betroffenen Orte automatisch mit. Die <strong className="text-white/80">Fragen</strong> liegen jetzt in einem eigenen Bereich.
        </p>

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm bg-red-500/10 text-red-300 border border-red-500/20">
            <i className="fa-solid fa-triangle-exclamation mr-2" />{error}
          </div>
        )}

        {/* ── Hauptkategorien + Typ-Tags ───────────────────────────────── */}
        <section>
          <h2 className="text-sm font-bold text-white/80 mb-3">Hauptkategorien &amp; Typ-Tags</h2>
          <div className="space-y-4">
            {data.groups.map(g => (
              <div key={g.slug} className="rounded-xl bg-white/[0.03] border border-white/5 p-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: (g.color ?? '#8A6FB3') + '33' }}>
                    <i className={`fa-solid ${g.icon ?? 'fa-tag'} text-xs`} style={{ color: g.color ?? '#8A6FB3' }} />
                  </span>
                  <span className="text-sm font-bold text-white/90">
                    <InlineEdit value={g.label} onSave={v => run(() => adminApi.taxEditGroup(g.slug, { label: v }))} />
                  </span>
                  <span className="ml-auto text-[11px] text-white/30">{(tagsByGroup[g.slug] ?? []).length} Tags</span>
                </div>

                <div className="space-y-1 pl-1">
                  {(tagsByGroup[g.slug] ?? []).map(t => (
                    <div key={t.slug}>
                      <div className="flex items-center gap-2 text-sm py-0.5">
                        <span className="text-white/80">
                          <InlineEdit value={t.label} onSave={v => run(() => adminApi.taxEditTag(t.slug, { label: v }))} />
                        </span>
                        <span className="text-[11px] text-white/30">{t.usage} {t.usage === 1 ? 'Ort' : 'Orte'}</span>
                        <button title="Unterkategorie (Gruppierung im Auswahl-Picker)"
                          onClick={() => { const v = prompt('Unterkategorie (leer = keine)', t.sub ?? ''); if (v !== null) run(() => adminApi.taxEditTag(t.slug, { sub: v })); }}
                          className="text-[10px] text-white/45 hover:text-white/80 border border-white/10 rounded px-1.5 py-0.5">
                          {t.sub || '+ Unterkat.'}
                        </button>
                        <div className="ml-auto flex items-center gap-1">
                          <select value={g.slug} title="Hauptkategorie wechseln"
                            onChange={e => run(() => adminApi.taxEditTag(t.slug, { group: e.target.value }))}
                            className="bg-white/5 border border-white/10 rounded-lg px-1.5 py-0.5 text-[11px] text-white/60 outline-none">
                            {data.groups.map(x => <option key={x.slug} value={x.slug}>{x.label}</option>)}
                          </select>
                          <button onClick={() => { setMergeTag(mergeTag === t.slug ? null : t.slug); setMergeTarget(''); }}
                            title="Mit anderem Tag zusammenlegen" className="text-[11px] text-white/40 hover:text-white/80 px-1.5">
                            <i className="fa-solid fa-code-merge" />
                          </button>
                          <button disabled={t.usage > 0}
                            onClick={() => { if (confirm(`Tag „${t.label}" löschen?`)) run(() => adminApi.taxDeleteTag(t.slug)); }}
                            title={t.usage > 0 ? 'Wird noch von Orten genutzt — erst zusammenlegen' : 'Löschen'}
                            className="text-[11px] text-white/40 hover:text-red-400 px-1.5 disabled:opacity-25 disabled:hover:text-white/40">
                            <i className="fa-solid fa-trash" />
                          </button>
                        </div>
                      </div>

                      {mergeTag === t.slug && (
                        <div className="my-1.5 p-2.5 rounded-lg bg-black/30 text-xs space-y-2">
                          <p className="text-white/60">
                            „{t.label}" zusammenlegen — {t.usage} {t.usage === 1 ? 'Ort übernimmt' : 'Orte übernehmen'} das Ziel, „{t.label}" verschwindet:
                          </p>
                          <div className="flex gap-2">
                            <select value={mergeTarget} onChange={e => setMergeTarget(e.target.value)}
                              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white/90 outline-none">
                              <option value="">Ziel-Tag wählen…</option>
                              {data.tags.filter(x => x.slug !== t.slug).map(x => (
                                <option key={x.slug} value={x.slug}>{x.label}</option>
                              ))}
                            </select>
                            <button disabled={!mergeTarget}
                              onClick={() => run(async () => { await adminApi.taxMergeTag(t.slug, mergeTarget); setMergeTag(null); })}
                              className="bg-[var(--color-amber)] text-black font-semibold px-3 rounded-lg disabled:opacity-40">
                              Zusammenlegen
                            </button>
                            <button onClick={() => setMergeTag(null)} className="text-white/40 px-2">Abbrechen</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <AddRow label="Typ-Tag hinzufügen" onAdd={v => run(() => adminApi.taxAddTag(v, g.slug))} />
                </div>
              </div>
            ))}
          </div>
          <AddRow label="Hauptkategorie hinzufügen" onAdd={v => run(() => adminApi.taxAddGroup(v))} />
        </section>

        {/* ── Merkmale / Vibes ─────────────────────────────────────────── */}
        {([['merkmal', 'Merkmale', data.merkmale], ['vibe', 'Vibes', data.vibes]] as const).map(([kind, title, list]) => (
          <section key={kind}>
            <h2 className="text-sm font-bold text-white/80 mb-1">{title} <span className="text-white/30 font-normal">({list.length})</span></h2>
            <p className="text-[11px] text-white/35 mb-3">
              {kind === 'merkmal'
                ? 'Was einen Ort auszeichnet (z. B. Altstadt, Szeneviertel, Platz). Umbenennen zieht die genutzten Orte mit; die Zahl zeigt, wie oft es verwendet wird.'
                : 'Stimmung — nur Adjektive (z. B. nostalgisch, lebhaft).'}
            </p>
            <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3.5">
              {list.length === 0 ? <p className="text-xs text-white/25">— noch keine —</p> : (
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {list.map(t => (
                    <div key={t.slug} className="flex items-center gap-1.5 text-sm">
                      <span className="text-white/80">
                        <InlineEdit value={t.label} onSave={v => run(() => adminApi.taxRenameTerm(kind, t.slug, v))} />
                      </span>
                      <span className="text-[11px] text-white/25">{t.usage}</span>
                      {!t.isApproved && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[var(--color-amber)]/20 text-[var(--color-amber)]">neu</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </AdminLayout>
  );
}
