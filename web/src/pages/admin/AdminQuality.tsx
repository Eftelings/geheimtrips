import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type PlaceQuality } from '../../services/adminApi.js';

const ACC_LABEL = ['—', 'Gar nicht', 'Kaum', 'Teilweise', 'Größtenteils', 'Perfekt'];

function accColor(avg: number | null): string {
  if (avg == null) return '#6b7280';
  if (avg < 2.5) return '#ef4444';   // rot — Beschreibung verbessern
  if (avg < 3.5) return '#f59e0b';   // gelb
  return '#22c55e';                  // grün
}

type SortKey = 'accuracy' | 'stars' | 'count';

export function AdminQuality() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PlaceQuality[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('accuracy');

  useEffect(() => { adminApi.placesQuality().then(setRows).finally(() => setLoading(false)); }, []);

  const sorted = useMemo(() => {
    const arr = [...rows];
    if (sort === 'accuracy') arr.sort((a, b) => (a.accuracyAvg ?? 99) - (b.accuracyAvg ?? 99)); // schlechteste zuerst
    if (sort === 'stars')    arr.sort((a, b) => (a.starsAvg ?? 99) - (b.starsAvg ?? 99));
    if (sort === 'count')    arr.sort((a, b) => b.ratingCount - a.ratingCount);
    return arr;
  }, [rows, sort]);

  const needsWork = rows.filter(r => r.accuracyAvg != null && r.accuracyAvg < 3 && r.accuracyCount >= 1).length;

  return (
    <AdminLayout title="Qualität & Beschreibungen">
      <p className="text-sm text-white/50 max-w-2xl mb-5">
        Treffsicherheit der Beschreibungen aus den Nutzer-Bewertungen („War die Beschreibung zutreffend?").
        Ein niedriger Schnitt bedeutet: Die Beschreibung passt nicht zur Realität und sollte überarbeitet werden.
        {needsWork > 0 && <strong className="text-amber-400"> {needsWork} Ort(e) brauchen Aufmerksamkeit.</strong>}
      </p>

      <div className="flex gap-2 mb-4">
        {([['accuracy', 'Beschreibungs-Score'], ['stars', 'Sterne'], ['count', 'Anzahl Bewertungen']] as [SortKey, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setSort(k)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${sort === k ? 'bg-[var(--color-amber)] text-black' : 'bg-[#1a1228] text-white/50 hover:text-white/80'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-white/30"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>
      ) : sorted.length === 0 ? (
        <p className="text-white/30 text-sm py-8 text-center">Noch keine Bewertungen vorhanden.</p>
      ) : (
        <div className="grid gap-2">
          {sorted.map(r => (
            <button key={r.id} onClick={() => navigate(`/place/${r.id}`)}
              className="bg-[#1a1228] border border-white/8 rounded-2xl p-4 flex items-center gap-4 text-left hover:border-white/20 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white truncate">{r.name}</div>
                <div className="text-xs text-white/40">{r.region}</div>
              </div>
              {/* Beschreibungs-Score */}
              <div className="text-center w-28 flex-shrink-0">
                <div className="text-lg font-bold" style={{ color: accColor(r.accuracyAvg) }}>
                  {r.accuracyAvg != null ? `${r.accuracyAvg} / 5` : '—'}
                </div>
                <div className="text-[10px] text-white/40">
                  {r.accuracyAvg != null ? ACC_LABEL[Math.round(r.accuracyAvg)] : 'keine Angabe'}
                  {r.accuracyCount > 0 && ` · ${r.accuracyCount}×`}
                </div>
              </div>
              {/* Sterne */}
              <div className="text-center w-20 flex-shrink-0">
                <div className="text-sm font-bold text-[var(--color-amber)]">{r.starsAvg != null ? `${r.starsAvg} ★` : '—'}</div>
                <div className="text-[10px] text-white/40">{r.ratingCount} Bew.</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
