# ── Build-Stage: Frontend (web) + Backend (api) bauen ────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Nur Manifeste kopieren → npm-Cache nutzen
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY api/package.json api/
RUN npm ci

# Quellcode kopieren und beide Workspaces bauen
COPY . .
RUN npm run build
# Gebautes Frontend neben die API legen (Single-Origin)
RUN cp -r web/dist api/public

# ── Run-Stage: schlankes Prod-Image, nur Laufzeit-Abhängigkeiten ─────────────
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY web/package.json web/
COPY api/package.json api/
RUN npm ci --omit=dev

COPY --from=build /app/api/dist  ./api/dist
COPY --from=build /app/api/public ./api/public

WORKDIR /app/api
# STATIC_DIR liefert das Frontend aus; PORT setzt Railway selbst (Fallback 3001)
ENV STATIC_DIR=public
EXPOSE 3001
CMD ["node", "dist/index.js"]
