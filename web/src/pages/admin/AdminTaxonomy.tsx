import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from './AdminLayout.js';
import { UNIVERSAL_QUESTIONS } from '../../data/taxonomy.js';
import type { SubmitQuestion, TaxonomyL3 } from '../../data/taxonomy.js';
import { buildEffectiveTaxonomy, type TaxonomyNode } from '../../data/effectiveTaxonomy.js';
import { adminApi, type MerkmaleData } from '../../services/adminApi.js';

const QTYPE: Record<string, string> = {
  textarea: 'Freitext', text: 'Kurztext', select: 'Auswahl', stars: 'Sterne',
  yesno: 'Ja/Nein', multicheck: 'Mehrfach', slider: 'Schieberegler',
  weekhours: 'Öffnungszeiten', pricefields: 'Preise',
};

function QuestionRow({ q }: { q: SubmitQuestion }) {
  return (
    <li className="flex items-start gap-2 text-xs py-1">
      <span className="mt-0.5 flex-shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-white/50">
        {QTYPE[q.type] ?? q.type}
      </span>
      <span className="text-white/75">{q.label}{q.required && <span className="text-[var(--color-amber)] ml-1">*</span>}</span>
    </li>
  );
}

// ── kleines Eingabeformular zum Anlegen einer Haupt-/Unterkategorie ──────────────
function AddForm({ level, parentSlug, onDone }: { level: 2 | 3; parentSlug: string; onDone: () => void }) {
  const [open, setOpen]   = useState(false);
  const [label, setLabel] = useState('');
  const [icon, setIcon]   = useState('');
  const [busy, setBusy]   = useState(false);
  async function add() {
    if (!label.trim()) return;
    setBusy(true);
    try { await adminApi.addTaxNode(level, label.trim(), parentSlug, level === 2 ? (icon.trim() || 'fa-folder') : undefined); setLabel(''); setIcon(''); setOpen(false); onDone(); }
    finally { setBusy(false); }
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-[var(--color-amber)] hover:underline mt-1">
        <i className="fa-solid fa-plus mr-1" />{level === 2 ? 'Hauptkategorie' : 'Unterkategorie'} hinzufügen
      </button>
    );
  }
  return (
    <form onSubmit={e => { e.preventDefault(); add(); }} className="flex flex-wrap gap-1.5 mt-1.5 items-center">
      <input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="Name…" maxLength={80}
        className="flex-1 min-w-[120px] bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/90 placeholder-white/25 outline-none focus:border-[var(--color-amber)]/50" />
      {level === 2 && (
        <input value={icon} onChange={e => setIcon(e.target.value)} placeholder="fa-icon (optional)" maxLength={40}
          className="w-32 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/90 placeholder-white/25 outline-none" />
      )}
      <button type="submit" disabled={busy || !label.trim()}
        className="bg-[var(--color-amber)] text-black font-semibold px-3 py-1.5 rounded-lg text-xs disabled:opacity-50">Anlegen</button>
      <button type="button" onClick={() => setOpen(false)} className="text-white/40 px-2 text-xs">Abbrechen</button>
    </form>
  );
}

// ── Inline-Bearbeiten (Label, Icon für L2, Eltern für L3) + Ausblenden ───────────
function NodeEdit({ level, slug, label, icon, allL2, onDone }: {
  level: 2 | 3; slug: string; label: string; icon?: string;
  allL2: { slug: string; label: string }[]; onDone: () => void;
}) {
  const [mode, setMode] = useState<'none' | 'edit' | 'reparent'>('none');
  const [l, setL]       = useState(label);
  const [ic, setIc]     = useState(icon ?? '');
  const [parent, setP]  = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); setMode('none'); onDone(); } finally { setBusy(false); } };

  if (mode === 'none') {
    return (
      <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
        <button onClick={() => { setL(label); setIc(icon ?? ''); setMode('edit'); }} title="Umbenennen"
          className="text-white/35 hover:text-white/80 text-[11px] px-1"><i className="fa-solid fa-pen" /></button>
        {level === 3 && allL2.length > 1 && (
          <button onClick={() => { setP(allL2[0].slug); setMode('reparent'); }} title="Hauptkategorie ändern"
            className="text-white/35 hover:text-white/80 text-[11px] px-1"><i className="fa-solid fa-arrow-right-arrow-left" /></button>
        )}
        <button onClick={() => run(() => adminApi.hideTaxNode(level, slug))} disabled={busy} title="Ausblenden"
          className="text-white/35 hover:text-red-400 text-[11px] px-1"><i className="fa-solid fa-eye-slash" /></button>
      </span>
    );
  }
  if (mode === 'reparent') {
    return (
      <span className="ml-auto flex items-center gap-1.5">
        <select value={parent} onChange={e => setP(e.target.value)}
          className="bg-white/10 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white/90 outline-none">
          {allL2.map(x => <option key={x.slug} value={x.slug}>{x.label}</option>)}
        </select>
        <button onClick={() => run(() => adminApi.editTaxNode(3, slug, { parentSlug: parent }))} disabled={busy}
          className="bg-[var(--color-amber)] text-black font-semibold px-2.5 py-1 rounded-lg text-[11px]">Verschieben</button>
        <button onClick={() => setMode('none')} className="text-white/40 text-[11px] px-1">×</button>
      </span>
    );
  }
  return (
    <span className="ml-auto flex items-center gap-1.5">
      <input value={l} onChange={e => setL(e.target.value)} maxLength={80}
        className="w-32 bg-white/10 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white/90 outline-none" />
      {level === 2 && (
        <input value={ic} onChange={e => setIc(e.target.value)} placeholder="fa-icon" maxLength={40}
          className="w-24 bg-white/10 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white/90 outline-none" />
      )}
      <button onClick={() => run(() => adminApi.editTaxNode(level, slug, { label: l.trim(), ...(level === 2 ? { icon: ic.trim() } : {}) }))}
        disabled={busy || !l.trim()} className="bg-[var(--color-amber)] text-black font-semibold px-2.5 py-1 rounded-lg text-[11px]">Speichern</button>
      <button onClick={() => setMode('none')} className="text-white/40 text-[11px] px-1">×</button>
    </span>
  );
}

interface EffMerkmal { key: string; label: string; source: 'code' | 'custom'; usage: number }
function MerkmaleManager({ l3, data, onReload }: { l3: TaxonomyL3; data: MerkmaleData; onReload: () => void }) {
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState('');
  const [edit, setEdit]         = useState<{ key: string; action: 'merge' | 'delete' } | null>(null);
  const [target, setTarget]     = useState('');
  const [delMode, setDelMode]   = useState<'remove' | 'reassign'>('remove');

  const usageMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of data.usage) m.set(`${u.l3Slug} ${u.key}`, u.count);
    return m;
  }, [data.usage]);

  const { eff, hiddenCode } = useMemo(() => {
    const forL3 = data.db.filter(r => r.l3Slug === l3.slug);
    const hidden = new Set(forL3.filter(r => r.hidden).map(r => r.key));
    const codeKeys = new Set(l3.features.map(f => f.key));
    const codeList: EffMerkmal[] = l3.features.filter(f => !hidden.has(f.key))
      .map(f => ({ key: f.key, label: f.label, source: 'code', usage: usageMap.get(`${l3.slug} ${f.key}`) ?? 0 }));
    const customList: EffMerkmal[] = forL3.filter(r => !r.hidden && !codeKeys.has(r.key))
      .map(r => ({ key: r.key, label: r.label, source: 'custom', usage: usageMap.get(`${l3.slug} ${r.key}`) ?? 0 }));
    const hiddenCodeList = l3.features.filter(f => hidden.has(f.key))
      .map(f => ({ key: f.key, label: f.label }));
    return { eff: [...codeList, ...customList], hiddenCode: hiddenCodeList };
  }, [data.db, l3, usageMap]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr('');
    try { await fn(); setEdit(null); onReload(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  function startEdit(key: string, action: 'merge' | 'delete') {
    setEdit({ key, action }); setTarget(eff.find(m => m.key !== key)?.key ?? ''); setDelMode('remove'); setErr('');
  }

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5 mt-2">Merkmale</p>
      {eff.length === 0 && <p className="text-xs text-white/30 mb-2">— noch keine —</p>}
      <div className="space-y-1">
        {eff.map(m => (
          <div key={m.key}>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-white/80">{m.label}</span>
              {m.source === 'custom' && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[var(--color-amber)]/20 text-[var(--color-amber)]">neu</span>}
              <span className="text-[11px] text-white/35">{m.usage} {m.usage === 1 ? 'Ort' : 'Orte'}</span>
              <div className="ml-auto flex gap-1">
                {eff.length > 1 && <button onClick={() => startEdit(m.key, 'merge')} disabled={busy} title="Zusammenführen" className="text-[11px] text-white/40 hover:text-white/80 px-1.5"><i className="fa-solid fa-code-merge" /></button>}
                <button onClick={() => startEdit(m.key, 'delete')} disabled={busy} title="Löschen" className="text-[11px] text-white/40 hover:text-red-400 px-1.5"><i className="fa-solid fa-trash" /></button>
              </div>
            </div>
            {edit?.key === m.key && edit.action === 'merge' && (
              <div className="mt-1 mb-2 p-2.5 rounded-lg bg-black/30 text-xs space-y-2">
                <p className="text-white/60">„{m.label}" zusammenführen mit — {m.usage} {m.usage === 1 ? 'Ort übernimmt' : 'Orte übernehmen'} das Ziel:</p>
                <div className="flex gap-2">
                  <select value={target} onChange={e => setTarget(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white/90 outline-none">
                    {eff.filter(x => x.key !== m.key).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                  <button onClick={() => run(() => adminApi.mergeMerkmal(l3.slug, m.key, target))} disabled={busy || !target} className="bg-[var(--color-amber)] text-black font-semibold px-3 rounded-lg disabled:opacity-50">Zusammenführen</button>
                  <button onClick={() => setEdit(null)} className="text-white/40 px-2">Abbrechen</button>
                </div>
              </div>
            )}
            {edit?.key === m.key && edit.action === 'delete' && (
              <div className="mt-1 mb-2 p-2.5 rounded-lg bg-black/30 text-xs space-y-2">
                <p className="text-white/60">„{m.label}" löschen. Was passiert mit den {m.usage} {m.usage === 1 ? 'Ort' : 'Orten'}?</p>
                <label className="flex items-center gap-2 text-white/75"><input type="radio" checked={delMode === 'remove'} onChange={() => setDelMode('remove')} /> Merkmal entfernen</label>
                <label className="flex items-center gap-2 text-white/75"><input type="radio" checked={delMode === 'reassign'} onChange={() => setDelMode('reassign')} disabled={eff.length < 2} /> Umziehen auf:
                  <select value={target} onChange={e => setTarget(e.target.value)} disabled={delMode !== 'reassign'} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white/90 outline-none disabled:opacity-40">
                    {eff.filter(x => x.key !== m.key).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                </label>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => run(() => adminApi.deleteMerkmal(l3.slug, m.key, delMode, delMode === 'reassign' ? target : undefined))} disabled={busy || (delMode === 'reassign' && !target)} className="bg-red-500/80 text-white font-semibold px-3 py-1 rounded-lg disabled:opacity-50">Löschen</button>
                  <button onClick={() => setEdit(null)} className="text-white/40 px-2">Abbrechen</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={e => { e.preventDefault(); if (newLabel.trim()) run(async () => { await adminApi.addMerkmal(l3.slug, newLabel.trim()); setNewLabel(''); }); }} className="flex gap-2 mt-2.5">
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Neues Merkmal…" maxLength={60}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/90 placeholder-white/25 outline-none focus:border-[var(--color-amber)]/50" />
        <button type="submit" disabled={busy || !newLabel.trim()} className="text-xs font-semibold bg-white/10 hover:bg-white/15 text-white/80 px-3 rounded-lg disabled:opacity-40"><i className="fa-solid fa-plus mr-1" />Hinzufügen</button>
      </form>
      {hiddenCode.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <p className="text-[10px] text-white/30 mb-1">Ausgeblendet:</p>
          <div className="flex flex-wrap gap-1.5">
            {hiddenCode.map(h => (
              <button key={h.key} onClick={() => run(() => adminApi.restoreMerkmal(l3.slug, h.key))} disabled={busy}
                className="text-[11px] text-white/40 hover:text-white/80 px-2 py-0.5 rounded-full bg-white/5 line-through hover:no-underline">
                {h.label} <i className="fa-solid fa-rotate-left ml-0.5 text-[9px]" /></button>
            ))}
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-400 mt-1.5">{err}</p>}
    </div>
  );
}

export function AdminTaxonomy() {
  const [open, setOpen]       = useState<Record<string, boolean>>({});
  const [merk, setMerk]       = useState<MerkmaleData>({ db: [], usage: [] });
  const [nodes, setNodes]     = useState<TaxonomyNode[]>([]);
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }));
  const load = () => {
    adminApi.merkmale().then(setMerk).catch(() => {});
    adminApi.taxonomyNodes().then(setNodes).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const tree = useMemo(() => buildEffectiveTaxonomy(nodes), [nodes]);
  const allL2 = useMemo(() => tree.flatMap(l1 => l1.children.map(l2 => ({ slug: l2.slug, label: l2.label }))), [tree]);
  const customSet = useMemo(() => new Set(nodes.filter(n => n.isCustom).map(n => `${n.level}:${n.slug}`)), [nodes]);
  const hiddenNodes = nodes.filter(n => n.hidden);

  const l2s = tree.flatMap(l1 => l1.children);
  const l3s = l2s.flatMap(l2 => l2.children);
  const STATS = [
    { label: 'Bereiche', value: tree.length, icon: 'fa-layer-group' },
    { label: 'Hauptkategorien', value: l2s.length, icon: 'fa-folder-tree' },
    { label: 'Unterkategorien', value: l3s.length, icon: 'fa-tags' },
    { label: 'Merkmale', value: new Set(l3s.flatMap(l3 => l3.features.map(f => f.key))).size, icon: 'fa-hashtag' },
  ];

  return (
    <AdminLayout title="Kategorien & Merkmale">
      <div className="space-y-5">
        <div className="bg-[var(--color-amber)]/10 border border-[var(--color-amber)]/25 rounded-2xl p-4 text-sm text-white/70">
          <i className="fa-solid fa-circle-info text-[var(--color-amber)] mr-2" />
          Die echte Kategorisierung aus dem Einreichformular. Du kannst <strong className="text-white/90">Haupt- &amp; Unterkategorien anlegen,
          umbenennen, verschieben &amp; ausblenden</strong> und je Unterkategorie die <strong className="text-white/90">Merkmale</strong> verwalten.
          Fragen sind read-only.
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STATS.map(s => (
            <div key={s.label} className="bg-white/5 border border-white/8 rounded-2xl p-4">
              <i className={`fa-solid ${s.icon} text-[var(--color-amber)] mb-2`} />
              <div className="font-bold text-2xl text-white">{s.value}</div>
              <div className="text-xs text-white/40">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {tree.map(l1 => (
            <div key={l1.slug} className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
              <button onClick={() => toggle(l1.slug)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left">
                <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm" style={{ background: l1.color }}>
                  <i className={`fa-solid ${l1.icon}`} />
                </span>
                <span className="flex-1 min-w-0 font-bold text-white/90 text-sm">{l1.label}</span>
                <span className="text-xs text-white/40">{l1.children.length} Hauptkat.</span>
                <i className={`fa-solid fa-chevron-${open[l1.slug] ? 'up' : 'down'} text-white/30 text-xs`} />
              </button>

              {open[l1.slug] && (
                <div className="px-3 pb-3 space-y-1.5">
                  {l1.children.map(l2 => (
                    <div key={l2.slug} className="bg-white/5 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <button onClick={() => toggle(l2.slug)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                          <i className={`fa-solid ${l2.icon} text-white/50 text-sm w-4 text-center flex-shrink-0`} />
                          <span className="font-semibold text-white/80 text-sm truncate">{l2.label}</span>
                          {customSet.has(`2:${l2.slug}`) && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[var(--color-amber)]/20 text-[var(--color-amber)]">neu</span>}
                          <span className="text-[11px] text-white/35">{l2.children.length}</span>
                        </button>
                        <NodeEdit level={2} slug={l2.slug} label={l2.label} icon={l2.icon} allL2={allL2} onDone={load} />
                      </div>

                      {open[l2.slug] && (
                        <div className="px-2.5 pb-2.5 space-y-1.5">
                          {l2.children.map(l3 => (
                            <div key={l3.slug} className="bg-black/20 rounded-lg overflow-hidden">
                              <div className="flex items-center gap-2 px-3 py-2">
                                <button onClick={() => toggle(l3.slug)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                                  <i className={`fa-solid fa-chevron-${open[l3.slug] ? 'down' : 'right'} text-white/25 text-[10px] w-2.5`} />
                                  <span className="text-sm text-white/80 truncate">{l3.label}</span>
                                  {customSet.has(`3:${l3.slug}`) && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[var(--color-amber)]/20 text-[var(--color-amber)]">neu</span>}
                                  <span className="text-[10px] text-white/35">{l3.features.length} M · {l3.questions.length} F</span>
                                </button>
                                <NodeEdit level={3} slug={l3.slug} label={l3.label} allL2={allL2} onDone={load} />
                              </div>
                              {open[l3.slug] && (
                                <div className="px-3 pb-3 pt-1 space-y-3 border-t border-white/5">
                                  <MerkmaleManager l3={l3} data={merk} onReload={load} />
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1">Fragen</p>
                                    <ul className="divide-y divide-white/5">{l3.questions.map(q => <QuestionRow key={q.id} q={q} />)}</ul>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                          <AddForm level={3} parentSlug={l2.slug} onDone={load} />
                        </div>
                      )}
                    </div>
                  ))}
                  <AddForm level={2} parentSlug={l1.slug} onDone={load} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Ausgeblendete Kategorien — wiederherstellbar */}
        {hiddenNodes.length > 0 && (
          <div className="bg-white/5 border border-white/8 rounded-2xl p-4">
            <p className="text-sm font-bold text-white/80 mb-2">Ausgeblendete Kategorien</p>
            <div className="flex flex-wrap gap-2">
              {hiddenNodes.map(n => (
                <button key={`${n.level}:${n.slug}`} onClick={() => adminApi.restoreTaxNode(n.level as 2 | 3, n.slug).then(load)}
                  className="text-xs text-white/40 hover:text-white/80 px-2.5 py-1 rounded-full bg-white/5 line-through hover:no-underline">
                  {n.label ?? n.slug} <span className="text-[9px] not-italic no-underline">({n.level === 2 ? 'Haupt' : 'Unter'})</span>
                  <i className="fa-solid fa-rotate-left ml-1 text-[9px]" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white/5 border border-white/8 rounded-2xl p-4">
          <p className="text-sm font-bold text-white/80 mb-1">Allgemeine Fragen</p>
          <p className="text-xs text-white/40 mb-3">Werden bei <strong className="text-white/70">jeder</strong> Unterkategorie zusätzlich gestellt.</p>
          <ul className="divide-y divide-white/5">{UNIVERSAL_QUESTIONS.map(q => <QuestionRow key={q.id} q={q} />)}</ul>
        </div>
      </div>
    </AdminLayout>
  );
}
