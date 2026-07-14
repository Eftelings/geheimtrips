import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type AdminChangeRequest } from '../../services/adminApi.js';

const CAT_LABEL: Record<string, string> = {
  inhalt: 'Beschreibung', tipp: 'Kurzbeschreibung', website: 'Website',
  bilder: 'Foto', zeiten: 'Öffnungszeiten', sonstiges: 'Sonstiges',
};

export function AdminChangeRequests() {
  const [items, setItems]     = useState<AdminChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = () => adminApi.changeRequests().then(d => { setItems(d); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const resolve = (id: number, status: 'done' | 'dismissed') => adminApi.resolveChangeRequest(id, status).then(load);

  const openCount = items.filter(i => i.status === 'open').length;

  return (
    <AdminLayout title={`Änderungsanfragen${openCount ? ` (${openCount} offen)` : ''}`}>
      {loading ? (
        <div className="flex justify-center py-12 text-white/30"><i className="fa-solid fa-circle-notch fa-spin text-3xl" /></div>
      ) : items.length === 0 ? (
        <p className="text-white/40 text-sm">Noch keine Änderungsanfragen.</p>
      ) : (
        <div className="space-y-2.5">
          {items.map(it => (
            <div key={it.id}
              className={`bg-white/5 border rounded-2xl p-4 ${it.status === 'open' ? 'border-[var(--color-amber)]/30' : 'border-white/8 opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button onClick={() => navigate(`/ort/${it.placeId}`)}
                    className="font-semibold text-white/90 hover:underline text-sm">{it.placeName ?? it.placeId}</button>
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">
                    {CAT_LABEL[it.category] ?? it.category}
                  </span>
                </div>
                {it.status !== 'open' && (
                  <span className="text-[10px] font-bold uppercase text-white/40 flex-shrink-0">
                    {it.status === 'done' ? '✓ erledigt' : 'verworfen'}
                  </span>
                )}
              </div>
              <p className="text-sm text-white/75 mt-1.5 whitespace-pre-wrap">„{it.text}"</p>
              <p className="text-xs text-white/40 mt-1">
                von {it.userName} · {it.createdAt ? new Date(it.createdAt.replace(' ', 'T') + 'Z').toLocaleString('de') : ''}
              </p>
              {it.status === 'open' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => resolve(it.id, 'done')}
                    className="bg-[var(--color-success)]/80 text-white font-semibold px-3 py-1.5 rounded-lg text-xs">
                    <i className="fa-solid fa-check mr-1" />Erledigt
                  </button>
                  <button onClick={() => resolve(it.id, 'dismissed')}
                    className="bg-white/10 text-white/70 font-semibold px-3 py-1.5 rounded-lg text-xs hover:bg-white/15">
                    Verwerfen
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
