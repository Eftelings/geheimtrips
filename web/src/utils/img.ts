/**
 * Hängt an ein hochgeladenes Bild eine Zielbreite (`?w=`), damit der Server eine passend kleine
 * WebP-Variante ausliefert statt des Originals (oft mehrere MB bei Kamera-Uploads). Nur für eigene
 * `/api/uploads/`-Bilder — externe URLs (Karten-Tiles etc.) bleiben unberührt.
 *
 * `w` = angezeigte CSS-Breite; für scharfe Darstellung auf Retina wird verdoppelt. Der Server
 * rastet auf die nächste erlaubte Stufe ein.
 */
export function imgUrl(src: string | null | undefined, w: number): string {
  if (!src) return '';
  if (!src.includes('/api/uploads/') || /\.(mp4|webm|mov)(\?|#|$)/i.test(src)) return src;
  if (src.includes('?')) return src;   // schon parametrisiert → nicht anfassen
  return `${src}?w=${Math.round(w * 2)}`;
}
