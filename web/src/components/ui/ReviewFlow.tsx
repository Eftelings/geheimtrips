import { useState } from 'react';
import { placesApi } from '../../services/api.js';

export interface ReviewSection { key: string; label: string; value: string }

/**
 * Geführter Review-Durchlauf: Schritt für Schritt durch die Abschnitte eines Orts,
 * je Abschnitt „stimmt" (✓) oder „hat sich geändert" (✗ → Änderungsvorschlag).
 * Am Ende zählt es als Review (Punkte) und setzt den 3-Monats-Turnus zurück.
 */
export function ReviewFlow({ placeId, placeName, sections, onClose, onReviewed }: {
  placeId: string; placeName: string; sections: ReviewSection[];
  onClose: () => void; onReviewed: (points: number) => void;
}) {
  const [step, setStep] = useState(0);
  const [changing, setChanging] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [changeCount, setChangeCount] = useState(0);
  const [done, setDone] = useState<{ points: number } | null>(null);

  const total = sections.length;
  const cur = sections[step];

  async function finish() {
    setBusy(true);
    try { const res = await placesApi.submitReview(placeId); setDone({ points: res.points }); onReviewed(res.points); }
    catch { setDone({ points: 0 }); }
    setBusy(false);
  }
  function next() {
    setChanging(false); setText('');
    if (step + 1 >= total) finish();
    else setStep(s => s + 1);
  }
  async function submitChange() {
    if (!text.trim()) return;
    setBusy(true);
    try { await placesApi.suggestChange(placeId, cur.label, text.trim()); setChangeCount(c => c + 1); } catch { /* */ }
    setBusy(false);
    next();
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full sm:max-w-md bg-[#FBF9FC] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col" style={{ maxHeight: '92dvh' }}>
        {done ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(46,125,50,0.12)' }}>
              <i className="fa-solid fa-circle-check text-3xl" style={{ color: 'var(--color-success)' }} />
            </div>
            <h2 className="font-display font-bold text-xl text-[var(--color-aubergine)] mb-1">Danke fürs Reviewen! 🙌</h2>
            {done.points > 0 && <p className="text-sm text-[var(--color-lavender)] mb-1">Du hast <strong className="text-[var(--color-amber)]">+{done.points} Punkte</strong> gesammelt.</p>}
            {changeCount > 0 && <p className="text-xs text-[var(--color-lavender)] mb-1">{changeCount === 1 ? 'Dein Änderungsvorschlag wurde' : `${changeCount} Änderungsvorschläge wurden`} ans Team geschickt.</p>}
            <button onClick={onClose} className="mt-5 w-full bg-[var(--color-amber)] text-white font-bold py-3 rounded-2xl active:scale-[0.98] transition-transform">Fertig</button>
          </div>
        ) : (
          <>
            <div className="px-5 pt-5 pb-3 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)]">Review · Schritt {step + 1} von {total}</p>
                <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#F1ECF4', color: '#71587a' }}><i className="fa-solid fa-xmark" /></button>
              </div>
              <div className="h-1.5 rounded-full bg-[#F1ECF4] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${(step / total) * 100}%`, background: 'var(--color-amber)' }} />
              </div>
            </div>

            <div className="px-5 pb-5 overflow-y-auto flex-1">
              <p className="text-sm font-semibold text-[var(--color-aubergine)] mb-2">Stimmt das noch bei „{placeName}"?</p>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-1.5">{cur.label}</p>
              <div className="rounded-2xl p-4 bg-white text-[15px] text-[var(--color-body)] leading-snug mb-4" style={{ border: '1px solid #F1ECF4' }}>
                {cur.value ? cur.value : <span className="italic text-[var(--color-lavender-lt)]">— keine Angabe —</span>}
              </div>

              {changing ? (
                <div>
                  <textarea value={text} onChange={e => setText(e.target.value)} rows={3} autoFocus
                    placeholder={`Was hat sich bei „${cur.label}" geändert?`}
                    className="w-full rounded-2xl px-4 py-3 text-sm outline-none bg-white resize-none" style={{ border: '1px solid #e5dcea', color: '#34254C' }} />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => { setChanging(false); setText(''); }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#F1ECF4', color: '#71587a' }}>Zurück</button>
                    <button onClick={submitChange} disabled={!text.trim() || busy} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: 'var(--color-amber)' }}>
                      {busy ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Vorschlagen & weiter'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button onClick={() => setChanging(true)} disabled={busy}
                    className="flex-1 flex flex-col items-center gap-1.5 py-4 rounded-2xl border-2 transition-all active:scale-95 disabled:opacity-50"
                    style={{ borderColor: '#f0d0c4', color: '#C96442', background: 'white' }}>
                    <i className="fa-solid fa-xmark text-xl" /><span className="text-xs font-bold">Hat sich geändert</span>
                  </button>
                  <button onClick={next} disabled={busy}
                    className="flex-1 flex flex-col items-center gap-1.5 py-4 rounded-2xl border-2 transition-all active:scale-95 disabled:opacity-50"
                    style={{ borderColor: '#c9e6d1', color: '#2e7d32', background: 'white' }}>
                    {busy && step + 1 >= total ? <i className="fa-solid fa-circle-notch fa-spin text-xl" /> : <i className="fa-solid fa-check text-xl" />}
                    <span className="text-xs font-bold">Stimmt</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
