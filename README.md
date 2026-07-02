# GitHub Trends API

API que busca repositorios trending en GitHub vía GraphQL, los almacena en PostgreSQL con caché Redis, y expone endpoints REST con observabilidad completa (OTLP → Grafana Cloud).

**SaaS de tracking individual de repositorios** con monitoreo enterprise-grade.

---

## Stack

| Servicio       | Rol                              | Puerto |
|----------------|----------------------------------|--------|
| API (Node)     | Express + TypeScript             | 3000   |
| PostgreSQL     | Datos persistentes               | 5432   |
| Redis          | Caché de queries + trends        | 6379   |
| Grafana Alloy  | Logs → Grafana Cloud Loki        | 12345  |

---

## Arquitectura

```
[GitHub GraphQL API]
        ↓
[trendsCollector (cron cada hora)]  →  busca ~260 keywords
        ↓
[userRepoCollector (cron cada hora)] →  scan repos de usuarios con su token
        ↓
[PostgreSQL]  ←  UPSERT searches + repositories + snapshots + PRs + issues + branches + releases + commits
         ↑  ←  computed scores (stars_24h, stars_7d, score)
[Redis]  ←  cache trends + me/* routes (invalidación por mutación)
        ↑
[REST API]  ←  Express con auth x-api-key + JWT cookies
        ↓
[OTLP]  →  Grafana Cloud (traces + metrics)
[Alloy] →  Grafana Cloud Loki (logs)
```

---

## Endpoints

### Auth (API Key)

Las rutas públicas (`/search`, `/trends`, `/trends/*`) requieren:

```
x-api-key: <API_KEY>
```

O `Authorization: Bearer <API_KEY>`.

### User Auth (JWT Cookies)

Sesión con JWT en cookies httpOnly.

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/register` | Registro con email + password |
| `GET` | `/auth/verify-email?token=...` | Verifica cuenta |
| `POST` | `/auth/login` | Login |
| `POST` | `/auth/refresh` | Renueva access token |
| `POST` | `/auth/logout` | Cierra sesión |
| `POST` | `/auth/forgot-password` | Link de reset |
| `POST` | `/auth/reset-password` | Cambia contraseña |

### Profile

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/me` | Perfil del usuario |

### GitHub Token

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/me/github-token` | Guarda token GitHub (encriptado) |
| `GET` | `/me/github-token` | Verifica si tiene token |

### Repositories (Tracking)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/me/repos` | Lista repos trackeados |
| `POST` | `/me/repos` | Agrega repo a trackear (`{ fullName: "owner/repo" }`) |
| `DELETE` | `/me/repos/:id` | Elimina repo del tracking |

### Repository Data

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/me/repos/:id/history` | Historial de snapshots (stars/forks over time) |
| `GET` | `/me/repos/:id/commits` | Commits paginados |
| `GET` | `/me/repos/:id/prs` | Pull requests paginados |
| `GET` | `/me/repos/:id/issues` | Issues paginadas |
| `GET` | `/me/repos/:id/branches` | Branches del repo |
| `GET` | `/me/repos/:id/releases` | Releases paginados |
| `GET` | `/me/repos/:id/activity` | Resumen de actividad (7d) |
| `GET` | `/me/repos/:id/scan-history` | Historial de scans del cron |

### Repository Refresh

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/me/repos/:id/refresh-commits` | Fuerza refresh de commits |
| `POST` | `/me/repos/:id/refresh-all` | Fuerza refresh completo (todo) |

### Public Routes

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/search/:keyword` | Busca repos en GitHub |
| `GET` | `/trends` | Lista trends con filtros |
| `GET` | `/trends/stats` | Estadísticas generales |
| `GET` | `/trends/report` | Reporte con insights |

---

## Data que trackeamos por repo (cada hora)

### Metadata
Stars, forks, watchers, open issues, license, language, topics, homepage, latest release, disk usage, is archived

### Métricas de tiempo
- **stars_24h**: estrellas ganadas últimas 24h
- **stars_7d**: estrellas ganadas últimos 7 días
- **score**: cálculo de trending = growth + log(stars) + recency + engagement + prVelocity + issueVelocity

### Commits
SHA, mensaje, autor, fecha, URL

### Pull Requests
Número, título, estado (OPEN/CLOSED/MERGED), autor, reviewers, labels, líneas agregadas/eliminadas, branch source/destination

### Issues
Número, título, estado, autor, labels, assignees, milestone, comentarios

### Branches
Nombre, default, último commit, si tiene PR abierto

### Releases
Tag, nombre, changelog, autor, fecha, prerelease/draft

### Scan History
Timestamp de cada scan, duración, métricas encontradas (commits, PRs, issues, stars delta)

---

## Cron Jobs

### trendsCollector (cada hora - minuto 20)

Busca repos por keywords (~260 keywords sembradas).

### userRepoCollector (cada hora - minuto 0)

Para cada repo trackeado por usuarios:
1. Usa token del usuario para fetch datos
2. Actualiza metadata, snapshots, scores
3. Fetch commits, PRs, issues, branches, releases
4. Guarda scan history con métricas

---

## Redis Cache

### Patrón (sin TTL, invalidación por mutación)

| Ruta GET | Cache Key | Invalidado por |
|----------|-----------|----------------|
| `GET /me/repos` | `me:repos:{userId}` | `POST/DELETE /me/repos` |
| `GET /me/repos/:id/commits` | `me:commits:{userId}:{repoId}:{limit}:{offset}` | `POST /me/repos/:id/refresh-*` |
| `GET /me/repos/:id/prs` | `me:prs:{userId}:{repoId}:...` | `POST /me/repos/:id/refresh-all` |
| `GET /me/repos/:id/issues` | `me:issues:{userId}:{repoId}:...` | `POST /me/repos/:id/refresh-all` |
| `GET /me/repos/:id/branches` | `me:branches:{userId}:{repoId}` | `POST /me/repos/:id/refresh-all` |
| `GET /me/repos/:id/releases` | `me:releases:{userId}:{repoId}` | `POST /me/repos/:id/refresh-all` |
| `GET /me/repos/:id/activity` | `me:activity:{userId}:{repoId}` | `POST /me/repos/:id/refresh-all` |
| `GET /me/repos/:id/scan-history` | `me:scan:{userId}:{repoId}:...` | `POST /me/repos/:id/refresh-all` |

---

## Rate Limits

| Scope  | Ventana | Máximo |
|--------|---------|--------|
| Global | 15 min  | 200    |
| Search | 1 min   | 60     |
| Trends | 1 min   | 30     |
| Auth   | 15 min  | 10     |

---

## Variables de Entorno

| Variable                         | Requerida | Descripción                          |
|----------------------------------|-----------|--------------------------------------|
| `GITHUB_TOKEN_CRON`              | ✅        | Token para cron trends               |
| `GITHUB_TOKEN_SEARCH`            | ✅        | Token para search público            |
| `DATABASE_URL`                   | ✅        | PostgreSQL connection string         |
| `REDIS_URL`                      | ✅        | Redis connection string              |
| `API_KEY`                        | ✅        | API key para rutas públicas          |
| `CORS_ORIGIN`                    | —         | Origen permitido                     |
| `FRONTEND_URL`                   | —         | URL frontend para CORS               |
| `EMAIL_FRONTEND_URL`             | —         | URL frontend para links de email     |
| `JWT_ACCESS_SECRET`              | ✅        | Secret para access tokens            |
| `JWT_REFRESH_SECRET`             | ✅        | Secret para refresh tokens           |
| `TOKEN_ENCRYPTION_KEY`           | ✅        | Clave AES-256-GCM para tokens GitHub (64 hex) |
| `GOOGLE_HOST`                    | —         | Servidor SMTP                        |
| `GOOGLE_PORT`                    | —         | Puerto SMTP (default 587)            |
| `GOOGLE_LONNSOM`                 | —         | Email SMTP                           |
| `GOOGLE_PS`                      | —         | App Password SMTP                    |
| `EMAIL_FROM`                     | —         | Remitente de emails                  |
| `OTEL_EXPORTER_OTLP_ENDPOINT`    | —         | Endpoint OTLP                        |
| `GRAFANA_LOKI_URL`               | —         | Endpoint Loki                        |

---

## Desarrollo Local

```bash
git clone <repo>
cd github_tendency/api
npm install
cp .env.example .env   # llenar tokens

# Hot-reload
npm run dev

# Build + run
npm run build && npm start
```

---

## Deploy con Docker

```bash
docker-compose up -d --build api
```

---

## Estructura del proyecto

```
api/src/
├── server.ts                    # Entry point
├── app.ts                       # Express setup
├── config/
│   ├── auth.ts                  # JWT secrets
│   └── rateLimiters.ts          # Rate limiting
├── jobs/
│   ├── trendsCollector.ts       # Cron: keywords cada hora
│   ├── userRepoCollector.ts     # Cron: repos de usuarios cada hora
│   └── xPoster.ts              # Cron: posts a Bluesky
├── middlewares/
│   ├── auth.ts                  # API key validation
│   ├── requireAuth.ts           # JWT validation
│   ├── metrics.ts               # OTel metrics
│   └── tracing.ts               # OTel tracing
├── routes/
│   ├── health.ts                # GET /health
│   ├── search.ts                # GET /search/:keyword
│   ├── trends.ts                # GET /trends/*
│   ├── auth.ts                  # POST /auth/*
│   ├── me.ts                    # GET/POST/DELETE /me/*
│   └── authDebug.ts             # GET /auth/debug/*
├── services/
│   ├── auth.ts                  # User registration/login
│   ├── github.ts                # GitHub GraphQL client
│   ├── commits.ts               # Fetch/store commits
│   ├── repoData.ts              # Fetch PRs, Issues, Branches, Releases
│   ├── repoScoring.ts           # Score calculation + snapshots
│   ├── database.ts              # PostgreSQL pool + migrations
│   ├── redis.ts                 # Redis client + cache helpers
│   ├── userRepos.ts             # User repo management
│   ├── email.ts                 # SMTP email sending
│   └── reports.ts               # Report generator
└── utils/
    ├── tokenCrypto.ts           # AES-256-GCM encryption
    └── crypto.ts                # Password hashing
```
