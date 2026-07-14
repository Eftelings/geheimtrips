import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from './AdminLayout.js';
import { useTaxVocab } from '../../data/taxVocab.js';
import { catalogForTag, enabledForTag } from '../../data/questionCatalog.js';
import type { QuestionConfig } from '../../data/questionCatalog.js';
import { adminApi } from '../../services/adminApi.js';

const QTYPE: Record<string, string> = {
  textarea: 'Freitext', text: 'Kurztext', select: 'Auswahl', stars: 'Sterne',
  yesno: 'Ja/Nein', multicheck: 'Mehrfach', slider: 'Schieberegler',
  weekhours: 'Öffnungszeiten', pricefields: 'Preise',
};

function Toggle({ on, onClick, busy }: { on: boolean; onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} aria-pressed={on}
      className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
      style={{ background: on ? 'var(--color-amber)' : 'rgba(255,255,255,0.15)' }}>
      <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
        style={{ transform: on ? 'translateX(16px)' : 'translateX(0)' }} />
    </button>
  );
}

function TagRow({ tag, label, config, setConfig }: {
  tag: string; label: string;
  config: QuestionConfig;
  setConfig: React.Dispatch<React.SetStateAction<QuestionConfig>>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const questions = useMemo(() => catalogForTag(tag), [tag]);
  const changed = Object.keys(config[tag] ?? {}).length > 0;
  const activeCount = questions.filter(q => enabledForTag(tag, q.id, config)).length;

  async function toggle(qid: string) {
    const next = !enabledForTag(tag, qid, config);
    setBusy(true);
    setConfig(prev => ({ ...prev, [tag]: { ...(prev[tag] ?? {}), [qid]: next } }));   // optimistisch
    try { await adminApi.toggleQuestion(tag, qid, next); }
    catch {
      setConfig(prev => { const t = { ...(prev[tag] ?? {}) }; delete t[qid]; return { ...prev, [tag]: t }; });
    } finally { setBusy(false); }
  }
  async function reset() {
    setBusy(true);
    setConfig(prev => { const c = { ...prev }; delete c[tag]; return c; });
    try { await adminApi.resetQuestions(tag); } finally { setBusy(false); }
  }

  return (
    <div className="border-b border-white/5 last:border-0">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 py-2.5 text-left">
        <i className={`fa-solid fa-chevron-${open ? 'down' : 'right'} text-[10px] text-white/40 w-3`} />
        <span className="text-sm text-white/85 font-medium">{label}</span>
        {changed && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[var(--color-amber)]/20 text-[var(--color-amber)]">angepasst</span>}
        <span className="ml-auto text-[11px] text-white/35">{activeCount}/{questions.length} Fragen</span>
      </button>
      {open && (
        <div className="pl-5 pb-3 space-y-1.5">
          {questions.map(q => {
            const on = enabledForTag(tag, q.id, config);
            return (
              <div key={q.id} className="flex items-center gap-3 py-0.5">
                <Toggle on={on} onClick={() => toggle(q.id)} busy={busy} />
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-white/45 flex-shrink-0">{QTYPE[q.type] ?? q.type}</span>
                <span className={`text-xs ${on ? 'text-white/80' : 'text-white/35 line-through'}`}>{q.label}</span>
              </div>
            );
          })}
          {changed && (
            <button onClick={reset} disabled={busy} className="text-[11px] text-white/40 hover:text-white/80 mt-1.5">
              <i className="fa-solid fa-rotate-left mr-1" />Auf Standard zurücksetzen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminQuestions() {
  const vocab = useTaxVocab();
  const [config, setConfig] = useState<QuestionConfig>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    adminApi.questionsConfig().then(c => { setConfig(c); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  const tagsByGroup = useMemo(() => {
    const m: Record<string, { slug: string; label: string }[]> = {};
    for (const t of vocab?.tags ?? []) {
      const g = t.groups[0] ?? 'sonstige';
      (m[g] ??= []).push({ slug: t.slug, label: t.label });
    }
    for (const g in m) m[g].sort((a, b) => a.label.localeCompare(b.label, 'de'));
    return m;
  }, [vocab]);

  return (
    <AdminLayout title="Fragen">
      <div className="max-w-3xl">
        <h1 className="text-lg font-bold mb-1">Fragen beim Einreichen</h1>
        <p className="text-xs text-white/50 mb-5 leading-relaxed">
          Steuere pro Typ-Tag, welche Zusatz-Fragen im Einreichen-Formular gestellt werden (und damit auch, was am Ort erscheint).
          Ohne Anpassung gelten die Standard-Vorgaben. Grundfragen (Name, Standort, Beschreibung) sind immer dabei und hier nicht gelistet.
        </p>
        {!vocab || !loaded ? (
          <div className="text-white/40 py-10 text-center"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>
        ) : (
          <div className="space-y-6">
            {(vocab.groups ?? []).map(g => (
              <div key={g.slug}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: (g.color ?? '#8A6FB3') + '33' }}>
                    <i className={`fa-solid ${g.icon ?? 'fa-tag'} text-xs`} style={{ color: g.color ?? '#8A6FB3' }} />
                  </span>
                  <h2 className="text-sm font-bold text-white/90">{g.label}</h2>
                  <span className="text-[11px] text-white/30">{(tagsByGroup[g.slug] ?? []).length} Typen</span>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3">
                  {(tagsByGroup[g.slug] ?? []).length === 0
                    ? <p className="text-xs text-white/25 py-3">— keine Typen —</p>
                    : (tagsByGroup[g.slug] ?? []).map(t => (
                        <TagRow key={t.slug} tag={t.slug} label={t.label} config={config} setConfig={setConfig} />
                      ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
