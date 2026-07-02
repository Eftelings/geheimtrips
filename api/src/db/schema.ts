import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── Auth ────────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  handle: text('handle').notNull().unique(),
  bio: text('bio').default(''),
  avatarUrl: text('avatar_url'),
  age: integer('age'),
  instagram: text('instagram'),
  tiktok: text('tiktok'),
  website: text('website'),
  // admin
  isAdmin: integer('is_admin', { mode: 'boolean' }).default(false),
  isBanned: integer('is_banned', { mode: 'boolean' }).default(false),
  // privacy
  profileVisible: integer('profile_visible', { mode: 'boolean' }).default(true),
  notificationsEnabled: integer('notifications_enabled', { mode: 'boolean' }).default(true),
  playVideos: integer('play_videos', { mode: 'boolean' }).default(true),
  meetPeopleEnabled: integer('meet_people_enabled', { mode: 'boolean' }).default(false),
  // Zeitpunkt, zu dem zuletzt Benachrichtigungen gesehen wurden (für den Punkt im Header)
  notificationsSeenAt: text('notifications_seen_at'),
  // Letzter GPS-Standort — nur wenn „Neue Leute" aktiv + Standort geteilt (für Nähe-Matching)
  lat: real('lat'),
  lng: real('lng'),
  locationUpdatedAt: text('location_updated_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ─── Places ──────────────────────────────────────────────────────────────────

export const places = sqliteTable('places', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  region: text('region').notNull(),
  category: text('category').notNull(),        // natur|kultur|genuss|aktiv|mystisch|wasser
  categoryLabel: text('category_label').notNull(),
  vibeJson: text('vibe_json').notNull().default('[]'),   // JSON string[]
  distanceMin: integer('distance_min').notNull(),
  distanceLabel: text('distance_label').notNull(),
  cost: integer('cost').notNull(),             // 1=€ 2=€€ 3=€€€
  costLabel: text('cost_label').notNull(),
  rating: real('rating').notNull().default(0),
  reviews: integer('reviews').notNull().default(0),
  saves: integer('saves').notNull().default(0),
  match: integer('match').notNull().default(0), // demo default, computed per user in prod
  short: text('short').notNull(),
  long: text('long').notNull(),
  hero: text('hero').notNull(),
  galleryJson: text('gallery_json').notNull().default('[]'),
  tipsJson: text('tips_json').notNull().default('[]'),
  attributesJson: text('attributes_json').notNull().default('{}'),
  authorId: integer('author_id').references(() => authors.id),
  lat: real('lat'),
  lng: real('lng'),
  hasVideo: integer('has_video', { mode: 'boolean' }).default(false),
  isUserSubmitted: integer('is_user_submitted', { mode: 'boolean' }).default(false),
  submittedBy: integer('submitted_by').references(() => users.id),
  // Business / official management
  businessProfileId: integer('business_profile_id'),
  isOfficiallyManaged: integer('is_officially_managed', { mode: 'boolean' }).default(false),
  // Community-editable fields
  parking: text('parking'), // null | 'free' | 'paid' | 'limited'
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ─── Authors ─────────────────────────────────────────────────────────────────

export const authors = sqliteTable('authors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  handle: text('handle').notNull().unique(),
  bio: text('bio').default(''),
  avatarUrl: text('avatar_url'),
  avatarColor: text('avatar_color').default('#8A6FB3'),
  instagram: text('instagram'),
  tiktok: text('tiktok'),
  website: text('website'),
  placeCount: integer('place_count').notNull().default(0),
  savedCount: integer('saved_count').notNull().default(0),
  avgStars: real('avg_stars').notNull().default(0),
});

// ─── User → Place relations ───────────────────────────────────────────────────

export const savedPlaces = sqliteTable('saved_places', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  placeId: text('place_id').notNull().references(() => places.id),
  savedAt: text('saved_at').default(sql`(datetime('now'))`),
  tags: text('tags').default('[]'),   // JSON string[] — eigene Tags der Nutzer:in
});

export const visitedPlaces = sqliteTable('visited_places', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  placeId: text('place_id').notNull().references(() => places.id),
  visitedAt: text('visited_at').default(sql`(datetime('now'))`),
  gpsVerified: integer('gps_verified', { mode: 'boolean' }).default(false),
});

// ─── Lieblingsorte (eigene Rangfolge besuchter Orte) ──────────────────────────

export const favoritePlaces = sqliteTable('favorite_places', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  placeId: text('place_id').notNull().references(() => places.id),
  position: integer('position').notNull().default(0),  // 0 = Lieblingsort
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

export const ratings = sqliteTable('ratings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  placeId: text('place_id').notNull().references(() => places.id),
  stars: integer('stars').notNull(),           // 1–5
  mood: integer('mood'),                        // Stimmungsbild 1–5
  descriptionAccurate: integer('description_accurate'), // 1–5
  timeSpent: text('time_spent'),               // <1h|1-3h|halber-tag|tagesfüllend
  companions: text('companions'),              // JSON string[]
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ─── Trips ───────────────────────────────────────────────────────────────────

export const trips = sqliteTable('trips', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  subtitle: text('subtitle').default(''),
  intro: text('intro').default(''),          // Teaser-Text (kuratierte Trips)
  hero: text('hero'),
  transport: text('transport').notNull().default('auto'), // walk|bike|transit|train|auto
  startDate: text('start_date'),
  endDate: text('end_date'),
  persons: integer('persons').notNull().default(1),
  costsJson: text('costs_json').default('{}'), // manuelle Kosten (Ticket, Verpflegung/Tag, Startort)
  // Start- und Endpunkt (freie Orte, z.B. Zuhause) — Ziele sind die trip_places dazwischen
  startLabel: text('start_label'),
  startLat: real('start_lat'),
  startLng: real('start_lng'),
  endLabel: text('end_label'),
  endLat: real('end_lat'),
  endLng: real('end_lng'),
  isCurated: integer('is_curated', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

export const tripPlaces = sqliteTable('trip_places', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tripId: integer('trip_id').notNull().references(() => trips.id),
  placeId: text('place_id').notNull().references(() => places.id),
  position: integer('position').notNull().default(0),
  dayIndex: integer('day_index').notNull().default(0),
  notes: text('notes').default(''),
});

export const tripOvernights = sqliteTable('trip_overnights', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tripId: integer('trip_id').notNull().references(() => trips.id),
  afterDayIndex: integer('after_day_index').notNull(),
  hotelId: text('hotel_id'),
  hotelName: text('hotel_name'),
  hotelPrice: real('hotel_price'),
  hotelLat: real('hotel_lat'),   // via Hotel-Suche (Geocoding) gefunden
  hotelLng: real('hotel_lng'),
});

// Mitreisende eines Trips — eingeladene Freund:innen (gemeinsame Ausflüge)
export const tripParticipants = sqliteTable('trip_participants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tripId: integer('trip_id').notNull().references(() => trips.id),
  userId: integer('user_id').notNull().references(() => users.id),
  status: text('status').notNull().default('invited'), // invited|accepted|declined
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// Abstimmung über die Orte eines Trips (eine Stimme je Person & Ort)
export const tripVotes = sqliteTable('trip_votes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tripId: integer('trip_id').notNull().references(() => trips.id),
  placeId: text('place_id').notNull().references(() => places.id),
  userId: integer('user_id').notNull().references(() => users.id),
  vote: text('vote').notNull(), // yes|maybe|no
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ─── Friends ─────────────────────────────────────────────────────────────────

export const friendships = sqliteTable('friendships', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  requesterId: integer('requester_id').notNull().references(() => users.id),
  addresseeId: integer('addressee_id').notNull().references(() => users.id),
  status: text('status').notNull().default('pending'), // pending|accepted|declined
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ─── Community feed ───────────────────────────────────────────────────────────

export const placeMedia = sqliteTable('place_media', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  placeId: text('place_id').notNull().references(() => places.id),
  userId: integer('user_id').notNull().references(() => users.id),
  url: text('url').notNull(),
  type: text('type').notNull().default('photo'), // photo|video
  ccConfirmed: integer('cc_confirmed', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ─── Business Profiles & Claims ──────────────────────────────────────────────

export const businessProfiles = sqliteTable('business_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id).unique(),
  companyName: text('company_name').notNull(),
  companyEmail: text('company_email').notNull(),
  companyWebsite: text('company_website'),
  description: text('description'),
  isVerified: integer('is_verified', { mode: 'boolean' }).default(false),
  verifiedAt: text('verified_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

export const businessClaims = sqliteTable('business_claims', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  placeId: text('place_id').notNull().references(() => places.id),
  userId: integer('user_id').notNull().references(() => users.id),
  businessName: text('business_name').notNull(),
  contactEmail: text('contact_email').notNull(),
  contactWebsite: text('contact_website'),
  message: text('message'),
  status: text('status').notNull().default('pending'), // pending|approved|rejected
  adminNote: text('admin_note'),
  reviewedAt: text('reviewed_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ─── Geheimquiz ───────────────────────────────────────────────────────────────

export const quizGames = sqliteTable('quiz_games', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  userId:       integer('user_id').references(() => users.id), // null = guest player
  playerName:   text('player_name').notNull(),
  opponentName: text('opponent_name').notNull(),
  won:          integer('won', { mode: 'boolean' }).notNull(),
  myWins:       integer('my_wins').notNull(),
  oppWins:      integer('opp_wins').notNull(),
  rounds:       integer('rounds').notNull(),
  playedAt:     text('played_at').default(sql`(datetime('now'))`),
});

// ─── Place Contributions (community answers) ─────────────────────────────────

export const placeContributions = sqliteTable('place_contributions', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  placeId:   text('place_id').notNull().references(() => places.id),
  userId:    integer('user_id').notNull().references(() => users.id),
  type:      text('type').notNull().default('parking'), // 'parking'
  value:     text('value').notNull(),                   // 'yes'|'no'|'limited' for parking
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ─── Photo Likes ──────────────────────────────────────────────────────────────

export const photoLikes = sqliteTable('photo_likes', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  placeId:   text('place_id').notNull().references(() => places.id),
  photoUrl:  text('photo_url').notNull(),
  userId:    integer('user_id').notNull().references(() => users.id),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ─── Kategorien (Haupt-Browse, im Admin editierbar) ───────────────────────────

export const categories = sqliteTable('categories', {
  id:       integer('id').primaryKey({ autoIncrement: true }),
  slug:     text('slug').notNull().unique(),   // = places.category bei den Standard-6
  label:    text('label').notNull(),
  icon:     text('icon').notNull().default('fa-tag'),
  color:    text('color').default('#71587A'),
  keywords: text('keywords').default(''),       // CSV: zusätzliche Treffer per Stichwort
  sort:     integer('sort').notNull().default(0),
  active:   integer('active', { mode: 'boolean' }).notNull().default(true),
});

// ─── Perks / Partner-Vorteile (Ranking-Belohnungen) ───────────────────────────

export const perks = sqliteTable('perks', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  board:      text('board').notNull().default('quiz'), // orte | quiz | punkte
  minRank:    integer('min_rank').notNull().default(1),
  maxRank:    integer('max_rank').notNull().default(50),
  partner:    text('partner').notNull(),               // "Europcar"
  title:      text('title').notNull(),                 // "20% Gutschrift bei Europcar"
  discount:   text('discount'),                        // Badge, z.B. "20%"
  logoUrl:    text('logo_url'),
  terms:      text('terms'),                           // ausklappbare Vertragsbedingungen
  redeemUrl:  text('redeem_url'),                      // Partner-Website
  validUntil: text('valid_until'),                     // ISO-Datum
  active:     integer('active', { mode: 'boolean' }).notNull().default(true),
  sort:       integer('sort').notNull().default(0),
  createdAt:  text('created_at').default(sql`(datetime('now'))`),
});

// ─── Notice & Takedown Reports ────────────────────────────────────────────────

export const takedownReports = sqliteTable('takedown_reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  reporterName: text('reporter_name').notNull(),
  reporterEmail: text('reporter_email').notNull(),
  placeId: text('place_id').references(() => places.id),
  mediaId: integer('media_id').references(() => placeMedia.id),
  description: text('description').notNull(),
  infringingUrl: text('infringing_url'),
  rightDescription: text('right_description'),
  status: text('status').notNull().default('open'), // open|in_review|resolved|dismissed
  resolvedAt: text('resolved_at'),
  adminNote: text('admin_note'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});
