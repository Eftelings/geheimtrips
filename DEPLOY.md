# Geheimtrips.de — Live gehen

Setup: **eine** Railway-Anwendung (API + Frontend zusammen, Single-Origin),
Datenbank bei **Turso**, Uploads auf einem **Railway-Volume**, Domain via **All-inkl. DNS**.

Lokal ändert sich nichts: ohne gesetzte Env-Variablen laufen SQLite-Datei, `./uploads`
und Vite-Dev-Server wie gehabt (`npm run dev`).

---

## 1. Datenbank bei Turso anlegen
1. Account auf [turso.tech](https://turso.tech), CLI installieren.
2. `turso db create geheimtrips` → danach:
   - `turso db show geheimtrips --url`  → das ist `DATABASE_URL`
   - `turso db tokens create geheimtrips` → das ist `DATABASE_AUTH_TOKEN`
3. Das Schema wird beim ersten Start automatisch angelegt (die App erstellt Tabellen + Kategorien-Seed selbst).

## 2. Railway-Service erstellen
1. Account auf [railway.app](https://railway.app) → **New Project → Deploy from GitHub** (Repo verbinden).
   Railway erkennt das `Dockerfile` im Repo-Root automatisch.
2. **Volume hinzufügen** (Service → Variables/Settings → Volumes): Mount-Pfad z.B. `/data`.
3. **Environment-Variablen** setzen (Service → Variables):
   ```
   JWT_SECRET            = <langes Zufalls-Secret, z.B. `openssl rand -hex 32`>
   DATABASE_URL          = <aus Turso>
   DATABASE_AUTH_TOKEN   = <aus Turso>
   UPLOAD_DIR            = /data/uploads
   NODE_ENV              = production
   ```
   `PORT` und `STATIC_DIR` setzt Railway/das Image bereits — nicht nötig.
4. Deploy starten. Nach dem Build läuft alles unter der Railway-URL (`*.up.railway.app`).

## 3. Dummy-Daten entfernen + Admin anlegen
Einmalig **lokal** mit den Prod-Zugangsdaten ausführen (zielt dann auf die Turso-DB):
```bash
cd api
# .env mit DATABASE_URL + DATABASE_AUTH_TOKEN befüllen (siehe .env.example), dann:
npm run db:reset -- --confirm     # löscht alle Demo-Orte/Trips/Nutzer, behält Kategorien
```
Danach in der Live-App registrieren und den eigenen Account zum Admin machen:
```bash
npm run make-admin deine@email.de
```

## 4. Domain (All-inkl.) verbinden
1. In Railway: Service → Settings → **Custom Domain** → `geheimtrips.de` (und `www`) hinzufügen.
   Railway zeigt einen CNAME-Zielwert an.
2. Im All-inkl.-KAS unter **DNS-Einstellungen**:
   - `www` → CNAME auf den Railway-Zielwert.
   - Root `geheimtrips.de` → CNAME/ALIAS auf den Railway-Zielwert (bei All-inkl. „CNAME für Hauptdomain"/ALIAS nutzen).
3. SSL stellt Railway automatisch aus. Fertig — App läuft auf der eigenen Domain.

---

## Wichtig vor dem öffentlichen Start
- **Impressum + Datenschutzerklärung** in der `LegalPage` befüllen (in Deutschland Pflicht).
- **Passwort-Gate** (`GATE_ENABLED` in `web/src/store/useAuthStore.ts`) für einen Soft-Launch im kleinen Kreis nutzen.
- Externe Gratis-Dienste (Nominatim, Valhalla, Transitous) haben **Fair-Use-Limits** — für kleinen Traffic ok, bei viel Andrang eigene/bezahlte Instanzen.

## Weiterentwickeln nach dem Launch
- Lokal/auf einer Test-DB entwickeln (eigene Turso-DB fürs Testen), **nie** direkt gegen die Live-DB.
- Git-Push → Railway baut & deployt automatisch neu.

## Alternative: getrennte Domains (Frontend separat, z.B. Vercel)
Dann im Frontend-Build `VITE_API_BASE=https://api.geheimtrips.de/api` und `VITE_WS_URL=wss://api.geheimtrips.de/api/game/ws`
setzen sowie in der API `CORS_ORIGINS=https://geheimtrips.de`. Für den Start aber unnötig — Single-Origin ist einfacher.
