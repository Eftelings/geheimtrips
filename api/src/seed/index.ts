/**
 * Seeds the database with demo data from the design handoff.
 * Run: npm run db:seed (from api/ directory)
 */
import { db } from '../db/index.js';
import { places, users } from '../db/schema.js';
import bcrypt from 'bcryptjs';
const { hash } = bcrypt;
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('Seeding database...');

  // Demo places (from design handoff data.js)
  const placesData = [
    {
      id: 'burg-eltz', hasVideo: true, name: 'Burg Eltz', region: 'Mosel, Rheinland-Pfalz',
      category: 'kultur', categoryLabel: 'Kultur',
      vibeJson: JSON.stringify(['mystisch', 'fotogen', 'historisch']),
      distanceMin: 95, distanceLabel: '1.5 Std', cost: 2, costLabel: '€€',
      rating: 4.7, reviews: 1240, saves: 8420, match: 92,
      short: 'Märchenhafte Höhenburg, versteckt im Eltzwald.',
      long: 'Seit über 850 Jahren im Besitz derselben Familie. Erreichbar nur zu Fuß durch den Wald — und genau das macht den Reiz aus. Beste Zeit: früh morgens, wenn der Nebel im Tal steht.',
      hero: 'https://images.unsplash.com/photo-1599839619722-39751411ea63?w=900&auto=format&fit=crop&q=75',
      galleryJson: JSON.stringify([
        'https://images.unsplash.com/photo-1599839619722-39751411ea63?w=600&auto=format&fit=crop&q=70',
        'https://images.unsplash.com/photo-1518709594023-6eab9bab7b23?w=600&auto=format&fit=crop&q=70',
        'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=600&auto=format&fit=crop&q=70',
      ]),
      tipsJson: JSON.stringify([
        'Parke in Wierschem, von dort 35 Min Fußweg.',
        'Innenführung nur mit Ticket — vorher online buchen.',
        'Bring Kleingeld für den Schatzkammer-Eintritt.',
      ]),
      attributesJson: JSON.stringify({
        website: 'https://www.burg-eltz.de',
        hoursSchedule: [
          { months: [4,5,6,7,8,9,10], open: '9:30', close: '17:30' },
        ],
        hoursUrl: 'https://www.burg-eltz.de/besucherinfo',
        prices: [
          { label: 'Erwachsene', amount: '14 €' },
          { label: 'Kinder (6–17)', amount: '9 €' },
          { label: 'Familie (2+2)', amount: '39 €' },
        ],
      }), lat: 50.2061, lng: 7.3367,
    },
    {
      id: 'externsteine', name: 'Externsteine', region: 'Teutoburger Wald, NRW',
      category: 'mystisch', categoryLabel: 'Mystisch',
      vibeJson: JSON.stringify(['mystisch', 'natur', 'sagenumwoben']),
      distanceMin: 80, distanceLabel: '1.3 Std', cost: 1, costLabel: '€',
      rating: 4.5, reviews: 890, saves: 5210, match: 88,
      short: 'Bizarre Sandsteinfelsen mit tausendjähriger Geschichte.',
      long: 'Naturdenkmal und Kultstätte zugleich. Die Reliefs aus dem 12. Jahrhundert sind direkt in den Fels gehauen. Bei Sonnenuntergang besonders eindrucksvoll.',
      hero: 'https://images.unsplash.com/photo-1542856391-010fb87dcfed?w=900&auto=format&fit=crop&q=75',
      galleryJson: JSON.stringify(['https://images.unsplash.com/photo-1542856391-010fb87dcfed?w=600&auto=format&fit=crop&q=70']),
      tipsJson: JSON.stringify(['Parkplatz kostet 4€, dann nur 5 Min Fußweg.', 'Wendeltreppe auf den Hauptfelsen — nicht für Höhenangst.']),
      attributesJson: '{}', lat: 51.8686, lng: 8.9176,
    },
    {
      id: 'bastei', hasVideo: true, name: 'Basteibrücke', region: 'Sächsische Schweiz',
      category: 'natur', categoryLabel: 'Natur',
      vibeJson: JSON.stringify(['natur', 'aussicht', 'wandern']),
      distanceMin: 150, distanceLabel: '2.5 Std', cost: 1, costLabel: '€',
      rating: 4.8, reviews: 3200, saves: 12100, match: 85,
      short: 'Felsbrücke über dem Elbtal — eine Aussicht wie aus dem Bilderbuch.',
      long: 'Schon zur Romantik ein Sehnsuchtsort. Die 76 Meter hohe Sandsteinbrücke verbindet die Felsformationen. Komm früh — gegen Mittag wird es voll.',
      hero: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=900&auto=format&fit=crop&q=75',
      galleryJson: JSON.stringify(['https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&auto=format&fit=crop&q=70']),
      tipsJson: JSON.stringify(['Wanderparkplatz Bastei, dann 15 Min zur Brücke.', 'Felsenburg Neurathen lohnt sich (2€ extra).']),
      attributesJson: '{}', lat: 50.9654, lng: 14.0682,
    },
    {
      id: 'beelitz', name: 'Baumkronenpfad Beelitz-Heilstätten', region: 'Brandenburg',
      category: 'aktiv', categoryLabel: 'Aktiv',
      vibeJson: JSON.stringify(['natur', 'abenteuer', 'urban-exploring']),
      distanceMin: 50, distanceLabel: '50 Min', cost: 2, costLabel: '€€',
      rating: 4.4, reviews: 620, saves: 4100, match: 78,
      short: 'Über verlassene Heilstätten und durch die Baumkronen spazieren.',
      long: 'Eine Stahlkonstruktion führt 23 Meter über den Dächern der historischen Heilstätten entlang. Ein Parcours durch Geschichte und Natur zugleich.',
      hero: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=900&auto=format&fit=crop&q=75',
      galleryJson: JSON.stringify(['https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&auto=format&fit=crop&q=70']),
      tipsJson: JSON.stringify(['Onlineticket kaufen, es gibt kein Tageskassen-Kontingent.', 'Gutes Schuhwerk für den Rundweg empfohlen.']),
      attributesJson: JSON.stringify({
        website: 'https://baumundzeit.de/',
        hoursSchedule: [
          { months: [4,5,6,7,8,9],  open: '10:00', close: '19:00', lastEntry: '18:00' },
          { months: [3,10],          open: '10:00', close: '18:00', lastEntry: '17:00' },
          { months: [11,12,1,2],     open: '10:00', close: '16:00', lastEntry: '15:00' },
        ],
        hoursUrl: 'https://baumundzeit.de/oeffnungszeiten/',
        prices: [
          { label: 'Erwachsene', amount: '17 €' },
          { label: 'Kinder & Jugendliche ab 6', amount: '12 €' },
          { label: 'Ermäßigte', amount: '15 €' },
          { label: 'Geburtstagskind', amount: 'kostenlos' },
        ],
        pricesUrl: 'https://baumundzeit.de/preise-tickets/',
        specialInfo: ['Hunde nicht erlaubt'],
      }), lat: 52.2382, lng: 12.9094,
    },
    {
      id: 'frauenkirche-ruine', name: 'Ruine Frauenkirche', region: 'Nürnberg, Bayern',
      category: 'mystisch', categoryLabel: 'Mystisch',
      vibeJson: JSON.stringify(['mystisch', 'historisch', 'fotogen']),
      distanceMin: 40, distanceLabel: '40 Min', cost: 1, costLabel: '€',
      rating: 4.3, reviews: 310, saves: 2900, match: 74,
      short: 'Vergessene Kirchenruine mitten im Wald — Gothik-Feeling garantiert.',
      long: 'Eine der am wenigsten bekannten mittelalterlichen Ruinen in Bayern. Kein Parkplatz ausgeschildert, kaum Touristen. Genau das macht sie besonders.',
      hero: 'https://images.unsplash.com/photo-1518709594023-6eab9bab7b23?w=900&auto=format&fit=crop&q=75',
      galleryJson: JSON.stringify(['https://images.unsplash.com/photo-1518709594023-6eab9bab7b23?w=600&auto=format&fit=crop&q=70']),
      tipsJson: JSON.stringify(['Nur mit GPS navigieren.', 'Sturmsaison meiden — Astbruchgefahr.']),
      attributesJson: '{}', lat: 49.4521, lng: 11.0767,
    },
    {
      id: 'blaue-lagune', name: 'Blaue Lagune Papitzer See', region: 'Leipzig, Sachsen',
      category: 'wasser', categoryLabel: 'Am Wasser',
      vibeJson: JSON.stringify(['wasser', 'entspannung', 'geheimtipp']),
      distanceMin: 25, distanceLabel: '25 Min', cost: 1, costLabel: 'kostenlos',
      rating: 4.6, reviews: 450, saves: 6700, match: 81,
      short: 'Türkisblauer Baggersee — kostenlos und kaum bekannt.',
      long: 'Das Wasser leuchtet türkis-blau durch kalkhaltige Böden. Kein offizieller Badestrand, aber ein beliebter Insidertipp der Leipziger. Im Frühsommer noch leer.',
      hero: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=900&auto=format&fit=crop&q=75',
      galleryJson: JSON.stringify(['https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=600&auto=format&fit=crop&q=70']),
      tipsJson: JSON.stringify(['Früh morgens besonders schön.', 'Keine offiziellen Toiletten — einplanen.']),
      attributesJson: '{}', lat: 51.4067, lng: 12.3013,
    },
    {
      id: 'monbijoupark', name: 'Monbijoupark bei Nacht', region: 'Berlin-Mitte',
      category: 'genuss', categoryLabel: 'Genuss',
      vibeJson: JSON.stringify(['urban', 'nachtleben', 'entspannung']),
      distanceMin: 15, distanceLabel: '15 Min', cost: 1, costLabel: 'kostenlos',
      rating: 4.2, reviews: 180, saves: 3200, match: 67,
      short: 'Der geheimste Park am Wasser — abends kommt die Berliner Seele heraus.',
      long: 'Zwischen Hackeschem Markt und Museum Island. Die öffentlichen Grillplätze und die Strandbar sind bei Einheimischen heiß begehrt. Touristen suchen man vergebens.',
      hero: 'https://images.unsplash.com/photo-1528728329032-2972f65dfb3f?w=900&auto=format&fit=crop&q=75',
      galleryJson: JSON.stringify(['https://images.unsplash.com/photo-1528728329032-2972f65dfb3f?w=600&auto=format&fit=crop&q=70']),
      tipsJson: JSON.stringify(['Ab 19 Uhr werden die Grillplätze frei.', 'Strandbar Mitte ist direkt nebenan.']),
      attributesJson: '{}', lat: 52.5228, lng: 13.3956,
    },
    {
      id: 'zittauer-gebirge', hasVideo: true, name: 'Oybin Tafelberg', region: 'Zittauer Gebirge, Sachsen',
      category: 'natur', categoryLabel: 'Natur',
      vibeJson: JSON.stringify(['natur', 'wandern', 'aussicht', 'historisch']),
      distanceMin: 180, distanceLabel: '3 Std', cost: 1, costLabel: '€',
      rating: 4.9, reviews: 540, saves: 4800, match: 89,
      short: 'Tafelberg mit Burgruine und Kloster — Böhmisches Gebirge auf dem Silbertablett.',
      long: 'Der Zug von Zittau nach Oybin ist schon das halbe Erlebnis (Schmalspurbahn!). Oben: Ruine, Kloster, Panorama Richtung Tschechien. Fast kein Massentourismus.',
      hero: 'https://images.unsplash.com/photo-1502786129293-79981df4e689?w=900&auto=format&fit=crop&q=75',
      galleryJson: JSON.stringify(['https://images.unsplash.com/photo-1502786129293-79981df4e689?w=600&auto=format&fit=crop&q=70']),
      tipsJson: JSON.stringify(['Schmalspurbahn ab Zittau (Kurszettel prüfen).', 'Nachmittags sind die Lichtverhältnisse für Fotos ideal.']),
      attributesJson: '{}', lat: 50.8500, lng: 14.7167,
    },
  ];

  for (const p of placesData) {
    const existing = await db.select().from(places).where(eq(places.id, p.id)).get();
    if (!existing) {
      await db.insert(places).values(p as any);
    } else {
      // Always refresh attributes so demo data (prices, hours, website) stays current
      await db.update(places).set({ attributesJson: p.attributesJson }).where(eq(places.id, p.id));
    }
  }

  // Demo user (Beta-Login: lena@example.com / password123)
  const demoEmail = 'lena@example.com';
  const existingUser = await db.select().from(users).where(eq(users.email, demoEmail)).get();
  if (!existingUser) {
    const passwordHash = await hash('password123', 10);
    await db.insert(users).values({
      email: demoEmail, passwordHash, name: 'Lena', handle: 'lena_entdeckt',
      bio: 'Ich liebe Geheimtipps und Kaffee.',
    });
    console.log('Demo user: lena@example.com / password123');
  }

  console.log('Seed complete.');
}

seed().catch(console.error);
