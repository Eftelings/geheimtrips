/**
 * Setzt die Datenbank für den Live-Start zurück: entfernt ALLE Inhalts- und
 * Nutzerdaten (Demo/Dummy), behält aber das Schema und die Kategorien-Konfiguration.
 *
 * Sicherheitshalber nur mit Bestätigung:
 *   npm run db:reset -- --confirm
 *
 * Danach: ersten Account registrieren und per `npm run make-admin <email>` zum Admin machen.
 */
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

// Reihenfolge: abhängige Tabellen (Kinder) zuerst, dann Eltern.
// `categories` wird bewusst NICHT geleert (echte Konfiguration, keine Dummy-Daten).
const TABLES = [
  'photo_likes', 'place_contributions', 'swipe_events',
  'saved_places', 'visited_places', 'favorite_places', 'ratings',
  'trip_places', 'trip_overnights', 'trips',
  'business_claims', 'place_media', 'takedown_reports', 'places',
  'perks', 'friendships', 'business_profiles', 'user_prefs',
  'quiz_games', 'authors', 'users',
];

async function reset() {
  if (!process.argv.includes('--confirm')) {
    console.log('⚠️  Dies löscht ALLE Orte, Trips, Nutzer:innen, Bewertungen usw.');
    console.log('   Kategorien bleiben erhalten. Zum Ausführen:');
    console.log('   npm run db:reset -- --confirm');
    process.exit(0);
  }

  console.log('Datenbank wird zurückgesetzt…');
  for (const t of TABLES) {
    try {
      await db.run(sql.raw(`DELETE FROM ${t}`));
      console.log(`  geleert: ${t}`);
    } catch {
      console.log(`  übersprungen (existiert nicht): ${t}`);
    }
  }
  console.log('✓ Fertig. Kategorien wurden behalten.');
  console.log('  Nächster Schritt: Account registrieren, dann `npm run make-admin <email>`.');
}

reset().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
