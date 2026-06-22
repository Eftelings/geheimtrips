import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { useAppStore } from '../store/useAppStore.js';
import { TAXONOMY, UNIVERSAL_QUESTIONS } from '../data/taxonomy.js';
import type { TaxonomyL1, TaxonomyL2, TaxonomyL3, SubmitQuestion } from '../data/taxonomy.js';
import type { Place } from '../types/index.js';
import { placesApi, mediaApi, aiApi } from '../services/api.js';
import { geocodeSuggestions, reverseGeocode, requestGpsPosition } from '../services/geoService.js';
import type { GeoLocation } from '../services/geoService.js';

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const C = { amber: '#F99039', aubergine: '#34254C', lavender: '#71587A' };
const MAX_MEDIA = 5;
const MAX_TIPS  = 5;
const TOTAL_STEPS = 6;

// ─── Types ────────────────────────────────────────────────────────────────────
interface MediaItem {
  id:           string;
  localUrl:     string;     // blob URL while uploading, then replaced by serverUrl for display
  serverUrl?:   string;     // path returned from API, e.g. /uploads/abc.jpg
  caption:      string;
  cropX:        number;     // 0–1 horizontal position (left↔right)
  cropY:        number;     // 0–1 vertical position   (top↔bottom)
  type:         'image' | 'video';
  uploading:    boolean;
  error?:       string;
  isLandscape?: boolean;
  muted?:       boolean;    // video mute state (default true)
}

interface WizardState {
  name:         string;
  short:        string;
  locationText: string;
  lat:          number | null;
  lng:          number | null;
  l1:           TaxonomyL1 | null;
  l2:           TaxonomyL2 | null;
  l3:           TaxonomyL3 | null;
  l4Features:   string[];
  answers:      Record<string, unknown>;
  long:         string;     // HTML from rich-text editor
  tips:         string[];
  media:        MediaItem[];
  heroIndex:    number;     // index of selected cover image
}

const EMPTY: WizardState = {
  name: '', short: '', locationText: '', lat: null, lng: null,
  l1: null, l2: null, l3: null, l4Features: [],
  answers: {}, long: '', tips: [''], media: [], heroIndex: 0,
};

const isVideoUrl = (u: string) => /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(u);

// Bestehenden Ort → Wizard-State (für den Bearbeiten-Modus). Löst die Taxonomie
// aus den gespeicherten Slugs auf und baut die Medienliste aus Titelbild + Galerie.
function placeToWizardState(place: Place): WizardState {
  const attrs = (place.attributes ?? {}) as Record<string, unknown>;
  const l1 = TAXONOMY.find(x => x.slug === attrs.l1Slug) ?? null;
  const l2 = l1?.children.find(x => x.slug === attrs.l2Slug) ?? null;
  const l3 = l2?.children.find(x => x.slug === attrs.l3Slug) ?? null;
  const crops = place.galleryCrops ?? {};

  const media: MediaItem[] = [];
  if (place.hero) {
    media.push({
      id: 'hero', localUrl: place.hero, serverUrl: place.hero, caption: '',
      cropX: place.heroCropX ?? 0.5, cropY: place.heroCropY ?? 0.5,
      type: isVideoUrl(place.hero) ? 'video' : 'image', uploading: false, muted: true,
    });
  }
  (place.gallery ?? []).forEach((url, i) => {
    const c = crops[url] ?? {};
    media.push({
      id: `g${i}`, localUrl: url, serverUrl: url, caption: '',
      cropX: c.cropX ?? 0.5, cropY: c.cropY ?? 0.5,
      type: isVideoUrl(url) ? 'video' : 'image', uploading: false, muted: true,
    });
  });

  return {
    name:         place.name ?? '',
    short:        place.short ?? '',
    locationText: (attrs.locationText as string) ?? place.region ?? '',
    lat:          place.lat ?? null,
    lng:          place.lng ?? null,
    l1, l2, l3,
    l4Features:   Array.isArray(attrs.l4Features) ? (attrs.l4Features as string[]) : [],
    answers:      (attrs.answers as Record<string, unknown>) ?? {},
    long:         place.long ?? '',
    tips:         place.tips?.length ? place.tips : [''],
    media,
    heroIndex:    0,
  };
}

// ─── MiniRichText ─────────────────────────────────────────────────────────────
function MiniRichText({
  value, onChange, placeholder = '', maxLength = 4000, minHeight = 160,
}: {
  value: string; onChange: (html: string) => void;
  placeholder?: string; maxLength?: number; minHeight?: number;
}) {
  const ref           = useRef<HTMLDivElement>(null);
  const lastValid     = useRef(value);        // last HTML that was within limit
  const [count, setCount] = useState(0);
  const [empty, setEmpty] = useState(!value);

  // Set initial content only on mount
  useEffect(() => {
    if (ref.current && value) {
      ref.current.innerHTML = value;
      lastValid.current = value;
      const len = ref.current.textContent?.length ?? 0;
      setCount(len);
      setEmpty(len === 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exec(cmd: string) {
    // Tag-basierte Formatierung (<b>/<i>/<u>) statt style-Spans erzwingen,
    // damit Fett/Kursiv/Unterstrichen zuverlässig gespeichert & angezeigt wird.
    try { document.execCommand('styleWithCSS', false, 'false'); } catch { /* nicht überall unterstützt */ }
    document.execCommand(cmd, false);
    ref.current?.focus();
    sync();
  }

  // Einfügen als Klartext — funktioniert zuverlässig (auch wenn der Browser
  // das Standard-Paste blockt) und verhindert chaotisches Fremd-HTML.
  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (text) document.execCommand('insertText', false, text);
    sync();
  }

  function sync() {
    const el   = ref.current;
    if (!el) return;
    const text = el.textContent ?? '';
    // Enforce hard character limit — restore to last valid state if exceeded
    if (text.length > maxLength) {
      el.innerHTML = lastValid.current;
      // restore cursor to end
      const range = document.createRange();
      const sel   = window.getSelection();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
      return;
    }
    const html  = el.innerHTML ?? '';
    const empty = text.trim() === '';
    lastValid.current = html;
    setCount(text.length);
    setEmpty(empty);
    onChange(empty ? '' : html);
  }

  return (
    <div className="rounded-xl border border-[#E4DCF0] focus-within:border-[#F99039] bg-white overflow-hidden transition-colors">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 pt-1.5 pb-1 border-b border-[#F0EBF7] bg-[#FAF7FD]">
        {[
          { cmd: 'bold',      label: 'B',  cls: 'font-bold'  },
          { cmd: 'italic',    label: 'I',  cls: 'italic'      },
          { cmd: 'underline', label: 'U',  cls: 'underline'   },
        ].map(({ cmd, label, cls }) => (
          <button
            key={cmd}
            type="button"
            title={cmd}
            onMouseDown={e => { e.preventDefault(); exec(cmd); }}
            className={`w-7 h-7 rounded-md text-sm ${cls} text-[#71587A] hover:bg-[#E4DCF0] hover:text-[#34254C] transition-colors`}
          >
            {label}
          </button>
        ))}
        <span className="mx-1 text-[#E4DCF0]">|</span>
        <span className="text-[10px] text-[#B0A3BC] font-normal ml-0.5 select-none">Fett / Kursiv / Unterstrichen</span>
      </div>
      {/* Editable area */}
      <div className="relative">
        {empty && placeholder && (
          <p className="absolute top-0 left-0 right-0 px-4 py-3 text-sm text-[#A89BB5] pointer-events-none leading-relaxed select-none">
            {placeholder}
          </p>
        )}
        <div
          ref={ref}
          contentEditable
          spellCheck
          suppressContentEditableWarning
          onInput={sync}
          onPaste={handlePaste}
          style={{ minHeight }}
          className="px-4 py-3 text-sm text-[#34254C] outline-none leading-relaxed"
        />
      </div>
      {/* Char counter */}
      <div className="px-4 py-1 text-right border-t border-[#F0EBF7]">
        <span className={`text-xs ${count > maxLength * 0.9 ? 'text-[#C96442]' : 'text-[#B0A3BC]'}`}>
          {count.toLocaleString('de')} / {maxLength.toLocaleString('de')}
        </span>
      </div>
    </div>
  );
}

// ─── TipFields ────────────────────────────────────────────────────────────────
function TipFields({ tips, onChange }: { tips: string[]; onChange: (t: string[]) => void }) {
  const tipRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Keep refs array in sync with tips length
  useEffect(() => {
    tipRefs.current = tipRefs.current.slice(0, tips.length);
  }, [tips.length]);

  function getTextContent(i: number) {
    return tipRefs.current[i]?.textContent ?? '';
  }
  function update(i: number) {
    const el = tipRefs.current[i];
    if (!el) return;
    const html  = el.innerHTML ?? '';
    const text  = el.textContent ?? '';
    const isEmpty = text.trim() === '';
    const next  = [...tips];
    next[i] = isEmpty ? '' : html;
    onChange(next);
  }
  function remove(i: number) {
    const next = tips.filter((_, j) => j !== i);
    onChange(next.length ? next : ['']);
    setTimeout(() => tipRefs.current[Math.max(0, i - 1)]?.focus(), 30);
  }
  function execCmd(i: number, cmd: string) {
    try { document.execCommand('styleWithCSS', false, 'false'); } catch { /* s.o. */ }
    document.execCommand(cmd, false);
    tipRefs.current[i]?.focus();
    update(i);
  }
  function handlePaste(i: number, e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (text) document.execCommand('insertText', false, text);
    update(i);
  }
  function handleKey(i: number, e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (getTextContent(i).trim() && tips.length < MAX_TIPS) {
        const next = [...tips]; next.splice(i + 1, 0, ''); onChange(next);
        setTimeout(() => tipRefs.current[i + 1]?.focus(), 40);
      }
      return;
    }
    if (e.key === 'Backspace') {
      const text = getTextContent(i);
      const html = tipRefs.current[i]?.innerHTML ?? '';
      if (!text.trim() && (html === '' || html === '<br>') && i > 0) {
        e.preventDefault();
        remove(i);
      }
    }
  }

  // Sync initial HTML into each contenteditable (only on count change to avoid cursor resets)
  useEffect(() => {
    tipRefs.current.forEach((el, i) => {
      if (!el) return;
      const target = tips[i] ?? '';
      // Only set if the content actually differs (prevent cursor-jump during typing)
      if (el.innerHTML !== target) el.innerHTML = target;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tips.length]);

  const canAdd = tips.length < MAX_TIPS && tips[tips.length - 1]?.replace(/<[^>]*>/g, '').trim() !== '';

  return (
    <div className="space-y-2">
      {tips.map((_, i) => (
        <div key={i} className="flex items-start gap-2">
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 text-white mt-3 select-none"
            style={{ background: C.aubergine }}
          >
            {i + 1}
          </span>
          {/* Mini rich-text tip field */}
          <div className="flex-1 rounded-xl border border-[#E4DCF0] focus-within:border-[#F99039] bg-white overflow-hidden transition-colors">
            {/* Toolbar */}
            <div className="flex items-center gap-0.5 px-1.5 pt-1 pb-0.5 border-b border-[#F0EBF7] bg-[#FAF7FD]">
              {([
                { cmd: 'bold',      label: 'B', cls: 'font-bold'  },
                { cmd: 'italic',    label: 'I', cls: 'italic'     },
                { cmd: 'underline', label: 'U', cls: 'underline'  },
              ] as const).map(({ cmd, label, cls }) => (
                <button key={cmd} type="button"
                  onMouseDown={e => { e.preventDefault(); execCmd(i, cmd); }}
                  className={`w-6 h-6 rounded text-xs ${cls} text-[#71587A] hover:bg-[#E4DCF0] hover:text-[#34254C] transition-colors`}
                >{label}</button>
              ))}
            </div>
            {/* Editable */}
            <div
              ref={el => { tipRefs.current[i] = el; }}
              contentEditable
              spellCheck
              suppressContentEditableWarning
              onInput={() => update(i)}
              onPaste={e => handlePaste(i, e)}
              onKeyDown={e => handleKey(i, e)}
              data-placeholder={`Tipp ${i + 1} – z.B. Am frühen Morgen besuchen`}
              className="px-3 py-2.5 text-sm text-[#34254C] outline-none leading-relaxed min-h-[40px] [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-[#A89BB5] [&:empty]:before:pointer-events-none"
            />
          </div>
          <button
            type="button" onClick={() => remove(i)}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-[#C4AED0] hover:text-[#C96442] transition-colors mt-3"
          >
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>
      ))}
      {canAdd && (
        <button
          type="button"
          onClick={() => onChange([...tips, ''])}
          className="flex items-center gap-2 text-sm text-[#71587A] hover:text-[#34254C] transition-colors pl-8"
        >
          <i className="fa-solid fa-plus text-xs" />
          <span>Tipp hinzufügen</span>
          <span className="text-xs text-[#B0A3BC]">({tips.length}/{MAX_TIPS})</span>
        </button>
      )}
      {tips.length >= MAX_TIPS && (
        <p className="text-xs text-[#B0A3BC] pl-8">Maximum von {MAX_TIPS} Tipps erreicht.</p>
      )}
      {!canAdd && tips.length < MAX_TIPS && tips.length > 0 && (
        <p className="text-xs text-[#B0A3BC] pl-8">Tipp ausfüllen → weiteres Feld öffnet sich.</p>
      )}
    </div>
  );
}

// ─── LocationSearch ───────────────────────────────────────────────────────────
function LocationSearch({
  value, lat, lng, onSelect,
}: {
  value: string; lat: number | null; lng: number | null;
  onSelect: (text: string, lat: number | null, lng: number | null) => void;
}) {
  const [query, setQuery]         = useState(value);
  const [suggestions, setSuggest] = useState<GeoLocation[]>([]);
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [locating, setLocating]   = useState(false);
  const [gpsErr, setGpsErr]       = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value); }, [value]);

  function handleInput(val: string) {
    setQuery(val);
    onSelect(val, null, null);
    if (timer.current) clearTimeout(timer.current);
    if (val.trim().length < 2) { setSuggest([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      const res = await geocodeSuggestions(val);
      setSuggest(res);
      setOpen(res.length > 0);
      setLoading(false);
    }, 400);
  }

  function pick(loc: GeoLocation) {
    setQuery(loc.fullAddress);
    setSuggest([]); setOpen(false);
    onSelect(loc.fullAddress, loc.coords.lat, loc.coords.lng);
  }

  async function gps() {
    setLocating(true); setGpsErr('');
    try {
      const coords = await requestGpsPosition();
      const loc    = await reverseGeocode(coords);
      setQuery(loc.fullAddress);
      onSelect(loc.fullAddress, coords.lat, coords.lng);
    } catch (e: unknown) {
      setGpsErr((e as Error).message ?? 'Standort nicht verfügbar.');
    }
    setLocating(false);
  }

  return (
    <div className="relative space-y-1.5">
      <div className="flex gap-2">
        {/* Search input */}
        <div className="relative flex-1">
          <i className="fa-solid fa-location-dot absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B0A3BC] pointer-events-none text-sm" />
          <input
            type="text"
            value={query}
            onChange={e => handleInput(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 180)}
            placeholder="z.B. Drachenschlucht, Eisenach oder Nähe Forggensee"
            className="w-full pl-9 pr-9 py-3 border rounded-xl text-sm outline-none border-[#E4DCF0] focus:border-[#F99039] bg-white text-[#34254C] placeholder-[#A89BB5] transition-colors"
          />
          {loading && (
            <i className="fa-solid fa-circle-notch fa-spin absolute right-3.5 top-1/2 -translate-y-1/2 text-[#B0A3BC] text-xs pointer-events-none" />
          )}
        </div>
        {/* GPS button */}
        <button
          type="button" onClick={gps} disabled={locating}
          title="Meinen Standort verwenden"
          className="flex-shrink-0 w-11 h-11 rounded-xl border-2 flex items-center justify-center transition-all"
          style={{
            borderColor: lat ? C.amber : '#E4DCF0',
            background:  lat ? '#FFF4EB' : 'white',
            color:       lat ? C.amber : '#B0A3BC',
          }}
        >
          <i className={`fa-solid text-sm ${locating ? 'fa-circle-notch fa-spin' : 'fa-location-crosshairs'}`} />
        </button>
      </div>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-12 top-full mt-1 z-50 bg-white rounded-xl border border-[#E4DCF0] shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={i} type="button"
              onMouseDown={() => pick(s)}
              className="w-full flex items-start gap-2.5 px-4 py-2.5 text-left hover:bg-[#FAF7FD] transition-colors border-b border-[#F5F0FA] last:border-0"
            >
              <i className="fa-solid fa-location-dot text-[#C4AED0] text-xs mt-1 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#34254C] truncate">{s.displayName}</p>
                <p className="text-xs text-[#9A8FAA] truncate">{s.fullAddress}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {lat && (
        <p className="text-xs text-[#B0A3BC] flex items-center gap-1.5 pl-0.5">
          <i className="fa-solid fa-check text-[10px]" style={{ color: '#2E7D32' }} />
          GPS: {lat.toFixed(5)}, {lng?.toFixed(5)}
        </p>
      )}
      {gpsErr && <p className="text-xs text-[#C96442]">{gpsErr}</p>}
    </div>
  );
}

// ─── LocationPickerMap ────────────────────────────────────────────────────────
// Interaktive Karte zum Sehen & Korrigieren des Standorts: Marker antippen/ziehen
// oder auf die Karte tippen setzt die Koordinaten. Nutzt das globale window.L.
function LocationPickerMap({ lat, lng, onPick }: {
  lat: number | null; lng: number | null;
  onPick: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const markerRef    = useRef<any>(null);
  const onPickRef    = useRef(onPick);
  onPickRef.current  = onPick;

  const PIN_HTML = `<div style="
    width:30px;height:36px;display:flex;align-items:center;justify-content:center;
    background:#F99039;color:white;font-size:14px;
    border-radius:50% 50% 50% 0;transform:rotate(-45deg);
    box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid white;cursor:grab;
  "><span style="transform:rotate(45deg);display:block"><i class="fa-solid fa-location-dot"></i></span></div>`;

  // Karte einmalig aufbauen
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    const hasCoords = lat != null && lng != null;
    const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false });
    mapRef.current = map;
    map.setView(hasCoords ? [lat, lng] : [51.1657, 10.4515], hasCoords ? 14 : 6);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com">CARTO</a> &copy; <a href="https://openstreetmap.org">OSM</a>',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);

    const icon = L.divIcon({ html: PIN_HTML, iconSize: [30, 36], iconAnchor: [15, 36], className: '' });

    function placeMarker(la: number, ln: number) {
      if (markerRef.current) {
        markerRef.current.setLatLng([la, ln]);
      } else {
        const m = L.marker([la, ln], { icon, draggable: true });
        m.on('dragend', () => { const ll = m.getLatLng(); onPickRef.current(ll.lat, ll.lng); });
        m.addTo(map);
        markerRef.current = m;
      }
    }
    if (hasCoords) placeMarker(lat, lng);

    map.on('click', (e: any) => {
      placeMarker(e.latlng.lat, e.latlng.lng);
      onPickRef.current(e.latlng.lat, e.latlng.lng);
    });

    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Externe Änderungen (Suche / GPS / manuelle Eingabe) auf die Karte spiegeln
  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    if (!map || !L || lat == null || lng == null) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const icon = L.divIcon({ html: PIN_HTML, iconSize: [30, 36], iconAnchor: [15, 36], className: '' });
      const m = L.marker([lat, lng], { icon, draggable: true });
      m.on('dragend', () => { const ll = m.getLatLng(); onPickRef.current(ll.lat, ll.lng); });
      m.addTo(map);
      markerRef.current = m;
    }
    map.setView([lat, lng], Math.max(map.getZoom(), 14));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return (
    <div className="rounded-2xl overflow-hidden border-2 border-[#E4DCF0]">
      <div ref={containerRef} className="w-full" style={{ height: 260 }} />
      <div className="flex items-center gap-2 px-3 py-2 bg-[#FAF7FD] text-[11px] text-[#9A8FAA]">
        <i className="fa-solid fa-hand-pointer" />
        Tippe auf die Karte oder ziehe den Marker, um den Standort genau zu setzen.
      </div>
    </div>
  );
}

// ─── StarPicker ───────────────────────────────────────────────────────────────
function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n} type="button"
          onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="text-2xl transition-transform hover:scale-110"
          style={{ color: n <= (hover || value) ? C.amber : '#d1c9da' }}
        >★</button>
      ))}
    </div>
  );
}

// ─── QuestionField ────────────────────────────────────────────────────────────
function QuestionField({ q, value, onChange }: {
  q: SubmitQuestion; value: unknown; onChange: (v: unknown) => void;
}) {
  const base = 'w-full border rounded-xl px-4 py-3 text-sm outline-none transition-colors border-[#E4DCF0] focus:border-[#F99039] bg-white text-[#34254C] placeholder-[#A89BB5]';

  if (q.type === 'textarea') {
    // Rich text for textarea questions (bold / italic / underline)
    return (
      <MiniRichText
        value={(value as string) ?? ''}
        onChange={onChange}
        maxLength={1200}
        minHeight={120}
        placeholder={q.placeholder ?? ''}
      />
    );
  }
  if (q.type === 'text') {
    return (
      <input type="text" placeholder={q.placeholder ?? ''}
        value={(value as string) ?? ''}
        onChange={e => onChange(e.target.value)}
        spellCheck maxLength={400}
        className={base}
      />
    );
  }
  if (q.type === 'select') {
    return (
      <select value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} className={base}>
        <option value="">— bitte wählen —</option>
        {(q.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (q.type === 'stars') {
    const v = (value as number) ?? 0;
    return (
      <div>
        <StarPicker value={v} onChange={onChange} />
        {q.starLabels && (
          <div className="flex justify-between mt-1 text-xs text-[#9A8FAA]">
            <span>{q.starLabels[0]}</span><span>{q.starLabels[1]}</span>
          </div>
        )}
      </div>
    );
  }
  if (q.type === 'slider') {
    const raw = value as number | undefined;
    const v   = raw ?? 3;  // visual default; label only shown when explicitly set
    const levelLabels = ['', 'Sehr bekannt', 'Eher bekannt', 'Halbwegs geheim', 'Ziemlich geheim', 'Echter Geheimtipp'];
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          {q.starLabels && (
            <span className="text-[11px] text-[#9A8FAA] flex-shrink-0 w-24 leading-tight">{q.starLabels[0]}</span>
          )}
          <input
            type="range" min="1" max="5" step="1" value={v}
            onChange={e => onChange(Number(e.target.value))}
            className="flex-1 accent-[#F99039] cursor-pointer h-2"
          />
          {q.starLabels && (
            <span className="text-[11px] text-[#9A8FAA] flex-shrink-0 w-24 text-right leading-tight">{q.starLabels[1]}</span>
          )}
        </div>
        <div className="flex justify-between px-[96px]">
          {[1,2,3,4,5].map(n => (
            <span key={n} className="text-[11px] font-bold transition-colors" style={{ color: n === v ? C.amber : '#D8CEEA' }}>
              {n}
            </span>
          ))}
        </div>
        {raw !== undefined ? (
          <p className="text-center text-sm font-semibold" style={{ color: C.amber }}>
            {v}/5 – {levelLabels[v]}
          </p>
        ) : (
          <p className="text-center text-xs text-[#C4AED0]">Schieber bewegen zum Auswählen</p>
        )}
      </div>
    );
  }
  if (q.type === 'yesno') {
    const v = value as string | undefined;
    return (
      <div className="flex gap-3">
        {(['yes', 'no'] as const).map(opt => (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all"
            style={{
              borderColor: v === opt ? C.amber : '#E4DCF0',
              background:  v === opt ? '#FFF4EB' : 'white',
              color:       v === opt ? C.aubergine : '#9A8FAA',
            }}
          >
            {opt === 'yes' ? '✓  Ja' : '✗  Nein'}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === 'multicheck') {
    const selected = (value as string[]) ?? [];
    return (
      <div className="flex flex-wrap gap-2">
        {(q.options ?? []).map(opt => {
          const on = selected.includes(opt);
          return (
            <button key={opt} type="button"
              onClick={() => onChange(on ? selected.filter(s => s !== opt) : [...selected, opt])}
              className="px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all"
              style={{
                background:  on ? C.aubergine : 'white',
                color:       on ? 'white' : C.lavender,
                borderColor: on ? C.aubergine : '#D8CEEA',
              }}
            >
              {on && '✓ '}{opt}
            </button>
          );
        })}
      </div>
    );
  }
  if (q.type === 'weekhours') {
    const v = (value as Record<string, string>) ?? {};
    const DAYS: [string, string][] = [
      ['mo', 'Montag'], ['di', 'Dienstag'], ['mi', 'Mittwoch'], ['do', 'Donnerstag'],
      ['fr', 'Freitag'], ['sa', 'Samstag'], ['so', 'Sonntag'],
    ];
    return (
      <div className="space-y-1.5">
        {DAYS.map(([key, label]) => (
          <div key={key} className="flex items-center gap-3">
            <span className="w-24 flex-shrink-0 text-xs font-semibold text-[#9A8FAA]">{label}</span>
            <input
              type="text"
              value={v[key] ?? ''}
              placeholder="z.B. 10:00–17:00 oder geschlossen"
              onChange={e => onChange({ ...v, [key]: e.target.value })}
              className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none border-[#E4DCF0] focus:border-[#F99039] bg-white text-[#34254C] placeholder-[#C9BCD6] transition-colors"
            />
          </div>
        ))}
      </div>
    );
  }
  if (q.type === 'pricefields') {
    const v = (value as Record<string, string>) ?? {};
    const FIELDS: [string, string][] = [
      ['adult', 'Erwachsene'], ['child', 'Kinder'], ['reduced', 'Ermäßigte'], ['senior', 'Senioren'],
    ];
    return (
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(([key, label]) => (
          <div key={key} className="space-y-1">
            <label className="block text-xs font-semibold text-[#9A8FAA]">{label}</label>
            <input
              type="text"
              value={v[key] ?? ''}
              placeholder="z.B. 5 €"
              onChange={e => onChange({ ...v, [key]: e.target.value })}
              className="w-full border rounded-xl px-3 py-2 text-sm outline-none border-[#E4DCF0] focus:border-[#F99039] bg-white text-[#34254C] placeholder-[#C9BCD6] transition-colors"
            />
          </div>
        ))}
      </div>
    );
  }
  return null;
}

// ─── MediaCard ────────────────────────────────────────────────────────────────
function MediaCard({
  item, isHero, onSetHero, onUpdate, onRemove,
}: {
  item: MediaItem; isHero: boolean;
  onSetHero: () => void;
  onUpdate: (patch: Partial<MediaItem>) => void;
  onRemove: () => void;
}) {
  const displayUrl = item.serverUrl ?? item.localUrl;
  const pos = `${item.cropX * 100}% ${item.cropY * 100}%`;

  function imgContent(extraClass = '') {
    if (item.type !== 'image') return null;
    if (item.uploading) return (
      <div className="w-full h-full flex items-center justify-center">
        <i className="fa-solid fa-circle-notch fa-spin text-[#71587A]" />
      </div>
    );
    if (item.error) return (
      <div className="w-full h-full flex items-center justify-center">
        <i className="fa-solid fa-triangle-exclamation text-[#C96442]" />
      </div>
    );
    return (
      <img
        src={displayUrl} alt=""
        className={`w-full h-full object-cover transition-[object-position] duration-150 ${extraClass}`}
        style={{ objectPosition: pos }}
        onLoad={e => onUpdate({ isLandscape: e.currentTarget.naturalWidth > e.currentTarget.naturalHeight })}
      />
    );
  }

  return (
    <div className="rounded-2xl border bg-white overflow-hidden transition-all"
      style={{ borderColor: isHero ? C.amber : '#E4DCF0', boxShadow: isHero ? `0 0 0 2px ${C.amber}22` : 'none' }}>
      <div className="flex gap-3 p-4">

        {/* ── Dual preview (image only) ─────────────────────── */}
        {item.type === 'image' ? (
          <div className="flex-shrink-0 flex gap-2">

            {/* Portrait 2:3 — crop horizontal */}
            <div className="flex flex-col items-center gap-1">
              <p className="text-[8px] font-bold text-[#C4AED0] uppercase tracking-wider">Hochformat</p>
              <div className="w-[54px] rounded-xl overflow-hidden bg-[#F0EBF7]" style={{ aspectRatio: '2/3' }}>
                {imgContent()}
              </div>
              {!item.uploading && !item.error && (
                <>
                  <input
                    type="range" min="0" max="100"
                    value={Math.round(item.cropX * 100)}
                    onChange={e => onUpdate({ cropX: Number(e.target.value) / 100 })}
                    className="w-[54px] cursor-pointer accent-[#F99039] h-1.5"
                    title="Links / Rechts"
                  />
                  <p className="text-[8px] text-[#C4AED0]">← →</p>
                </>
              )}
            </div>

            {/* Landscape 16:9 — crop vertical */}
            <div className="flex flex-col items-center gap-1">
              <p className="text-[8px] font-bold text-[#C4AED0] uppercase tracking-wider">Querformat</p>
              <div className="rounded-xl overflow-hidden bg-[#F0EBF7]" style={{ width: '80px', aspectRatio: '16/9' }}>
                {imgContent()}
              </div>
              {!item.uploading && !item.error && (
                <>
                  <input
                    type="range" min="0" max="100"
                    value={Math.round(item.cropY * 100)}
                    onChange={e => onUpdate({ cropY: Number(e.target.value) / 100 })}
                    className="w-[54px] cursor-pointer accent-[#F99039] h-1.5"
                    title="Oben / Unten"
                  />
                  <p className="text-[8px] text-[#C4AED0]">↑ ↓</p>
                </>
              )}
            </div>
          </div>
        ) : (
          /* Video — single preview */
          <div className="flex-shrink-0 w-20 rounded-xl overflow-hidden bg-[#1a1a2e] flex items-center justify-center"
            style={{ aspectRatio: '2/3' }}>
            {item.uploading
              ? <i className="fa-solid fa-circle-notch fa-spin text-white" />
              : <i className="fa-solid fa-film text-white text-xl" />}
          </div>
        )}

        {/* ── Info + caption ────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1.5">
              {/* Hero radio button */}
              {item.type === 'image' && !item.error && (
                <label className="flex items-center gap-2 cursor-pointer group select-none">
                  <div
                    onClick={onSetHero}
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                    style={{ borderColor: isHero ? C.amber : '#D8CEEA', background: isHero ? C.amber : 'white' }}
                  >
                    {isHero && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-xs font-semibold transition-colors"
                    style={{ color: isHero ? C.amber : '#9A8FAA' }}>
                    {isHero ? '★ Titelbild' : 'Als Titelbild'}
                  </span>
                </label>
              )}
              {/* Video mute toggle */}
              {item.type === 'video' && !item.uploading && !item.error && (
                <button type="button"
                  onClick={() => onUpdate({ muted: !(item.muted ?? true) })}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all w-fit"
                  style={{
                    background: (item.muted ?? true) ? '#F0EBF7' : '#FFF4EB',
                    color:      (item.muted ?? true) ? C.lavender : C.amber,
                  }}
                >
                  <i className={`fa-solid ${(item.muted ?? true) ? 'fa-volume-xmark' : 'fa-volume-high'} text-[11px]`} />
                  {(item.muted ?? true) ? 'Ton aus' : 'Ton an'}
                </button>
              )}
              {item.uploading && (
                <span className="text-xs text-[#9A8FAA] flex items-center gap-1">
                  <i className="fa-solid fa-circle-notch fa-spin text-[10px]" /> Hochladen…
                </span>
              )}
              {item.error && (
                <span className="text-xs text-[#C96442]">
                  <i className="fa-solid fa-triangle-exclamation mr-1" />{item.error}
                </span>
              )}
              {item.serverUrl && !item.uploading && (
                <span className="text-xs flex items-center gap-1" style={{ color: '#2E7D32' }}>
                  <i className="fa-solid fa-check text-[10px]" /> Hochgeladen
                </span>
              )}
            </div>
            <button type="button" onClick={onRemove}
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[#C4AED0] hover:bg-[#FEF2F2] hover:text-[#C96442] transition-colors">
              <i className="fa-solid fa-trash-can text-xs" />
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9A8FAA] mb-1">
              Bildunterschrift
            </label>
            <input type="text" value={item.caption}
              onChange={e => onUpdate({ caption: e.target.value })}
              placeholder="Was zeigt dieses Foto?"
              maxLength={150}
              className="w-full border rounded-lg px-3 py-2 text-xs outline-none border-[#E4DCF0] focus:border-[#F99039] bg-white text-[#34254C] placeholder-[#A89BB5] transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ImageUploader ────────────────────────────────────────────────────────────
function ImageUploader({
  items, heroIndex = 0, maxItems = MAX_MEDIA, onAddFiles, onItemChange, onRemove, onSetHero,
}: {
  items: MediaItem[]; heroIndex?: number; maxItems?: number;
  onAddFiles: (files: File[]) => void;
  onItemChange: (id: string, patch: Partial<MediaItem>) => void;
  onRemove: (id: string) => void;
  onSetHero: (index: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    onAddFiles(files);
    e.target.value = '';
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDrag(false);
    onAddFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div className="space-y-3">
      {items.length < maxItems && (
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all ${
            drag ? 'border-[#F99039] bg-[#FFF4EB]' : 'border-[#C4AED0] hover:border-[#F99039] hover:bg-[#FFFBF7]'
          }`}
        >
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-12 h-12 rounded-2xl bg-[#F0EBF7] flex items-center justify-center">
              <i className="fa-solid fa-cloud-arrow-up text-xl text-[#71587A]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#34254C]">Fotos & Videos hochladen</p>
              <p className="text-xs text-[#9A8FAA] mt-0.5">
                Klicken oder Dateien hierher ziehen · bis zu {maxItems} Dateien · max. 30 MB (Bilder) / 80 MB (Videos)
              </p>
            </div>
            <p className="text-xs text-[#B0A3BC]">
              JPG, PNG, WebP, GIF, HEIC · MP4, WebM, MOV
            </p>
          </div>
          <input
            ref={fileRef} type="file" multiple className="hidden"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif,video/mp4,video/webm,video/quicktime"
            onChange={handleInput}
          />
        </div>
      )}

      {items.map((item, idx) => (
        <MediaCard
          key={item.id}
          item={item}
          isHero={idx === heroIndex}
          onSetHero={() => onSetHero(idx)}
          onUpdate={patch => onItemChange(item.id, patch)}
          onRemove={() => onRemove(item.id)}
        />
      ))}

      {items.length >= maxItems && (
        <p className="text-xs text-center text-[#B0A3BC] py-2">
          Maximum von {maxItems} Dateien erreicht.
        </p>
      )}
    </div>
  );
}

// ─── Step sub-components ──────────────────────────────────────────────────────

function Step1({ state, set }: { state: WizardState; set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void }) {
  return (
    <div className="space-y-7">
      <div>
        <StepHeading>Wie heißt dein Geheimtripp?</StepHeading>
        <StepSub>Der Name erscheint als Titel – ruhig etwas Einladendes wählen.</StepSub>
      </div>
      <div className="space-y-5">
        <InputField
          label="Name des Ortes" required
          placeholder="z.B. Stausee am Ende der Welt"
          value={state.name} maxLength={100}
          onChange={v => set('name', v)}
        />
      </div>
    </div>
  );
}

function Step2({ state, setLocation }: {
  state: WizardState;
  setLocation: (text: string, lat: number | null, lng: number | null) => void;
}) {
  const hasCoords = state.lat !== null && state.lng !== null;

  // Auf der Karte gewählter Punkt: Koordinaten sofort setzen, Adresstext per
  // Reverse-Geocoding nachladen (Koordinaten allein reichen aber schon aus).
  async function pickOnMap(la: number, ln: number) {
    setLocation(state.locationText, la, ln);
    try {
      const loc = await reverseGeocode({ lat: la, lng: ln });
      setLocation(loc.fullAddress, la, ln);
    } catch { /* Standort ohne Adresse ist okay */ }
  }

  return (
    <div className="space-y-7">
      <div>
        <StepHeading>Wo liegt dein Geheimtripp?</StepHeading>
        <StepSub>
          Tippe einen Ort oder eine Adresse ein und wähle einen Vorschlag aus der Liste,
          nutze den GPS-Knopf – oder setze den Punkt direkt auf der Karte. Koordinaten sind
          Pflicht, damit der Ort korrekt erscheint.
        </StepSub>
      </div>
      <LocationSearch
        value={state.locationText}
        lat={state.lat} lng={state.lng}
        onSelect={setLocation}
      />

      {/* Interaktive Karte zum Sehen & Korrigieren des Standorts */}
      <LocationPickerMap lat={state.lat} lng={state.lng} onPick={pickOnMap} />

      {/* Validation status */}
      {hasCoords ? (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium"
          style={{ background: '#F0FBF4', color: '#2D8A4E' }}>
          <i className="fa-solid fa-circle-check" />
          Standort gesetzt: {state.lat!.toFixed(5)}, {state.lng!.toFixed(5)}
        </div>
      ) : state.locationText.trim() ? (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: '#FFF8EC', color: '#C96442' }}>
          <i className="fa-solid fa-triangle-exclamation mt-0.5 flex-shrink-0" />
          <span>
            Bitte wähle einen <strong>Vorschlag aus der Liste</strong> oder gib
            die Koordinaten unten manuell ein – reiner Text reicht nicht.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: '#F5F2FA', color: '#9A8FAA' }}>
          <i className="fa-solid fa-location-dot" />
          Noch kein Standort ausgewählt.
        </div>
      )}

      {/* Manual coordinate fallback */}
      <details className="text-sm">
        <summary className="cursor-pointer text-[#B0A3BC] hover:text-[#71587A] transition-colors select-none">
          Koordinaten manuell eingeben
        </summary>
        <p className="text-xs text-[#B0A3BC] mt-1 mb-3">
          Falls du Koordinaten kennst (z.&thinsp;B. von Google Maps), kannst du sie direkt eintragen.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[#9A8FAA]">Breitengrad (lat)</label>
            <input type="number" step="any" placeholder="47.5581"
              value={state.lat ?? ''}
              onChange={e => setLocation(state.locationText, e.target.value === '' ? null : Number(e.target.value), state.lng)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none border-[#E4DCF0] focus:border-[#F99039] bg-white text-[#34254C] placeholder-[#B0A3BC]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[#9A8FAA]">Längengrad (lng)</label>
            <input type="number" step="any" placeholder="10.7493"
              value={state.lng ?? ''}
              onChange={e => setLocation(state.locationText, state.lat, e.target.value === '' ? null : Number(e.target.value))}
              className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none border-[#E4DCF0] focus:border-[#F99039] bg-white text-[#34254C] placeholder-[#B0A3BC]"
            />
          </div>
        </div>
      </details>
    </div>
  );
}

function StepCategory({ state, setState }: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  function selectL1(l1: TaxonomyL1) {
    if (state.l1?.slug === l1.slug) return;
    setState(prev => ({ ...prev, l1, l2: null, l3: null, l4Features: [], answers: {} }));
  }
  function selectL2(l2: TaxonomyL2) {
    if (state.l2?.slug === l2.slug) return;
    setState(prev => ({ ...prev, l2, l3: null, l4Features: [], answers: {} }));
  }
  function selectL3(l3: TaxonomyL3) {
    if (state.l3?.slug === l3.slug) return;
    // ✅ BUG FIX: clear answers when L3 changes (different questions!)
    setState(prev => ({ ...prev, l3, l4Features: [], answers: {} }));
  }
  function toggleL4(key: string) {
    setState(prev => ({
      ...prev,
      l4Features: prev.l4Features.includes(key)
        ? prev.l4Features.filter(k => k !== key)
        : [...prev.l4Features, key],
    }));
  }

  return (
    <div className="space-y-7">
      <div>
        <StepHeading>Was ist das für ein Ort?</StepHeading>
        <StepSub>Wähle eine Kategorie – das hilft anderen Entdeckern, den Ort zu finden.</StepSub>
      </div>

      {/* L1 cards */}
      <div>
        <SectionLabel>Hauptkategorie</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {TAXONOMY.map(l1 => (
            <button key={l1.slug} type="button" onClick={() => selectL1(l1)}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all"
              style={{
                borderColor: state.l1?.slug === l1.slug ? l1.color : '#E4DCF0',
                background:  state.l1?.slug === l1.slug ? l1.bg : 'white',
              }}
            >
              <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm"
                style={{ background: l1.color }}>
                <i className={`fa-solid ${l1.icon}`} />
              </span>
              <span className="text-xs font-semibold leading-tight" style={{ color: l1.color }}>
                {l1.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* L2 list */}
      {state.l1 && (
        <div>
          <SectionLabel>Unterkategorie</SectionLabel>
          <div className="space-y-1.5">
            {state.l1.children.map(l2 => (
              <button key={l2.slug} type="button" onClick={() => selectL2(l2)}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 text-left transition-all"
                style={{
                  borderColor: state.l2?.slug === l2.slug ? state.l1!.color : '#E4DCF0',
                  background:  state.l2?.slug === l2.slug ? state.l1!.bg : 'white',
                  color:       state.l2?.slug === l2.slug ? state.l1!.color : C.lavender,
                }}
              >
                <i className={`fa-solid ${l2.icon} text-sm w-4 text-center flex-shrink-0`} />
                <span className="text-sm font-medium">{l2.label}</span>
                {state.l2?.slug === l2.slug && <i className="fa-solid fa-check ml-auto text-xs" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* L3 list */}
      {state.l2 && (
        <div>
          <SectionLabel>Typ</SectionLabel>
          <div className="space-y-1.5">
            {state.l2.children.map(l3 => (
              <button key={l3.slug} type="button" onClick={() => selectL3(l3)}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 text-left transition-all"
                style={{
                  borderColor: state.l3?.slug === l3.slug ? state.l1!.color : '#E4DCF0',
                  background:  state.l3?.slug === l3.slug ? state.l1!.bg : 'white',
                  color:       state.l3?.slug === l3.slug ? state.l1!.color : C.lavender,
                }}
              >
                <span className="text-sm font-medium">{l3.label}</span>
                {state.l3?.slug === l3.slug && <i className="fa-solid fa-check ml-auto text-xs" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* L4 feature chips */}
      {state.l3 && state.l3.features.length > 0 && (
        <div>
          <SectionLabel>Merkmale</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {state.l3.features.map(f => {
              const on = state.l4Features.includes(f.key);
              return (
                <button key={f.key} type="button" onClick={() => toggleL4(f.key)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all"
                  style={{
                    borderColor: on ? state.l1!.color : '#D8CEEA',
                    background:  on ? state.l1!.bg : 'white',
                    color:       on ? state.l1!.color : C.lavender,
                  }}
                >
                  {on && '✓ '}{f.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StepDetails({
  state, set,
}: {
  state: WizardState;
  set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
}) {
  if (!state.l3) {
    return (
      <div className="py-16 text-center">
        <i className="fa-solid fa-arrow-left text-3xl mb-4" style={{ color: '#D8CEEA' }} />
        <p className="text-sm" style={{ color: '#9A8FAA' }}>
          Bitte wähle zuerst eine Kategorie im vorherigen Schritt.
        </p>
      </div>
    );
  }

  // Trivia + „Besonderheit" werden bereits auf der Beschreibungs-Seite abgefragt → hier ausblenden.
  const HIDDEN         = new Set(['trivia_type', 'trivia_text', 'highlight']);
  const l3Questions    = state.l3.questions.filter(q => !HIDDEN.has(q.id));
  // Universal-Fragen, deren id nicht schon bei den L3-Fragen vorkommt (kein Doppel)
  const l3Ids          = new Set(state.l3.questions.map(q => q.id));
  const universalQs    = UNIVERSAL_QUESTIONS.filter(q => !l3Ids.has(q.id) && !HIDDEN.has(q.id));

  function setAnswer(id: string, v: unknown) {
    set('answers', { ...state.answers, [id]: v });
  }

  return (
    <div className="space-y-7">
      <div>
        <StepHeading>Erzähl uns mehr</StepHeading>
        <StepSub>
          Diese Fragen sind auf{' '}
          <span className="font-semibold" style={{ color: state.l1?.color ?? C.aubergine }}>
            {state.l3.label}
          </span>{' '}
          zugeschnitten. Je mehr du beantwortest, desto wertvoller der Eintrag.
        </StepSub>
      </div>

      {/* L3-specific questions */}
      {l3Questions.map(q => (
        <div key={q.id} className="space-y-2">
          <label className="block text-sm font-semibold" style={{ color: C.aubergine }}>
            {q.label}{q.required && <span className="ml-1 text-[#C96442]">*</span>}
          </label>
          {q.hint && <p className="text-xs text-[#9A8FAA]">{q.hint}</p>}
          <QuestionField q={q} value={state.answers[q.id]} onChange={v => setAnswer(q.id, v)} />
        </div>
      ))}

      {/* Divider before universal questions */}
      <div className="flex items-center gap-3 pt-2">
        <div className="flex-1 h-px bg-[#E4DCF0]" />
        <span className="text-xs font-bold uppercase tracking-widest text-[#B0A3BC] px-2 flex-shrink-0">
          Allgemeine Informationen
        </span>
        <div className="flex-1 h-px bg-[#E4DCF0]" />
      </div>

      {/* Universal questions */}
      {universalQs.map(q => {
        if (q.showIf && !q.showIf(state.answers)) return null;
        return (
          <div key={q.id} className="space-y-2">
            <label className="block text-sm font-semibold" style={{ color: C.aubergine }}>
              {q.label}{q.required && <span className="ml-1 text-[#C96442]">*</span>}
            </label>
            {q.hint && <p className="text-xs text-[#9A8FAA]">{q.hint}</p>}
            <QuestionField q={q} value={state.answers[q.id]} onChange={v => setAnswer(q.id, v)} />
          </div>
        );
      })}
    </div>
  );
}

function FieldTip({ example }: { example: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex-shrink-0">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border-2 transition-colors"
        style={{ borderColor: open ? C.amber : '#E4DCF0', background: open ? '#FFF4EB' : 'white', color: C.amber }}>
        <i className="fa-solid fa-lightbulb text-[10px]" /> Tipp
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 z-30 bg-white border border-[#E4DCF0] rounded-xl shadow-lg p-3 text-xs leading-relaxed text-[#71587A]">
          <button type="button" onClick={() => setOpen(false)}
            className="absolute top-1.5 right-2 text-[#C4AED0] hover:text-[#71587A]"><i className="fa-solid fa-xmark text-[10px]" /></button>
          {example}
        </div>
      )}
    </div>
  );
}

// ─── KI-Knopf (Gemini) ──────────────────────────────────────────────────────────
function AiButton({ onClick, loading, disabled, label }: {
  onClick: () => void; loading: boolean; disabled?: boolean; label: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={loading || disabled}
      className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-opacity disabled:opacity-40"
      style={{ background: 'linear-gradient(135deg, #7C3AED, #C026D3)', color: 'white' }}>
      <i className={`fa-solid ${loading ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles'} text-[11px]`} />
      {loading ? 'Gemini denkt…' : label}
    </button>
  );
}

function StepStory({
  state, set,
}: {
  state: WizardState;
  set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
}) {
  const longLen = state.long.replace(/<[^>]*>/g, '').trim().length;
  const longOk  = longLen >= 200;
  const setAnswer    = (id: string, v: unknown) => set('answers', { ...state.answers, [id]: v });
  const triviaTypeQ  = UNIVERSAL_QUESTIONS.find(q => q.id === 'trivia_type');
  const triviaTextQ  = UNIVERSAL_QUESTIONS.find(q => q.id === 'trivia_text');
  const triviaTypeVal = state.answers['trivia_type'];
  const triviaActive  = typeof triviaTypeVal === 'string' && triviaTypeVal !== '';

  // ── KI-Unterstützung (Gemini) ────────────────────────────────────────────
  const [aiOn, setAiOn]           = useState(false);
  const [sumLoading, setSumLoad]  = useState(false);
  const [sumErr, setSumErr]       = useState('');
  const [tipsLoading, setTipsLoad]= useState(false);
  const [tipsErr, setTipsErr]     = useState('');
  useEffect(() => { aiApi.status().then(s => setAiOn(s.configured)).catch(() => {}); }, []);

  const aiCtx = () => ({
    name:      state.name,
    long:      state.long,
    highlight: typeof state.answers['highlight'] === 'string' ? (state.answers['highlight'] as string) : '',
    category:  state.l3?.label ?? state.l2?.label ?? state.l1?.label ?? '',
    location:  state.locationText,
  });

  async function genSummary() {
    setSumErr(''); setSumLoad(true);
    try { const { summary } = await aiApi.placeSummary(aiCtx()); set('short', summary); }
    catch (e) { setSumErr((e as Error).message || 'Zusammenfassung fehlgeschlagen.'); }
    setSumLoad(false);
  }
  async function genTips() {
    setTipsErr(''); setTipsLoad(true);
    try {
      const { tips } = await aiApi.placeTips(aiCtx());
      const existing = state.tips.filter(t => t.replace(/<[^>]*>/g, '').trim());
      const merged   = [...existing, ...tips].slice(0, MAX_TIPS);
      set('tips', merged.length ? merged : ['']);
    } catch (e) { setTipsErr((e as Error).message || 'Tipps-Vorschlag fehlgeschlagen.'); }
    setTipsLoad(false);
  }

  return (
    <div className="space-y-7">
      <div>
        <StepHeading>Beschreib deinen Geheimtripp</StepHeading>
        <StepSub>
          Starte mit dem Besonderen in zwei Sätzen, dann erzähl die ganze Geschichte.
          Trivia und Tipps kannst du darunter ergänzen{aiOn ? ' – oder dir von Gemini helfen lassen ✨' : ''}.
        </StepSub>
      </div>

      {/* 1) Besonderheit — kurz, erscheint auf der Swipe-Karte */}
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <label className="block text-sm font-semibold" style={{ color: C.aubergine }}>
            In zwei Sätzen: Was ist das Besondere an diesem Ort?
          </label>
          <FieldTip example={'z.B. „Das größte Freilichtmuseum Deutschlands." oder „Das perfekte Café für eine Pause beim Bummel durch Bonn."'} />
        </div>
        <p className="text-xs text-[#9A8FAA]">
          Dieser Satz erscheint auf der Swipe-Karte im Entdecken-Modus. Schreib ihn selbst –
          oder lass ihn dir aus deiner Beschreibung erzeugen.
        </p>
        <textarea
          rows={3} spellCheck maxLength={350}
          placeholder="Ein versteckter Felssee hoch über dem Tal – kaum bekannt, aber absolut magisch."
          value={state.short}
          onChange={e => set('short', e.target.value)}
          className="w-full border rounded-xl px-4 py-3 text-sm outline-none transition-colors border-[#E4DCF0] focus:border-[#F99039] bg-white text-[#34254C] placeholder-[#A89BB5] resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs" style={{ color: state.short.length > 300 ? '#C96442' : '#A89BB5' }}>
            {state.short.length} / 350
          </span>
          {aiOn && (
            <AiButton onClick={genSummary} loading={sumLoading} disabled={longLen < 30}
              label="Aus Beschreibung erzeugen" />
          )}
        </div>
        {aiOn && longLen < 30 && (
          <p className="text-[11px] text-[#B0A3BC]">Schreib zuerst unten die Beschreibung – dann fasst Gemini sie hier zusammen.</p>
        )}
        {sumErr && <p className="text-xs text-[#C96442]">{sumErr}</p>}
      </div>

      {/* 2) Ausführliche Beschreibung — Pflicht, mind. 200 Zeichen */}
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <label className="block text-sm font-semibold" style={{ color: C.aubergine }}>
            Ausführliche Beschreibung <span className="text-[#C96442]">*</span>
          </label>
          <FieldTip example={'z.B. „Versteckt hinter der alten Mühle führt ein schmaler Pfad zu einem Wasserfall, den kaum jemand kennt. Am schönsten früh morgens, wenn das Licht durch die Bäume fällt …"'} />
        </div>
        <p className="text-xs text-[#9A8FAA]">
          Atmosphäre, was dich überrascht hat, was andere übersehen. Nutze{' '}
          <strong>Fett</strong>, <em>Kursiv</em> oder <u>Unterstrichen</u> für Betonung.
        </p>
        <MiniRichText
          value={state.long}
          onChange={v => set('long', v)}
          maxLength={4000}
          placeholder="Ich war spät nachmittags dort, als die Sonne schon tief stand und das Wasser in einem unwirklichen Blaugrün leuchtete…"
        />
        <p className="text-xs flex items-center gap-1.5" style={{ color: longOk ? '#2D8A4E' : '#C96442' }}>
          <i className={`fa-solid ${longOk ? 'fa-circle-check' : 'fa-circle-info'} text-[10px]`} />
          {longOk
            ? 'Super – das reicht für eine schöne Beschreibung!'
            : `Noch mind. ${200 - longLen} Zeichen (aktuell ${longLen} / 200).`}
        </p>
      </div>

      {/* 3) Trivia — optional */}
      {triviaTypeQ && (
        <div className="space-y-2">
          <label className="block text-sm font-semibold" style={{ color: C.aubergine }}>
            {triviaTypeQ.label}
          </label>
          {triviaTypeQ.hint && <p className="text-xs text-[#9A8FAA]">{triviaTypeQ.hint}</p>}
          <QuestionField q={triviaTypeQ} value={triviaTypeVal} onChange={v => setAnswer('trivia_type', v)} />
          {triviaTextQ && triviaActive && (
            <div className="space-y-2 pt-1">
              <label className="block text-sm font-semibold" style={{ color: C.aubergine }}>
                {triviaTextQ.label}
              </label>
              {triviaTextQ.hint && <p className="text-xs text-[#9A8FAA]">{triviaTextQ.hint}</p>}
              <QuestionField q={triviaTextQ} value={state.answers['trivia_text']} onChange={v => setAnswer('trivia_text', v)} />
            </div>
          )}
        </div>
      )}

      {/* 4) Tipps */}
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <label className="block text-sm font-semibold" style={{ color: C.aubergine }}>
            Praktische Tipps
          </label>
          {aiOn && (
            <AiButton onClick={genTips} loading={tipsLoading} disabled={longLen < 30}
              label="Passende Tipps vorschlagen" />
          )}
        </div>
        <p className="text-xs text-[#9A8FAA]">
          Jeder Tipp bekommt ein eigenes Feld. Drücke <kbd className="px-1 py-0.5 rounded bg-[#F0EBF7] text-[#71587A] text-[10px] font-mono">Enter</kbd> für den nächsten.
          Max. {MAX_TIPS} Tipps.{aiOn ? ' Gemini schlägt passende Tipps zum Ort vor – du kannst sie danach anpassen.' : ''}
        </p>
        {tipsErr && <p className="text-xs text-[#C96442]">{tipsErr}</p>}
        <TipFields tips={state.tips} onChange={v => set('tips', v)} />
      </div>
    </div>
  );
}

function StepMedia({
  state, isEdit, onAddFiles, onItemChange, onRemove, onSetHero, onSubmit, submitting,
}: {
  state: WizardState;
  isEdit: boolean;
  onAddFiles: (files: File[]) => void;
  onItemChange: (id: string, patch: Partial<MediaItem>) => void;
  onRemove: (id: string) => void;
  onSetHero: (index: number) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const pendingUploads = state.media.filter(m => m.uploading).length;

  return (
    <div className="space-y-7">
      <div>
        <StepHeading>Fotos & Fertigstellen</StepHeading>
        <StepSub>
          Lade Fotos oder Videos hoch. Wähle mit dem Radio-Button, welches Bild als Titelbild erscheint.
          Du kannst den Bildausschnitt für Hochformat-Darstellung anpassen.
        </StepSub>
      </div>

      <ImageUploader
        items={state.media}
        heroIndex={state.heroIndex}
        onAddFiles={onAddFiles}
        onItemChange={onItemChange}
        onRemove={onRemove}
        onSetHero={onSetHero}
      />

      {/* Summary */}
      <div className="rounded-2xl border border-[#E4DCF0] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F0EBF7]">
          <p className="text-xs font-bold uppercase tracking-widest mb-1 text-[#B0A3BC]">Zusammenfassung</p>
          <h3 className="font-bold text-lg" style={{ color: C.aubergine }}>{state.name || '—'}</h3>
          <p className="text-sm mt-0.5" style={{ color: C.lavender }}>{state.short || '—'}</p>
        </div>
        <div className="divide-y divide-[#F0EBF7]">
          <SummaryRow icon="fa-location-dot" label="Ort">
            {state.locationText || (state.lat ? `${state.lat.toFixed(4)}, ${state.lng?.toFixed(4)}` : '—')}
          </SummaryRow>
          <SummaryRow icon="fa-tag" label="Kategorie">
            {state.l3
              ? `${state.l1?.label} › ${state.l2?.label} › ${state.l3.label}`
              : state.l1 ? `${state.l1.label} › …` : '—'}
          </SummaryRow>
          {state.l4Features.length > 0 && (
            <SummaryRow icon="fa-tags" label="Merkmale">{state.l4Features.join(', ')}</SummaryRow>
          )}
          {Object.keys(state.answers).length > 0 && (
            <SummaryRow icon="fa-comment" label="Antworten">
              {Object.keys(state.answers).length} Frage{Object.keys(state.answers).length !== 1 ? 'n' : ''} beantwortet
            </SummaryRow>
          )}
          {state.media.filter(m => m.serverUrl).length > 0 && (
            <SummaryRow icon="fa-image" label="Fotos/Videos">
              {state.media.filter(m => m.serverUrl).length} Datei
              {state.media.filter(m => m.serverUrl).length !== 1 ? 'en' : ''} hochgeladen
            </SummaryRow>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-dashed px-5 py-4 text-xs"
        style={{ borderColor: '#C4AED0', background: '#FAF7FD', color: C.lavender }}>
        {isEdit ? (
          <>
            <p className="font-semibold mb-1" style={{ color: C.aubergine }}>Änderungen speichern</p>
            Deine Anpassungen werden sofort übernommen.
          </>
        ) : (
          <>
            <p className="font-semibold mb-1" style={{ color: C.aubergine }}>Fast live!</p>
            Dein Vorschlag wird nach einer kurzen Prüfung durch unser Team veröffentlicht.
            Vielen Dank, dass du die Geheimtrips-Gemeinschaft bereicherst!
          </>
        )}
      </div>

      {pendingUploads > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: '#FFF4EB', color: '#C96442' }}>
          <i className="fa-solid fa-circle-notch fa-spin" />
          {pendingUploads} Datei{pendingUploads !== 1 ? 'en werden' : ' wird'} noch hochgeladen…
        </div>
      )}

      <button
        type="button" onClick={onSubmit}
        disabled={submitting || pendingUploads > 0}
        className="w-full py-4 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
        style={{ background: `linear-gradient(135deg, ${C.aubergine}, ${C.lavender})` }}
      >
        {submitting
          ? <><i className="fa-solid fa-circle-notch fa-spin" /> {isEdit ? 'Wird gespeichert…' : 'Wird eingereicht…'}</>
          : <><i className={`fa-solid ${isEdit ? 'fa-floppy-disk' : 'fa-paper-plane'}`} /> {isEdit ? 'Änderungen speichern' : 'Geheimtripp einreichen'}</>}
      </button>
    </div>
  );
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function StepHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-2xl font-bold leading-tight" style={{ color: C.aubergine }}>{children}</h2>
  );
}
function StepSub({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-sm leading-relaxed" style={{ color: C.lavender }}>{children}</p>
  );
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-widest mb-2 text-[#B0A3BC]">{children}</p>
  );
}
function InputField({ label, hint, placeholder, value, onChange, required, maxLength }: {
  label: string; hint?: string; placeholder?: string; value: string;
  onChange: (v: string) => void; required?: boolean; maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold" style={{ color: C.aubergine }}>
        {label}{required && <span className="ml-1 text-[#C96442]">*</span>}
      </label>
      {hint && <p className="text-xs text-[#9A8FAA]">{hint}</p>}
      <input
        type="text" placeholder={placeholder} value={value} maxLength={maxLength}
        onChange={e => onChange(e.target.value)} spellCheck
        className="w-full border rounded-xl px-4 py-3 text-sm outline-none transition-colors border-[#E4DCF0] focus:border-[#F99039] bg-white text-[#34254C] placeholder-[#A89BB5]"
      />
    </div>
  );
}
function SummaryRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-5 py-3 items-start">
      <i className={`fa-solid ${icon} text-xs mt-0.5 w-4 text-center flex-shrink-0`} style={{ color: C.lavender }} />
      <div>
        <span className="text-xs font-bold uppercase tracking-wide text-[#B0A3BC]">{label}</span>
        <p className="text-sm mt-0.5" style={{ color: C.aubergine }}>{children}</p>
      </div>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ step }: { step: number }) {
  const pct = Math.round(((step - 1) / (TOTAL_STEPS - 1)) * 100);
  const LABELS = ['Name', 'Ort', 'Beschreibung', 'Kategorie', 'Details', 'Fotos'];
  return (
    <div className="mb-8">
      <div className="flex justify-between mb-3">
        {LABELS.map((lbl, i) => {
          const num = i + 1;
          const done = num < step; const cur = num === step;
          return (
            <div key={lbl} className="flex flex-col items-center gap-1" style={{ minWidth: 0 }}>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all duration-300"
                style={{
                  background: done ? C.amber : cur ? C.aubergine : '#E4DCF0',
                  color: done || cur ? 'white' : '#C4AED0',
                }}
              >
                {done ? <i className="fa-solid fa-check text-[10px]" /> : num}
              </div>
              <span className="text-[9px] font-semibold uppercase tracking-wide hidden sm:block"
                style={{ color: cur ? C.aubergine : '#C4AED0' }}>
                {lbl}
              </span>
            </div>
          );
        })}
      </div>
      <div className="relative h-1.5 rounded-full overflow-hidden bg-[#E4DCF0]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${C.amber}, ${C.lavender})` }}
        />
      </div>
    </div>
  );
}

// ─── Main wizard component ────────────────────────────────────────────────────
export function SubmitPage() {
  const navigate          = useNavigate();
  const [searchParams]    = useSearchParams();
  const editId            = searchParams.get('edit');
  const isEdit            = !!editId;
  const invalidatePlaces  = useAppStore(s => s.invalidatePlaces);
  const markVisited       = useAppStore(s => s.markVisited);
  const [step, setStep]       = useState(1);
  const [state, setState]     = useState<WizardState>(EMPTY);
  const [error, setError]     = useState('');
  const [submitting, setSub]  = useState(false);
  const [success, setSuccess] = useState('');
  // Im Bearbeiten-Modus erst rendern, wenn die Daten geladen sind — sonst
  // mounten die Rich-Text-Editoren mit leerem Inhalt.
  const [ready, setReady]     = useState(!editId);
  const [loadError, setLoadError] = useState('');
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editId) return;
    let alive = true;
    (async () => {
      try {
        const place = await placesApi.get(editId);
        if (!alive) return;
        setState(placeToWizardState(place));
        setReady(true);
      } catch {
        if (alive) { setLoadError('Ort konnte nicht geladen werden.'); setReady(true); }
      }
    })();
    return () => { alive = false; };
  }, [editId]);

  function set<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState(prev => ({ ...prev, [key]: value }));
  }

  function setLocation(text: string, lat: number | null, lng: number | null) {
    setState(prev => ({ ...prev, locationText: text, lat, lng }));
  }

  // ── Media helpers ────────────────────────────────────────────────────────
  function updateMedia(id: string, patch: Partial<MediaItem>) {
    setState(prev => ({
      ...prev,
      media: prev.media.map(m => m.id === id ? { ...m, ...patch } : m),
    }));
  }

  function removeMedia(id: string) {
    setState(prev => {
      const item = prev.media.find(m => m.id === id);
      if (item?.localUrl.startsWith('blob:')) URL.revokeObjectURL(item.localUrl);
      return { ...prev, media: prev.media.filter(m => m.id !== id) };
    });
  }

  async function addMediaFiles(files: File[]) {
    const filtered  = files.filter(f =>
      f.type.startsWith('image/') || f.type.startsWith('video/') ||
      // HEIC/HEIF files may have empty type on some browsers — detect by extension
      /\.(heic|heif)$/i.test(f.name)
    );
    const available = MAX_MEDIA - state.media.length;
    const toAdd     = filtered.slice(0, Math.max(0, available));
    if (!toAdd.length) return;

    const newItems: MediaItem[] = toAdd.map(f => ({
      id:       crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10),
      localUrl: URL.createObjectURL(f),
      caption:  '',
      cropX:    0.5,
      cropY:    0.5,
      type:     f.type.startsWith('video/') ? 'video' : 'image',
      uploading: true,
      muted:    true,  // videos muted by default
    }));

    setState(prev => ({ ...prev, media: [...prev.media, ...newItems] }));

    // Upload in parallel; use functional setState to avoid stale closures
    await Promise.all(toAdd.map(async (file, i) => {
      const id = newItems[i].id;
      try {
        const result = await mediaApi.upload(file);
        setState(prev => ({
          ...prev,
          media: prev.media.map(m => m.id === id ? { ...m, serverUrl: result.url, uploading: false } : m),
        }));
      } catch (e: unknown) {
        setState(prev => ({
          ...prev,
          media: prev.media.map(m => m.id === id
            ? { ...m, uploading: false, error: (e as Error).message ?? 'Upload fehlgeschlagen.' }
            : m),
        }));
      }
    }));
  }

  // ── Navigation ───────────────────────────────────────────────────────────
  function canNext(): boolean {
    if (step === 1) return state.name.trim().length >= 2;                 // Name
    if (step === 2) return state.lat !== null && state.lng !== null;      // Standort
    // Beschreibung: mind. 200 Zeichen Klartext (Kurz-Zusammenfassung optional)
    if (step === 3) return state.long.replace(/<[^>]*>/g, '').trim().length >= 200;
    if (step === 4) return !!state.l3;                                    // Kategorie
    return true;
  }

  function scrollTop() {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function next() {
    if (!canNext()) return;
    setError('');
    setStep(s => Math.min(s + 1, TOTAL_STEPS));
    scrollTop();
  }

  function back() {
    setError('');
    setStep(s => Math.max(s - 1, 1));
    scrollTop();
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit() {
    const pendingUploads = state.media.filter(m => m.uploading).length;
    if (pendingUploads > 0) {
      setError('Bitte warte, bis alle Dateien hochgeladen sind.');
      return;
    }

    setSub(true); setError('');
    try {
      const successMedia = state.media.filter(m => m.serverUrl && !m.error);
      // Use heroIndex to pick cover image; fallback to first
      const heroItem = successMedia[state.heroIndex] ?? successMedia[0];
      const payload = {
        name:         state.name.trim(),
        region:       state.locationText.trim(),
        short:        state.short.trim(),
        long:         state.long,
        hero:         heroItem?.serverUrl ?? '',
        lat:          state.lat,
        lng:          state.lng,
        locationText: state.locationText.trim(),
        l1Slug:       state.l1?.slug,
        l2Slug:       state.l2?.slug,
        l3Slug:       state.l3?.slug,
        l4Features:   state.l4Features,
        answers:      state.answers,
        // Filter tips: strip HTML tags to check if actually empty
        tips:         state.tips.filter(t => t.replace(/<[^>]*>/g, '').trim()),
        heroCropX:    heroItem?.cropX ?? 0.5,
        heroCropY:    heroItem?.cropY ?? 0.5,
        mediaItems:   successMedia.map(m => ({
          url:     m.serverUrl!,
          caption: m.caption,
          type:    m.type,
          cropX:   m.cropX,
          cropY:   m.cropY,
        })),
      };
      const res = editId
        ? await placesApi.update(editId, payload)
        : await placesApi.submit(payload);
      // Revoke all local blob URLs
      state.media.forEach(m => { if (m.localUrl.startsWith('blob:')) URL.revokeObjectURL(m.localUrl); });
      // Force places list to re-fetch so the change appears on the map/discover page
      invalidatePlaces();
      // Nur beim Ersteinreichen: Ersteller:in als „war hier" markieren (Backend tat es schon)
      if (!editId) markVisited(res.id).catch(() => {});
      setSuccess(res.id);
      scrollTop();
    } catch (e: unknown) {
      setError((e as Error).message ?? (editId ? 'Fehler beim Speichern.' : 'Fehler beim Einreichen.'));
    }
    setSub(false);
  }

  // ── Success screen ───────────────────────────────────────────────────────
  if (success) {
    return (
      <AppShell title={isEdit ? 'Gespeichert!' : 'Eingereicht!'} showBack>
        <div className="max-w-xl mx-auto px-5 py-16 text-center space-y-6">
          <div
            className="w-20 h-20 rounded-full mx-auto flex items-center justify-center text-white text-3xl"
            style={{ background: `linear-gradient(135deg, ${C.aubergine}, ${C.lavender})` }}
          >
            <i className="fa-solid fa-check" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold" style={{ color: C.aubergine }}>
              {isEdit ? 'Änderungen gespeichert!' : 'Danke für deinen Beitrag!'}
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: C.lavender }}>
              {isEdit
                ? 'Deine Änderungen wurden übernommen.'
                : 'Dein Geheimtripp wurde eingereicht und erscheint nach einer kurzen Prüfung für alle.'}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate(`/place/${success}`)}
              className="py-3 px-6 rounded-2xl font-bold text-white text-sm"
              style={{ background: C.amber }}
            >
              Ort jetzt ansehen
            </button>
            {!isEdit && (
              <button
                onClick={() => {
                  setState({ name: '', short: '', locationText: '', lat: null, lng: null,
                    l1: null, l2: null, l3: null, l4Features: [], answers: {},
                    long: '', tips: [''], media: [], heroIndex: 0 });
                  setStep(1); setSuccess('');
                }}
                className="py-3 px-6 rounded-2xl font-semibold text-sm border-2 border-[#E4DCF0]"
                style={{ color: C.lavender }}
              >
                Weiteren Ort einreichen
              </button>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Lade-/Fehlerzustand im Bearbeiten-Modus ────────────────────────────────
  if (!ready) {
    return (
      <AppShell title="Bearbeiten" showBack>
        <div className="max-w-xl mx-auto px-5 py-24 flex justify-center">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl" style={{ color: C.lavender }} />
        </div>
      </AppShell>
    );
  }
  if (loadError) {
    return (
      <AppShell title="Bearbeiten" showBack>
        <div className="max-w-xl mx-auto px-5 py-20 text-center space-y-4">
          <i className="fa-solid fa-triangle-exclamation text-4xl" style={{ color: '#C96442' }} />
          <p className="text-sm" style={{ color: C.lavender }}>{loadError}</p>
        </div>
      </AppShell>
    );
  }

  const STEP_TITLES = [
    'Name', 'Standort', 'Beschreibung',
    'Kategorie wählen', 'Details', 'Fotos & Abschicken',
  ];

  return (
    <AppShell title={`${isEdit ? 'Bearbeiten' : 'Einreichen'} · ${STEP_TITLES[step - 1]}`} showBack>
      <div ref={topRef} className="max-w-xl mx-auto px-5 py-8 pb-32">
        <ProgressBar step={step} />

        {/* Reihenfolge: 1 Name · 2 Standort · 3 Beschreibung+Kurz+Trivia+Tipps · 4 Kategorie · 5 Details · 6 Fotos */}
        {step === 1 && <Step1 state={state} set={set} />}
        {step === 2 && <Step2 state={state} setLocation={setLocation} />}
        {step === 3 && <StepStory state={state} set={set} />}
        {step === 4 && <StepCategory state={state} setState={setState} />}
        {step === 5 && <StepDetails state={state} set={set} />}
        {step === 6 && (
          <StepMedia
            state={state}
            isEdit={isEdit}
            onAddFiles={addMediaFiles}
            onItemChange={updateMedia}
            onRemove={removeMedia}
            onSetHero={idx => setState(prev => ({ ...prev, heroIndex: idx }))}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        )}

        {error && (
          <div className="mt-5 rounded-xl border px-4 py-3 text-sm flex items-start gap-2"
            style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#B91C1C' }}>
            <i className="fa-solid fa-triangle-exclamation mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Sticky bottom nav — steps 1-5 only */}
        {step < 6 && (
          <div
            className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E4DCF0]"
            style={{ background: 'rgba(251,249,252,0.97)', backdropFilter: 'blur(12px)' }}
          >
            <div className="max-w-xl mx-auto px-5 py-4 flex gap-3">
              {step > 1 && (
                <button
                  type="button" onClick={back}
                  className="py-3 px-6 rounded-2xl font-semibold text-sm border-2 border-[#E4DCF0] flex items-center gap-2 transition-colors hover:border-[#C4AED0]"
                  style={{ color: C.lavender }}
                >
                  <i className="fa-solid fa-arrow-left text-xs" /> Zurück
                </button>
              )}
              <button
                type="button" onClick={next}
                disabled={!canNext()}
                className="flex-1 py-3 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                style={{
                  background: canNext()
                    ? `linear-gradient(135deg, ${C.aubergine}, ${C.lavender})`
                    : '#D8CEEA',
                }}
              >
                {step === 5 ? 'Zu Fotos & Abschicken' : 'Weiter'}
                <i className="fa-solid fa-arrow-right text-xs" />
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
