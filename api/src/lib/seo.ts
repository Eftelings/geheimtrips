/**
 * Server-Meta für Ort-Seiten: Titel/Description/OG/Twitter/JSON-LD werden serverseitig
 * ins index.html gesetzt. Nötig, weil die SPA clientseitig rendert — Social-/Bing-Bots
 * führen kein JS aus und sähen sonst nur die generischen Standard-Tags.
 */
export interface SeoPlace {
  id: string;
  name: string;
  region: string | null;
  short: string | null;
  hero: string | null;
  lat: number | null;
  lng: number | null;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function injectPlaceMeta(html: string, p: SeoPlace, origin: string): string {
  const title = `${p.name}${p.region ? ` – ${p.region}` : ''} · Geheimtrips.de`;
  const desc  = (p.short ?? '').trim().slice(0, 300)
    || `${p.name}: ein Geheimtipp abseits der Touristenpfade auf Geheimtrips.de.`;
  const url   = `${origin}/ort/${p.id}`;
  const img   = p.hero ? (/^https?:\/\//.test(p.hero) ? p.hero : origin + p.hero) : '';

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: p.name,
    description: desc,
    url,
    ...(img ? { image: img } : {}),
    ...(p.region ? { address: { '@type': 'PostalAddress', addressLocality: p.region, addressCountry: 'DE' } } : {}),
    ...(p.lat != null && p.lng != null
      ? { geo: { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng } }
      : {}),
  };

  const head = [
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="Geheimtrips.de" />`,
    `<meta property="og:locale" content="de_DE" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    img ? `<meta property="og:image" content="${esc(img)}" />` : '',
    `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    img ? `<meta name="twitter:image" content="${esc(img)}" />` : '',
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean).join('\n    ');

  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${esc(desc)}" />`)
    .replace('</head>', `    ${head}\n  </head>`);
}
