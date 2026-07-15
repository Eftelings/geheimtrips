/**
 * Einfacher Blacklist-Filter für Namen/Handles bei der Registrierung.
 * Ziel: rassistische, antisemitische, gewaltverherrlichende und stark beleidigende
 * Begriffe blockieren — inkl. gängiger Verschleierung (Leetspeak, Trennzeichen).
 *
 * Bewusst konservativ gehalten (lieber wenige, eindeutige Treffer als viele
 * False Positives). Bei Bedarf im Admin erweiterbar — hier reicht der Code-Filter.
 */

// Verschleierung normalisieren: Kleinschreibung, Umlaute/Akzente vereinheitlichen,
// Leetspeak zurückmappen und alle Trenner (Leer-/Sonderzeichen) entfernen.
export function normalizeForMatch(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a')
    .replace(/5|\$/g, 's').replace(/7/g, 't').replace(/8/g, 'b')
    .replace(/[^a-z]/g, '');
}

// Normalisierte Sperrbegriffe (schon durch normalizeForMatch gejagt gedacht).
// Kategorien: NS/Gewaltverherrlichung, rassistische & antisemitische Slurs, harte Beleidigungen.
const BANNED = [
  // NS / Gewaltverherrlichung
  'hitler', 'heilhitler', 'siegheil', 'hakenkreuz', 'hackenkreuz', 'nsdap', 'thirdreich',
  'drittesreich', 'wehrmacht', 'auschwitz', 'holocaust', 'judenvergasen', 'gaskammer',
  'blutundehre', 'combat', 'whitepower', 'heilhtler', 'nazi', 'faschist',
  // Rassistisch
  'nigger', 'nigga', 'neger', 'niggr', 'kanake', 'kanacke', 'schlitzauge', 'zigeuner',
  'bimbo', 'coon', 'chink', 'spic', 'wetback', 'kaffer',
  // Antisemitisch
  'judensau', 'saujude', 'kikeslur', 'shekel', 'rothschildjew',
  // Homo-/transfeindlich (Slur-Nutzung)
  'schwuchtel', 'faggot', 'fag', 'tranny',
  // Sexualisierte Gewalt / harte Beleidigung
  'vergewaltiger', 'kinderficker', 'hurensohn', 'wichser', 'fotze', 'missgeburt',
];

/** true = Text enthält einen Sperrbegriff (nach Verschleierungs-Normalisierung). */
export function containsBannedWord(text: string): boolean {
  const n = normalizeForMatch(text);
  if (!n) return false;
  return BANNED.some(w => n.includes(w));
}

/**
 * Prüft Anzeigename + Handle. Gibt eine (nutzerfreundliche) Fehlermeldung zurück
 * oder null, wenn alles in Ordnung ist.
 */
export function checkUserNaming(name: string, handle: string): string | null {
  if (containsBannedWord(name))   return 'Dieser Name ist nicht erlaubt. Bitte wähle einen anderen.';
  if (containsBannedWord(handle)) return 'Dieser Nutzername ist nicht erlaubt. Bitte wähle einen anderen.';
  return null;
}
