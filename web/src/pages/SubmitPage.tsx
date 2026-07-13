import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { useAppStore } from '../store/useAppStore.js';
import { TAXONOMY, UNIVERSAL_QUESTIONS } from '../data/taxonomy.js';
import type { TaxonomyL1, TaxonomyL2, TaxonomyL3, SubmitQuestion } from '../data/taxonomy.js';
import { detailQuestions, HOUR_DAYS } from '../data/detailQuestions.js';
import type { WeekHours } from '../data/detailQuestions.js';
import { useTaxVocab, tagInfoFrom } from '../data/taxVocab.js';
import type { Place } from '../types/index.js';
import { placesApi, mediaApi, aiApi, taxonomyApi } from '../services/api.js';
import { TaxonomyPicker } from '../components/ui/TaxonomyPicker.js';
import type { TaxonomyValue } from '../components/ui/TaxonomyPicker.js';
import { geocodeSuggestions, reverseGeocode, requestGpsPosition, distanceKm } from '../services/geoService.js';
import exifr from 'exifr';
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
  // Neues Taxonomie-Modell — bis zu 3 Typ-Tags
  tags:         string[];
  merkmale:     string[];
  vibes:        string[];
  answers:      Record<string, unknown>;
  long:         string;     // HTML from rich-text editor
  tips:         string[];
  media:        MediaItem[];
  heroIndex:    number;     // index of selected cover image
  exifSuggestion: { lat: number; lng: number } | null;  // aus Foto-EXIF gelesener Standortvorschlag
}

const EMPTY: WizardState = {
  name: '', short: '', locationText: '', lat: null, lng: null,
  l1: null, l2: null, l3: null, l4Features: [],
  tags: [], merkmale: [], vibes: [],
  answers: {}, long: '', tips: [''], media: [], heroIndex: 0,
  exifSuggestion: null,
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
    tags:         place.tagSlugs?.length ? place.tagSlugs : (place.tagSlug ? [place.tagSlug] : []),
    merkmale:     Array.isArray(attrs.merkmale) ? (attrs.merkmale as string[]) : [],
    vibes:        Array.isArray(attrs.vibes) ? (attrs.vibes as string[]) : [],
    answers:      (attrs.answers as Record<string, unknown>) ?? {},
    long:         place.long ?? '',
    tips:         place.tips?.length ? place.tips : [''],
    media,
    heroIndex:    0,
    exifSuggestion: null,
  };
}

// ─── MiniRichText ─────────────────────────────────────────────────────────────
function MiniRichText({
  value, onChange, placeholder = '', maxLength = 4000, minHeight = 160, images = [], maxImages = 2,
  linkPlaces = [],
}: {
  value: string; onChange: (html: string) => void;
  placeholder?: string; maxLength?: number; minHeight?: number;
  images?: string[]; maxImages?: number;
  /** Andere Orte, die im Text verlinkt werden können (id + Name). */
  linkPlaces?: { id: string; name: string }[];
}) {
  const ref           = useRef<HTMLDivElement>(null);
  const lastValid     = useRef(value);        // last HTML that was within limit
  const savedRange    = useRef<Range | null>(null);
  const [count, setCount] = useState(0);
  const [empty, setEmpty] = useState(!value);
  const [imgCount, setImgCount]   = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkOpen, setLinkOpen]     = useState(false);
  const [linkQuery, setLinkQuery]   = useState('');

  // Aktuelle Auswahl im Editor merken (für das Einfügen nach Klick auf eine Miniatur)
  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }
  function insertImage(url: string) {
    const el = ref.current; if (!el) return;
    if (el.querySelectorAll('img').length >= maxImages) return;
    el.focus();
    const sel = window.getSelection();
    if (savedRange.current && el.contains(savedRange.current.startContainer)) {
      sel?.removeAllRanges(); sel?.addRange(savedRange.current);
    } else {
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      sel?.removeAllRanges(); sel?.addRange(r);
    }
    document.execCommand('insertHTML', false, `<img src="${url}" class="gt-embed" alt="" /><br>`);
    savedRange.current = null;
    setPickerOpen(false);
    sync();
  }
  function insertPlaceLink(p: { id: string; name: string }) {
    const el = ref.current; if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (savedRange.current && el.contains(savedRange.current.startContainer)) {
      sel?.removeAllRanges(); sel?.addRange(savedRange.current);
    } else {
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      sel?.removeAllRanges(); sel?.addRange(r);
    }
    const safe = p.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    document.execCommand('insertHTML', false, `<a href="/place/${p.id}" class="gt-place" data-place-id="${p.id}">${safe}</a>&nbsp;`);
    savedRange.current = null;
    setLinkOpen(false); setLinkQuery('');
    sync();
  }

  // Set initial content only on mount
  useEffect(() => {
    if (ref.current && value) {
      ref.current.innerHTML = value;
      lastValid.current = value;
      const len = ref.current.textContent?.length ?? 0;
      setCount(len);
      setImgCount(ref.current.querySelectorAll('img').length);
      setEmpty(len === 0 && ref.current.querySelectorAll('img').length === 0);
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
    const empty = text.trim() === '' && el.querySelectorAll('img').length === 0;
    lastValid.current = html;
    setCount(text.length);
    setEmpty(empty);
    setImgCount(el.querySelectorAll('img').length);
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
        {linkPlaces.length > 0 && (
          <>
            <span className="mx-1 text-[#E4DCF0]">|</span>
            <button type="button"
              onMouseDown={e => { e.preventDefault(); saveSelection(); setLinkOpen(o => !o); setPickerOpen(false); }}
              title="Anderen Ort im Text verlinken"
              className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-semibold transition-colors ${linkOpen ? 'bg-[#E4DCF0] text-[#34254C]' : 'text-[#71587A] hover:bg-[#E4DCF0] hover:text-[#34254C]'}`}>
              <i className="fa-solid fa-location-dot text-[11px]" /> Ort verlinken
            </button>
          </>
        )}
        {images.length > 0 && (
          <button type="button" disabled={imgCount >= maxImages}
            onMouseDown={e => { e.preventDefault(); saveSelection(); setPickerOpen(o => !o); setLinkOpen(false); }}
            title="Bild in den Text einfügen"
            className="ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-semibold text-[#71587A] hover:bg-[#E4DCF0] hover:text-[#34254C] transition-colors disabled:opacity-40">
            <i className="fa-solid fa-image text-[11px]" /> Bild ({imgCount}/{maxImages})
          </button>
        )}
      </div>
      {/* Ort-Verlinkung: anderen Geheimtrip suchen und als Link in den Text einfügen */}
      {linkOpen && linkPlaces.length > 0 && (
        <div className="px-2 py-2 border-b border-[#F0EBF7] bg-[#FAF7FD]">
          <input autoFocus value={linkQuery} onChange={e => setLinkQuery(e.target.value)}
            placeholder="Ort suchen…"
            className="w-full mb-2 rounded-lg border border-[#E4DCF0] px-3 py-1.5 text-sm outline-none focus:border-[#F99039]" />
          <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
            {linkPlaces
              .filter(p => p.name.toLowerCase().includes(linkQuery.trim().toLowerCase()))
              .slice(0, 30)
              .map(p => (
                <button key={p.id} type="button"
                  onMouseDown={e => { e.preventDefault(); insertPlaceLink(p); }}
                  className="text-left px-2.5 py-1.5 rounded-lg text-sm text-[#34254C] hover:bg-[#E4DCF0] transition-colors truncate">
                  <i className="fa-solid fa-location-dot text-[10px] text-[#F99039] mr-1.5" />{p.name}
                </button>
              ))}
            {linkPlaces.filter(p => p.name.toLowerCase().includes(linkQuery.trim().toLowerCase())).length === 0 && (
              <p className="text-xs text-[#B0A3BC] px-2.5 py-2">Kein Ort gefunden.</p>
            )}
          </div>
        </div>
      )}
      {/* Bild-Auswahl: eingereichte Fotos in den Fließtext einbetten (Reiseblog-Stil) */}
      {pickerOpen && images.length > 0 && (
        <div className="flex gap-2 px-2 py-2 border-b border-[#F0EBF7] bg-[#FAF7FD] overflow-x-auto">
          {images.map(url => (
            <button key={url} type="button" disabled={imgCount >= maxImages}
              onMouseDown={e => { e.preventDefault(); insertImage(url); }}
              className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 border-transparent hover:border-[#F99039] disabled:opacity-40 transition-all">
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
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
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onBlur={saveSelection}
          style={{ minHeight }}
          className="px-4 py-3 text-sm text-[#34254C] outline-none leading-relaxed [&_img.gt-embed]:rounded-xl [&_img.gt-embed]:my-2 [&_img.gt-embed]:max-h-60 [&_img.gt-embed]:w-auto [&_a.gt-place]:text-[#C96442] [&_a.gt-place]:font-semibold [&_a.gt-place]:no-underline"
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
    const v = (value ?? {}) as WeekHours & { alwaysOpen?: boolean };
    const always = v.alwaysOpen === true;
    const upd = (key: string, patch: Partial<WeekHours[string]>) => onChange({ ...v, [key]: { ...(v[key] ?? {}), ...patch } });
    const timeCls = 'border rounded-lg px-2 py-1.5 text-sm outline-none border-[#E4DCF0] focus:border-[#F99039] bg-white text-[#34254C]';
    return (
      <div className="space-y-2">
        {/* Umschalter: immer geöffnet ODER feste Öffnungszeiten */}
        <div className="inline-flex gap-1 p-1 bg-[#F0EBF7] rounded-xl">
          {([['open', 'Immer geöffnet'], ['hours', 'Öffnungszeiten']] as const).map(([id, lbl]) => {
            const active = (id === 'open') === always;
            return (
              <button key={id} type="button" onClick={() => onChange({ ...v, alwaysOpen: id === 'open' })}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={active ? { background: 'white', color: '#34254C', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' } : { color: '#71587A' }}>
                {lbl}
              </button>
            );
          })}
        </div>
        {always ? (
          <p className="text-xs text-[#9A8FAA] italic pl-1">Dieser Ort ist rund um die Uhr geöffnet.</p>
        ) : (
        <div className="space-y-1.5">
        {HOUR_DAYS.map(([key, label]) => {
          const d = v[key] ?? {};
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="w-16 flex-shrink-0 text-xs font-semibold text-[#9A8FAA]">{label}</span>
              {d.closed ? (
                <span className="flex-1 text-xs text-[#A89BB5] italic">geschlossen</span>
              ) : (
                <div className="flex-1 flex items-center gap-1.5">
                  <input type="time" value={d.open ?? ''} onChange={e => upd(key, { open: e.target.value })} className={timeCls} />
                  <span className="text-[#9A8FAA] text-xs">–</span>
                  <input type="time" value={d.close ?? ''} onChange={e => upd(key, { close: e.target.value })} className={timeCls} />
                </div>
              )}
              <button type="button" onClick={() => upd(key, { closed: !d.closed })}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg flex-shrink-0 transition-colors"
                style={d.closed ? { background: '#FFF4EB', color: '#F99039' } : { background: '#F0EBF7', color: '#71587A' }}>
                {d.closed ? 'öffnen' : 'zu'}
              </button>
            </div>
          );
        })}
        </div>
        )}
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

// ─── Geführter Bild-Editor: Fokus ziehen · Live Hoch-/Querformat · drehen · Bildunterschrift ──
async function rotateImageFile(url: string): Promise<File> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image(); i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i); i.onerror = () => reject(new Error('load'));
    i.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalHeight; canvas.height = img.naturalWidth; // 90° CW → Seiten tauschen
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', 0.9));
  if (!blob) throw new Error('blob');
  return new File([blob], `rot-${Date.now()}.webp`, { type: 'image/webp' });
}

function CropPreview({ url, cropX, cropY, ratio, label }: { url: string; cropX: number; cropY: number; ratio: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 w-full">
      <div className="rounded-xl overflow-hidden bg-black/40 w-full ring-1 ring-white/15" style={{ aspectRatio: ratio }}>
        <img src={url} alt="" className="w-full h-full object-cover" style={{ objectPosition: `${cropX * 100}% ${cropY * 100}%` }} />
      </div>
      <span className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function MediaEditorModal({ items, index, setIndex, onClose, onUpdate }: {
  items: MediaItem[]; index: number; setIndex: (i: number) => void; onClose: () => void;
  onUpdate: (id: string, patch: Partial<MediaItem>) => void;
}) {
  const item = items[index];
  const [ar, setAr] = useState(1);
  const [busy, setBusy] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => { setAr(item?.isLandscape ? 3 / 2 : 3 / 4); }, [index, item?.isLandscape]);

  if (!item) return null;
  const url = item.serverUrl ?? item.localUrl;
  const isImage = item.type === 'image';
  const canCrop = isImage && !item.uploading && !item.error && !busy;

  const setFocal = (clientX: number, clientY: number) => {
    const el = frameRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    onUpdate(item.id, {
      cropX: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
      cropY: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
    });
  };

  async function rotate() {
    if (!item.serverUrl) return;
    setBusy(true);
    try {
      const file = await rotateImageFile(item.serverUrl);
      const { url: newUrl } = await mediaApi.upload(file);
      onUpdate(item.id, { serverUrl: newUrl, localUrl: newUrl, cropX: 0.5, cropY: 0.5, isLandscape: undefined });
    } catch { /* Drehen fehlgeschlagen — Original behalten */ }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: 'rgba(15,11,26,0.98)' }}>
      <div className="flex items-center justify-between px-4 py-3 text-white flex-shrink-0">
        <span className="text-sm font-semibold">Bild {index + 1} von {items.length}</span>
        <button type="button" onClick={onClose} className="text-sm font-bold text-[var(--color-amber)]">Fertig</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 flex flex-col gap-4">
        {isImage ? (
          <>
            <p className="text-center text-white/60 text-xs">Zieh mit dem Finger über das Bild — der Punkt markiert den wichtigsten Bereich, um den zugeschnitten wird.</p>
            <div className="relative mx-auto touch-none cursor-crosshair" ref={frameRef} style={{ aspectRatio: ar, maxHeight: '44vh', maxWidth: '100%' }}
              onPointerDown={e => { if (!canCrop) return; dragging.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setFocal(e.clientX, e.clientY); }}
              onPointerMove={e => { if (dragging.current) setFocal(e.clientX, e.clientY); }}
              onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}>
              <img src={url} alt="" draggable={false} className="w-full h-full object-contain select-none rounded-xl pointer-events-none"
                onLoad={e => setAr(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} />
              {busy && <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40"><i className="fa-solid fa-circle-notch fa-spin text-white text-2xl" /></div>}
              {canCrop && (
                <div className="absolute w-9 h-9 rounded-full border-[3px] border-white -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center"
                  style={{ left: `${item.cropX * 100}%`, top: `${item.cropY * 100}%`, boxShadow: '0 0 0 2px rgba(0,0,0,0.5), 0 2px 10px rgba(0,0,0,0.6)' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>
              )}
            </div>
            <div className="flex justify-center items-start gap-4 max-w-xs mx-auto w-full">
              <div className="w-24 flex-shrink-0"><CropPreview url={url} cropX={item.cropX} cropY={item.cropY} ratio="4/5" label="Hochformat" /></div>
              <div className="flex-1 pt-0"><CropPreview url={url} cropX={item.cropX} cropY={item.cropY} ratio="16/9" label="Querformat" /></div>
            </div>
            <div className="flex justify-center">
              <button type="button" onClick={rotate} disabled={busy || !item.serverUrl}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.12)' }}>
                <i className="fa-solid fa-rotate-right" />Drehen
              </button>
            </div>
          </>
        ) : (
          <div className="mx-auto w-full max-w-xs rounded-2xl overflow-hidden bg-black mt-4" style={{ aspectRatio: '9/16', maxHeight: '50vh' }}>
            <video src={url} className="w-full h-full object-contain" controls playsInline muted={item.muted ?? true} />
          </div>
        )}

        <div className="max-w-md mx-auto w-full">
          <label className="block text-xs font-semibold text-white/70 mb-1.5">Bildunterschrift (optional)</label>
          <input value={item.caption} onChange={e => onUpdate(item.id, { caption: e.target.value })} maxLength={120}
            placeholder="Was ist auf dem Bild zu sehen?"
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none bg-white/10 text-white placeholder-white/40 border border-white/15 focus:border-[var(--color-amber)]" />
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-3 border-t border-white/10 flex-shrink-0">
        <button type="button" onClick={() => setIndex(index - 1)} disabled={index === 0}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white/80 disabled:opacity-30"><i className="fa-solid fa-arrow-left mr-1.5" />Zurück</button>
        <button type="button" onClick={() => index < items.length - 1 ? setIndex(index + 1) : onClose()}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--color-amber)' }}>
          {index < items.length - 1 ? <>Weiter<i className="fa-solid fa-arrow-right ml-1.5" /></> : 'Fertig'}
        </button>
      </div>
    </div>
  );
}

// ─── MediaCard ────────────────────────────────────────────────────────────────
function MediaCard({
  item, isHero, onSetHero, onUpdate, onRemove, onEdit,
}: {
  item: MediaItem; isHero: boolean;
  onSetHero: () => void;
  onUpdate: (patch: Partial<MediaItem>) => void;
  onRemove: () => void;
  onEdit: () => void;
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

        {/* ── Vorschau (tippen → geführter Editor: zuschneiden, drehen, Bildunterschrift) ── */}
        {item.type === 'image' ? (
          <button type="button" onClick={onEdit} disabled={item.uploading || !!item.error}
            className="relative flex-shrink-0 w-[72px] rounded-xl overflow-hidden bg-[#F0EBF7] active:scale-[0.97] transition-transform" style={{ aspectRatio: '3/4' }}>
            {imgContent()}
            {!item.uploading && !item.error && (
              <span className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/55 backdrop-blur flex items-center justify-center text-white text-[11px]">
                <i className="fa-solid fa-crop-simple" />
              </span>
            )}
          </button>
        ) : (
          <button type="button" onClick={onEdit}
            className="relative flex-shrink-0 w-[72px] rounded-xl overflow-hidden bg-[#1a1a2e] flex items-center justify-center active:scale-[0.97] transition-transform" style={{ aspectRatio: '3/4' }}>
            {item.uploading ? <i className="fa-solid fa-circle-notch fa-spin text-white" /> : <i className="fa-solid fa-film text-white text-xl" />}
          </button>
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

          {!item.uploading && !item.error && (
            <button type="button" onClick={onEdit} className="text-left w-full">
              {item.caption
                ? <p className="text-xs text-[#34254C] line-clamp-2">{item.caption}</p>
                : <p className="text-xs italic text-[#A89BB5]">Keine Bildunterschrift</p>}
              <span className="text-[11px] font-semibold inline-flex items-center gap-1 mt-1" style={{ color: C.amber }}>
                <i className="fa-solid fa-crop-simple text-[10px]" />{item.type === 'image' ? 'Zuschneiden & beschriften' : 'Bearbeiten'}
              </span>
            </button>
          )}
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
  const [editIdx, setEditIdx] = useState<number | null>(null);

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
          onEdit={() => setEditIdx(idx)}
        />
      ))}

      {items.length >= maxItems && (
        <p className="text-xs text-center text-[#B0A3BC] py-2">
          Maximum von {maxItems} Dateien erreicht.
        </p>
      )}

      {editIdx !== null && items[editIdx] && (
        <MediaEditorModal
          items={items} index={editIdx}
          setIndex={i => setEditIdx(Math.max(0, Math.min(items.length - 1, i)))}
          onClose={() => setEditIdx(null)}
          onUpdate={onItemChange}
        />
      )}
    </div>
  );
}

// ─── Step sub-components ──────────────────────────────────────────────────────

function Step1({ state, set }: { state: WizardState; set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void }) {
  // Vorschlag aus dem zuvor gewählten Standort (erster Teil der Adresse stimmt oft mit dem Namen überein)
  const suggestion = state.name.trim() ? '' : (state.locationText.split(',')[0]?.trim() ?? '');
  return (
    <div className="space-y-7">
      <div>
        <StepHeading>Wie heißt dein Geheimtrip?</StepHeading>
        <StepSub>Der Name erscheint als Titel – ruhig etwas Einladendes wählen.</StepSub>
      </div>
      <div className="space-y-2.5">
        <InputField
          label="Name des Ortes" required
          placeholder="z.B. Stausee am Ende der Welt"
          value={state.name} maxLength={100}
          onChange={v => set('name', v)}
        />
        {suggestion && suggestion.length > 1 && (
          <button type="button" onClick={() => set('name', suggestion)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border-2 border-[#E4DCF0] text-[#71587A] hover:border-[#F99039] transition-colors">
            <i className="fa-solid fa-wand-magic-sparkles text-[#F99039]" />
            Vorschlag aus Standort: „{suggestion}"
          </button>
        )}
      </div>
    </div>
  );
}

function Step2({ state, setLocation }: {
  state: WizardState;
  setLocation: (text: string, lat: number | null, lng: number | null) => void;
}) {
  const hasCoords = state.lat !== null && state.lng !== null;
  const navigate  = useNavigate();
  const places    = useAppStore(s => s.places);
  const [fromExif, setFromExif] = useState(false);

  // Auf der Karte gewählter Punkt: Koordinaten sofort setzen, Adresstext per
  // Reverse-Geocoding nachladen (Koordinaten allein reichen aber schon aus).
  async function pickOnMap(la: number, ln: number) {
    setLocation(state.locationText, la, ln);
    try {
      const loc = await reverseGeocode({ lat: la, lng: ln });
      setLocation(loc.fullAddress, la, ln);
    } catch { /* Standort ohne Adresse ist okay */ }
  }

  // EXIF-Standort automatisch übernehmen (kein Berechtigungs-Prompt nötig) + Hinweis
  useEffect(() => {
    if (state.exifSuggestion && state.lat == null) {
      pickOnMap(state.exifSuggestion.lat, state.exifSuggestion.lng);
      setFromExif(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 50-Meter-Duplikatenprüfung gegen bereits vorhandene Orte
  const nearby = useMemo(() => {
    if (state.lat == null || state.lng == null) return [];
    const here = { lat: state.lat, lng: state.lng };
    return places
      .filter(p => p.lat != null && p.lng != null)
      .map(p => ({ p, d: distanceKm(here, { lat: p.lat!, lng: p.lng! }) }))
      .filter(x => x.d <= 0.05)
      .sort((a, b) => a.d - b.d)
      .slice(0, 5)
      .map(x => x.p);
  }, [state.lat, state.lng, places]);

  return (
    <div className="space-y-7">
      <div>
        <StepHeading>Wo liegt dein Geheimtrip?</StepHeading>
        <StepSub>
          Tippe einen Ort oder eine Adresse ein und wähle einen Vorschlag aus der Liste,
          nutze den GPS-Knopf – oder setze den Punkt direkt auf der Karte. Koordinaten sind
          Pflicht, damit der Ort korrekt erscheint.
        </StepSub>
      </div>

      {/* Standort automatisch aus den Bild-Metadaten ermittelt (EXIF) */}
      {fromExif && hasCoords && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs" style={{ background: '#FFF4EB', color: '#C96442' }}>
          <i className="fa-solid fa-location-dot flex-shrink-0" />
          <span>Der Standort wurde aus deinen Bildern ermittelt – du kannst ihn unten anpassen.</span>
        </div>
      )}
      {/* Fallback: EXIF vorhanden, aber Standort (noch) nicht gesetzt */}
      {state.exifSuggestion && state.lat == null && !fromExif && (
        <button type="button" onClick={() => { pickOnMap(state.exifSuggestion!.lat, state.exifSuggestion!.lng); setFromExif(true); }}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-[#F99039] bg-[#FFF4EB] text-left transition-all active:scale-[0.99]">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm" style={{ background: C.amber }}>
            <i className="fa-solid fa-location-dot" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold" style={{ color: C.aubergine }}>Standort aus deinem Foto übernehmen</span>
            <span className="text-xs" style={{ color: C.lavender }}>Dein erstes Bild enthält GPS-Daten.</span>
          </span>
          <i className="fa-solid fa-arrow-right text-[#F99039] flex-shrink-0" />
        </button>
      )}

      <LocationSearch
        value={state.locationText}
        lat={state.lat} lng={state.lng}
        onSelect={setLocation}
      />

      {/* Interaktive Karte zum Sehen & Korrigieren des Standorts */}
      <LocationPickerMap lat={state.lat} lng={state.lng} onPick={pickOnMap} />

      {/* 50-Meter-Duplikatenprüfung: bestehende Orte in der Nähe */}
      {nearby.length > 0 && (
        <div className="rounded-2xl border-2 px-4 py-3 space-y-2" style={{ borderColor: '#F0C674', background: '#FFFBF0' }}>
          <p className="text-sm font-semibold" style={{ color: C.aubergine }}>
            <i className="fa-solid fa-triangle-exclamation text-[#C96442] mr-1.5" />
            In der Nähe (50&nbsp;m) gibt es schon {nearby.length === 1 ? 'einen Ort' : `${nearby.length} Orte`}. Ist dein Geheimtrip einer davon?
          </p>
          <div className="space-y-1.5">
            {nearby.map(p => (
              <button key={p.id} type="button" onClick={() => navigate(`/place/${p.id}`)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-white border border-[#E4DCF0] text-left hover:border-[#F99039] transition-colors">
                {p.hero && <img src={p.hero} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate" style={{ color: C.aubergine }}>{p.name}</span>
                  <span className="text-xs" style={{ color: C.lavender }}>{p.region}</span>
                </span>
                <i className="fa-solid fa-arrow-right text-[#B0A3BC] text-xs flex-shrink-0" />
              </button>
            ))}
          </div>
          <p className="text-xs" style={{ color: C.lavender }}>Ist deiner nicht dabei? Dann mach einfach weiter.</p>
        </div>
      )}

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
  const value: TaxonomyValue = { tags: state.tags, merkmale: state.merkmale, vibes: state.vibes };
  const onChange = (v: TaxonomyValue) =>
    setState(prev => ({ ...prev, tags: v.tags, merkmale: v.merkmale, vibes: v.vibes }));

  return (
    <div className="space-y-7">
      <div>
        <StepHeading>Was ist das für ein Ort?</StepHeading>
        <StepSub>Wähle den Typ und beschreibe kurz, was es dort gibt und wie es sich anfühlt.</StepSub>
      </div>

      <TaxonomyPicker value={value} onChange={onChange} text={`${state.name} ${state.long.replace(/<[^>]*>/g, ' ')}`} />
    </div>
  );
}

function StepDetails({
  state, set,
}: {
  state: WizardState;
  set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
}) {
  if (!state.tags.length) {
    return (
      <div className="py-16 text-center">
        <i className="fa-solid fa-arrow-left text-3xl mb-4" style={{ color: '#D8CEEA' }} />
        <p className="text-sm" style={{ color: '#9A8FAA' }}>
          Bitte wähle zuerst einen Typ im vorherigen Schritt.
        </p>
      </div>
    );
  }

  // Trivia + „Besonderheit" werden bereits auf der Beschreibungs-Seite abgefragt → hier ausblenden.
  // Trivia/Besonderheit stehen schon auf der Beschreibungs-Seite; die alten Preis-/Öffnungszeiten-/Website-
  // Fragen sind durch die neuen (berechenbaren) in detailQuestions ersetzt → hier ausblenden (keine Dubletten).
  const HIDDEN      = new Set([
    'trivia_type', 'trivia_text', 'highlight',
    'entrance_fee', 'entrance_prices', 'entrance_fee_url',
    'has_opening_hours', 'opening_hours_week', 'opening_hours_url', 'opening_hours_text',
    'website',
  ]);
  const universalQs = UNIVERSAL_QUESTIONS.filter(q => !HIDDEN.has(q.id));
  // Typ-abhängige Zusatz-Infos (Budget/Öffnungszeiten/Kontakt/Links/Tickets)
  const detailQs    = detailQuestions(state.tags);

  function setAnswer(id: string, v: unknown) {
    set('answers', { ...state.answers, [id]: v });
  }

  const renderQ = (q: SubmitQuestion) => {
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
  };

  return (
    <div className="space-y-7">
      <div>
        <StepHeading>Erzähl uns mehr</StepHeading>
        <StepSub>Ein paar Infos zum Ort — je mehr du beantwortest, desto wertvoller der Eintrag.</StepSub>
      </div>

      {detailQs.map(renderQ)}

      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1 h-px bg-[#E4DCF0]" />
        <span className="text-xs font-bold uppercase tracking-widest text-[#B0A3BC]">Allgemeines</span>
        <div className="flex-1 h-px bg-[#E4DCF0]" />
      </div>

      {universalQs.map(renderQ)}
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
  state, set, excludeId = null,
}: {
  state: WizardState;
  set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  excludeId?: string | null;
}) {
  const longLen = state.long.replace(/<[^>]*>/g, '').trim().length;
  const longOk  = longLen >= 200;
  // Andere Orte, die im Fließtext verlinkt werden können (z.B. Spots in einem Stadtteil)
  const allPlaces  = useAppStore(s => s.places);
  const loadPlaces = useAppStore(s => s.loadPlaces);
  useEffect(() => { loadPlaces(); }, [loadPlaces]);
  const linkPlaces = allPlaces
    .filter(p => p.id !== excludeId)
    .map(p => ({ id: p.id, name: p.name }));
  const setAnswer    = (id: string, v: unknown) => set('answers', { ...state.answers, [id]: v });
  const triviaTypeQ  = UNIVERSAL_QUESTIONS.find(q => q.id === 'trivia_type');
  const triviaTextQ  = UNIVERSAL_QUESTIONS.find(q => q.id === 'trivia_text');
  const triviaTypeVal = state.answers['trivia_type'];
  const triviaActive  = typeof triviaTypeVal === 'string' && triviaTypeVal !== '';

  // ── KI-Unterstützung (Gemini) ────────────────────────────────────────────
  const [aiOn, setAiOn]           = useState(false);
  const [descLoading, setDescLoad]= useState(false);
  const [descErr, setDescErr]     = useState('');
  useEffect(() => { aiApi.status().then(s => setAiOn(s.configured)).catch(() => {}); }, []);

  // B: Text-Empfehlung aus den hochgeladenen Fotos + Name + Standort (kein Umschreiben deiner Notizen)
  async function genRecommend() {
    setDescErr(''); setDescLoad(true);
    try {
      const imageUrls = state.media.filter(m => m.type === 'image' && m.serverUrl).map(m => m.serverUrl!);
      const { description } = await aiApi.placeRecommend({ name: state.name, location: state.locationText, imageUrls });
      set('long', description);
    } catch (e) { setDescErr((e as Error).message || 'Empfehlung fehlgeschlagen.'); }
    setDescLoad(false);
  }

  return (
    <div className="space-y-7">
      <div>
        <StepHeading>Beschreib deinen Geheimtrip</StepHeading>
        <StepSub>
          Erzähl zuerst die ganze Geschichte, dann bring das Besondere in einem Satz auf den Punkt.
          Trivia und Tipps kannst du darunter ergänzen{aiOn ? ' – oder dir von Gemini helfen lassen ✨' : ''}.
        </StepSub>
      </div>

      {/* 1) Ausführliche Beschreibung — Pflicht, mind. 200 Zeichen */}
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <label className="block text-sm font-semibold" style={{ color: C.aubergine }}>
            Ausführliche Beschreibung <span className="text-[#C96442]">*</span>
          </label>
        </div>
        <p className="text-xs text-[#9A8FAA]">
          Atmosphäre, was dich überrascht hat, was andere übersehen. Nutze{' '}
          <strong>Fett</strong>, <em>Kursiv</em> oder <u>Unterstrichen</u> für Betonung.
        </p>
        <MiniRichText
          value={state.long}
          onChange={v => set('long', v)}
          maxLength={4000}
          images={state.media.filter(m => m.type === 'image' && m.serverUrl).map(m => m.serverUrl!)}
          maxImages={2}
          linkPlaces={linkPlaces}
          placeholder="Ich war spät nachmittags dort, als die Sonne schon tief stand und das Wasser in einem unwirklichen Blaugrün leuchtete…"
        />
        {linkPlaces.length > 0 && (
          <p className="text-xs text-[#9A8FAA]">
            <i className="fa-solid fa-location-dot text-[10px] text-[#F99039] mr-1" />
            Tipp: Verlinke andere Geheimtrips im Text (z.B. Spots in einem Stadtteil) – darunter erscheint automatisch eine kleine Karte mit allen verlinkten Orten.
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs flex items-center gap-1.5" style={{ color: longOk ? '#2D8A4E' : '#C96442' }}>
            <i className={`fa-solid ${longOk ? 'fa-circle-check' : 'fa-circle-info'} text-[10px]`} />
            {longOk
              ? 'Super – das reicht für eine schöne Beschreibung!'
              : `Noch mind. ${200 - longLen} Zeichen (aktuell ${longLen} / 200).`}
          </p>
          {aiOn && (
            <AiButton onClick={genRecommend} loading={descLoading}
              disabled={state.media.filter(m => m.type === 'image' && m.serverUrl).length === 0}
              label="Beispieltext für diesen Ort" />
          )}
        </div>
        {aiOn && (
          <p className="text-[11px] text-[#B0A3BC]">
            Die KI schaut sich deine Fotos, den Namen und den Standort an und schlägt dir einen Text vor –
            den du frei anpassen kannst. {state.media.filter(m => m.type === 'image' && m.serverUrl).length === 0 ? 'Lade dafür zuerst ein Foto hoch.' : ''}
          </p>
        )}
        {descErr && <p className="text-xs text-[#C96442]">{descErr}</p>}
      </div>

      {/* 2) Besonderheit — ein Satz, erscheint auf der Swipe-Karte */}
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <label className="block text-sm font-semibold" style={{ color: C.aubergine }}>
            In einem Satz: Was ist das Besondere an diesem Ort?
          </label>
        </div>
        <p className="text-xs text-[#9A8FAA]">
          Dieser Satz erscheint auf der Swipe-Karte im Entdecken-Modus. Schreib ihn in deinen eigenen Worten.
        </p>
        <textarea
          rows={2} spellCheck maxLength={200}
          placeholder="Ein versteckter Felssee hoch über dem Tal – kaum bekannt, aber absolut magisch."
          value={state.short}
          onChange={e => set('short', e.target.value)}
          className="w-full border rounded-xl px-4 py-3 text-sm outline-none transition-colors border-[#E4DCF0] focus:border-[#F99039] bg-white text-[#34254C] placeholder-[#A89BB5] resize-none"
        />
        <span className="text-xs" style={{ color: state.short.length > 180 ? '#C96442' : '#A89BB5' }}>
          {state.short.length} / 200
        </span>
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
        <label className="block text-sm font-semibold" style={{ color: C.aubergine }}>
          Praktische Tipps
        </label>
        <p className="text-xs text-[#9A8FAA]">
          Jeder Tipp bekommt ein eigenes Feld. Drücke <kbd className="px-1 py-0.5 rounded bg-[#F0EBF7] text-[#71587A] text-[10px] font-mono">Enter</kbd> für den nächsten.
          Max. {MAX_TIPS} Tipps.
        </p>
        <TipFields tips={state.tips} onChange={v => set('tips', v)} />
      </div>
    </div>
  );
}

function StepMedia({
  state, onAddFiles, onItemChange, onRemove, onSetHero,
}: {
  state: WizardState;
  onAddFiles: (files: File[]) => void;
  onItemChange: (id: string, patch: Partial<MediaItem>) => void;
  onRemove: (id: string) => void;
  onSetHero: (index: number) => void;
}) {
  return (
    <div className="space-y-7">
      <div>
        <StepHeading>Zuerst: Fotos & Videos</StepHeading>
        <StepSub>
          Lade deine schönsten Aufnahmen hoch – aus Fotos mit Standortdaten schlagen wir dir gleich
          den Ort vor. Wähle ein Titelbild und passe bei Bedarf den Ausschnitt an.
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
    </div>
  );
}

// Zusammenfassung + Hinweis am Ende (Abschicken passiert über die untere Leiste)
function ReviewSubmit({ state, isEdit }: { state: WizardState; isEdit: boolean }) {
  const pendingUploads = state.media.filter(m => m.uploading).length;
  const vocab = useTaxVocab();
  return (
    <div className="space-y-5 mt-8 pt-6 border-t border-[#E4DCF0]">
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
          <SummaryRow icon="fa-tag" label="Typ">{state.tags.map(s => tagInfoFrom(vocab, s)?.label ?? s).join(' · ') || '—'}</SummaryRow>
          {state.merkmale.length > 0 && (
            <SummaryRow icon="fa-tags" label="Merkmale">{state.merkmale.join(', ')}</SummaryRow>
          )}
          {state.vibes.length > 0 && (
            <SummaryRow icon="fa-wand-magic-sparkles" label="Vibes">{state.vibes.join(', ')}</SummaryRow>
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
  const LABELS = ['Fotos', 'Ort', 'Name', 'Beschreibung', 'Kategorie', 'Details'];
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
      // Manche Browser (v.a. iPhone-HEIC) schicken einen leeren MIME-Type → per Endung erkennen
      /\.(heic|heif|jpe?g|png|webp|gif|mp4|webm|mov)$/i.test(f.name)
    );
    const available = MAX_MEDIA - state.media.length;
    const toAdd     = filtered.slice(0, Math.max(0, available));
    if (!toAdd.length) return;

    // EXIF-Standort aus dem ersten Bild lesen → Vorschlag für den Standort-Schritt
    const firstImage = toAdd.find(f => f.type.startsWith('image/') || /\.(heic|heif|jpe?g)$/i.test(f.name));
    if (firstImage) {
      exifr.gps(firstImage).then(g => {
        if (g && typeof g.latitude === 'number' && typeof g.longitude === 'number') {
          setState(prev => prev.exifSuggestion ? prev : { ...prev, exifSuggestion: { lat: g.latitude, lng: g.longitude } });
        }
      }).catch(() => { /* keine GPS-Daten im Bild — okay */ });
    }

    const newItems: MediaItem[] = toAdd.map(f => ({
      id:       crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10),
      localUrl: URL.createObjectURL(f),
      caption:  '',
      cropX:    0.5,
      cropY:    0.5,
      type:     (f.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(f.name)) ? 'video' : 'image',
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
    if (step === 1) return true;                                          // Fotos (optional)
    if (step === 2) return state.lat !== null && state.lng !== null;      // Standort
    if (step === 3) return state.name.trim().length >= 2;                 // Name
    // Beschreibung: mind. 200 Zeichen Klartext (Kurz-Zusammenfassung optional)
    if (step === 4) return state.long.replace(/<[^>]*>/g, '').trim().length >= 200;
    if (step === 5) return state.tags.length > 0;                         // mind. ein Typ-Tag
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
        // Neues Taxonomie-Modell
        tagSlugs:     state.tags,
        merkmale:     state.merkmale,
        vibes:        state.vibes,
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
      // Neue Merkmale/Vibes im Taxonomie-Graph registrieren (UGC → Moderation)
      state.tags.forEach(t => taxonomyApi.resolve(t, state.merkmale, state.vibes).catch(() => {}));
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
                : 'Dein Geheimtrip wurde eingereicht und erscheint nach einer kurzen Prüfung für alle.'}
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
                  setState({ ...EMPTY });
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
    'Fotos & Videos', 'Standort', 'Name',
    'Beschreibung', 'Kategorie wählen', 'Details & Abschicken',
  ];

  return (
    <AppShell title={`${isEdit ? 'Bearbeiten' : 'Einreichen'} · ${STEP_TITLES[step - 1]}`} showBack>
      <div ref={topRef} className="max-w-xl mx-auto px-5 py-8 pb-32">
        <ProgressBar step={step} />

        {/* Reihenfolge: 1 Fotos · 2 Standort · 3 Name · 4 Beschreibung · 5 Kategorie · 6 Details + Abschicken */}
        {step === 1 && (
          <StepMedia
            state={state}
            onAddFiles={addMediaFiles}
            onItemChange={updateMedia}
            onRemove={removeMedia}
            onSetHero={idx => setState(prev => ({ ...prev, heroIndex: idx }))}
          />
        )}
        {step === 2 && <Step2 state={state} setLocation={setLocation} />}
        {step === 3 && <Step1 state={state} set={set} />}
        {step === 4 && <StepStory state={state} set={set} excludeId={editId} />}
        {step === 5 && <StepCategory state={state} setState={setState} />}
        {step === 6 && (
          <>
            <StepDetails state={state} set={set} />
            <ReviewSubmit state={state} isEdit={isEdit} />
          </>
        )}

        {error && (
          <div className="mt-5 rounded-xl border px-4 py-3 text-sm flex items-start gap-2"
            style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#B91C1C' }}>
            <i className="fa-solid fa-triangle-exclamation mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Sticky bottom nav — letzter Schritt schickt ab */}
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
            {step < 6 ? (
              <button
                type="button" onClick={next}
                disabled={!canNext()}
                className="flex-1 py-3 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                style={{ background: canNext() ? `linear-gradient(135deg, ${C.aubergine}, ${C.lavender})` : '#D8CEEA' }}
              >
                Weiter
                <i className="fa-solid fa-arrow-right text-xs" />
              </button>
            ) : (
              <button
                type="button" onClick={handleSubmit}
                disabled={submitting || state.media.some(m => m.uploading)}
                className="flex-1 py-3 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${C.aubergine}, ${C.lavender})` }}
              >
                {submitting
                  ? <><i className="fa-solid fa-circle-notch fa-spin" /> {isEdit ? 'Wird gespeichert…' : 'Wird eingereicht…'}</>
                  : <><i className={`fa-solid ${isEdit ? 'fa-floppy-disk' : 'fa-paper-plane'}`} /> {isEdit ? 'Änderungen speichern' : 'Geheimtrip einreichen'}</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
