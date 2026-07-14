import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type AdminPlace } from '../../services/adminApi.js';

export function AdminSubmissions() {
  const navigate = useNavigate();
  const [items, setItems]   = useState<AdminPlace[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const s = await adminApi.submissions();
    setItems(s); setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function approve(id: string) {
    await adminApi.approveSubmission(id);
    load();
  }

  async function reject(id: string) {
    if (!confirm('Einreichung ablehnen und löschen?')) return;
    await adminApi.rejectSubmission(id);
    load();
  }

  return (
    <AdminLayout title={`Einreichungen (${items.length})`}>
      {loading ? (
        <div className="flex justify-center py-12 text-white/30">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <i className="fa-solid fa-inbox text-5xl text-white/10 mb-4" />
          <p className="text-white/40">Keine ausstehenden Einreichungen</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(p => (
            <div key={p.id} className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
              <img src={p.hero} alt={p.name} className="w-full h-36 object-cover" />
              <div className="p-4">
                <div className="font-semibold text-white/90 mb-0.5">{p.name}</div>
                <div className="text-xs text-white/40 mb-1">{p.region}</div>
                <p className="text-xs text-white/50 line-clamp-2 mb-3">{p.short}</p>
                <div className="flex items-center gap-1 mb-3">
                  <span className="bg-[var(--color-amber)]/20 text-[var(--color-amber)] text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {p.categoryLabel}
                  </span>
                  <span className="text-white/30 text-[10px]">{p.distanceLabel} · {p.costLabel}</span>
                </div>
                {p.lat && <p className="text-[10px] text-white/25 mb-3">📍 {p.lat.toFixed(4)}, {p.lng?.toFixed(4)}</p>}
                {/* Ansehen / Bearbeiten vor der Freigabe */}
                <div className="flex gap-2 mb-2">
                  <button onClick={() => navigate(`/ort/${p.id}`)}
                    className="flex-1 bg-white/5 text-white/70 font-semibold py-2 rounded-xl text-xs hover:bg-white/10 transition-colors">
                    <i className="fa-solid fa-eye mr-1" /> Ansehen
                  </button>
                  <button onClick={() => navigate(`/submit?edit=${p.id}`)}
                    className="flex-1 bg-white/5 text-white/70 font-semibold py-2 rounded-xl text-xs hover:bg-white/10 transition-colors">
                    <i className="fa-solid fa-pen mr-1" /> Bearbeiten
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approve(p.id)}
                    className="flex-1 bg-[var(--color-success)]/20 text-[var(--color-success)] font-semibold py-2 rounded-xl text-xs hover:bg-[var(--color-success)]/30 transition-colors">
                    <i className="fa-solid fa-check mr-1" /> Freischalten
                  </button>
                  <button onClick={() => reject(p.id)}
                    className="flex-1 bg-red-500/10 text-red-400 font-semibold py-2 rounded-xl text-xs hover:bg-red-500/20 transition-colors">
                    <i className="fa-solid fa-xmark mr-1" /> Ablehnen
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
