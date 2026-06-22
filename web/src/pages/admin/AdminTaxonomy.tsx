import { useState } from 'react';
import { AdminLayout } from './AdminLayout.js';
import { TAXONOMY, UNIVERSAL_QUESTIONS } from '../../data/taxonomy.js';
import type { SubmitQuestion } from '../../data/taxonomy.js';

// Lesbare Labels für die Fragetypen
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
      <span className="text-white/75">
        {q.label}
        {q.required && <span className="text-[var(--color-amber)] ml-1">*</span>}
        {q.options && q.options.length > 0 && (
          <span className="text-white/35"> · {q.options.length} Optionen</span>
        )}
      </span>
    </li>
  );
}

export function AdminTaxonomy() {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }));

  // Kennzahlen
  const l2s = TAXONOMY.flatMap(l1 => l1.children);
  const l3s = l2s.flatMap(l2 => l2.children);
  const merkmale = new Set(l3s.flatMap(l3 => l3.features.map(f => f.key)));

  const STATS = [
    { label: 'Bereiche', value: TAXONOMY.length, icon: 'fa-layer-group' },
    { label: 'Hauptkategorien', value: l2s.length, icon: 'fa-folder-tree' },
    { label: 'Unterkategorien', value: l3s.length, icon: 'fa-tags' },
    { label: 'Merkmale', value: merkmale.size, icon: 'fa-hashtag' },
  ];

  return (
    <AdminLayout title="Kategorien & Merkmale">
      <div className="space-y-5">
        {/* Hinweis */}
        <div className="bg-[var(--color-amber)]/10 border border-[var(--color-amber)]/25 rounded-2xl p-4 text-sm text-white/70">
          <i className="fa-solid fa-circle-info text-[var(--color-amber)] mr-2" />
          Das ist die <strong className="text-white/90">echte Kategorisierung aus dem Einreichformular</strong> –
          dieselbe, die Nutzer:innen beim Anlegen eines Ortes durchlaufen. Hier siehst du jede Unterkategorie
          mit ihren <strong className="text-white/90">Merkmalen</strong> und <strong className="text-white/90">Fragen</strong>.
          (Bearbeiten folgt im nächsten Schritt.)
        </div>

        {/* Kennzahlen */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STATS.map(s => (
            <div key={s.label} className="bg-white/5 border border-white/8 rounded-2xl p-4">
              <i className={`fa-solid ${s.icon} text-[var(--color-amber)] mb-2`} />
              <div className="font-bold text-2xl text-white">{s.value}</div>
              <div className="text-xs text-white/40">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Baum */}
        <div className="space-y-2">
          {TAXONOMY.map(l1 => {
            const l1Open = open[l1.slug];
            return (
              <div key={l1.slug} className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
                {/* L1 — Bereich */}
                <button onClick={() => toggle(l1.slug)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left">
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm"
                    style={{ background: l1.color }}>
                    <i className={`fa-solid ${l1.icon}`} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-white/90 text-sm">{l1.label}</span>
                    <span className="text-[11px] text-white/40 font-mono">{l1.slug}</span>
                  </span>
                  <span className="text-xs text-white/40">{l1.children.length} Hauptkat.</span>
                  <i className={`fa-solid fa-chevron-${l1Open ? 'up' : 'down'} text-white/30 text-xs`} />
                </button>

                {/* L2 — Hauptkategorien */}
                {l1Open && (
                  <div className="px-3 pb-3 space-y-1.5">
                    {l1.children.map(l2 => {
                      const l2Open = open[l2.slug];
                      return (
                        <div key={l2.slug} className="bg-white/5 rounded-xl overflow-hidden">
                          <button onClick={() => toggle(l2.slug)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors text-left">
                            <i className={`fa-solid ${l2.icon} text-white/50 text-sm w-4 text-center flex-shrink-0`} />
                            <span className="flex-1 min-w-0 font-semibold text-white/80 text-sm">{l2.label}</span>
                            <span className="text-[11px] text-white/35">{l2.children.length} Unterkat.</span>
                            <i className={`fa-solid fa-chevron-${l2Open ? 'up' : 'down'} text-white/25 text-[10px]`} />
                          </button>

                          {/* L3 — Unterkategorien */}
                          {l2Open && (
                            <div className="px-2.5 pb-2.5 space-y-1.5">
                              {l2.children.map(l3 => {
                                const l3Open = open[l3.slug];
                                return (
                                  <div key={l3.slug} className="bg-black/20 rounded-lg overflow-hidden">
                                    <button onClick={() => toggle(l3.slug)}
                                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left">
                                      <i className={`fa-solid fa-chevron-${l3Open ? 'down' : 'right'} text-white/25 text-[10px] w-2.5`} />
                                      <span className="flex-1 min-w-0 text-sm text-white/80">{l3.label}</span>
                                      <span className="text-[10px] text-white/35">{l3.features.length} Merkmale · {l3.questions.length} Fragen</span>
                                    </button>

                                    {l3Open && (
                                      <div className="px-3 pb-3 pt-1 space-y-3 border-t border-white/5">
                                        {/* Merkmale */}
                                        <div>
                                          <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5 mt-2">Merkmale</p>
                                          {l3.features.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5">
                                              {l3.features.map(f => (
                                                <span key={f.key} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                                                  {f.label}
                                                </span>
                                              ))}
                                            </div>
                                          ) : <p className="text-xs text-white/30">— keine —</p>}
                                        </div>
                                        {/* Fragen */}
                                        <div>
                                          <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1">Fragen</p>
                                          <ul className="divide-y divide-white/5">
                                            {l3.questions.map(q => <QuestionRow key={q.id} q={q} />)}
                                          </ul>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Universelle Fragen */}
        <div className="bg-white/5 border border-white/8 rounded-2xl p-4">
          <p className="text-sm font-bold text-white/80 mb-1">Allgemeine Fragen</p>
          <p className="text-xs text-white/40 mb-3">Diese Fragen werden bei <strong className="text-white/70">jeder</strong> Unterkategorie zusätzlich gestellt.</p>
          <ul className="divide-y divide-white/5">
            {UNIVERSAL_QUESTIONS.map(q => <QuestionRow key={q.id} q={q} />)}
          </ul>
        </div>
      </div>
    </AdminLayout>
  );
}
