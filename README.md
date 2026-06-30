# GitHub Trends API

API que busca repositorios trending en GitHub vía GraphQL, los almacena en PostgreSQL con caché Redis, y expone endpoints REST con observabilidad completa (OTLP → Grafana Cloud).

---

## Stack

| Servicio       | Rol                              | Puerto |
|----------------|----------------------------------|--------|
| API (Node)     | Express + TypeScript             | 3000   |
| PostgreSQL     | Datos persistentes               | 5432   |
| Redis          | Caché de búsquedas y trends      | 6379   |
| Grafana Alloy  | Logs → Grafana Cloud Loki        | 12345  |

---

## Arquitectura

```
[GitHub GraphQL API]
        ↓
[trendsCollector (cron cada hora)]  →  busca 30 keywords
        ↓
[PostgreSQL]  ←  UPSERT searches + repositories + search_repository
        ↑
[Redis]  ←  cache search:{keyword} (60s) + trends:* (variables)
        ↑
[REST API]  ←  Express con auth x-api-key
        ↓
[OTLP]  →  Grafana Cloud (traces + metrics)
[Alloy] →  Grafana Cloud Loki (logs)
```

---

## Endpoints

### Auth

Todas las rutas excepto `/health` requieren:

```
x-api-key: <API_KEY>
```

O `Authorization: Bearer <API_KEY>`.

### Health

```
GET /health
→ 200 { status: "OK", timestamp: "..." }
```

### Search

```
GET /search/:keyword
```

Busca en GitHub GraphQL, cachea en Redis 60s.

```
→ 200 {
    keyword: "kubernetes",
    totalCount: 85000,
    repositories: [
      {
        githubId: 123,
        name: "kubernetes",
        fullName: "kubernetes/kubernetes",
        owner: "kubernetes",
        description: "...",
        url: "https://github.com/kubernetes/kubernetes",
        stars: 120000,
        forks: 42000,
        language: "Go",
        createdAt: "2014-06-06T...",
        lastPush: "2025-01-...",
      }
    ]
  }
```

### Trends

```
GET /trends
```

Lista trends alamacenados con filtros:

| Query param | Ejemplo            | Descripción              |
|-------------|--------------------|--------------------------|
| `keyword`   | `?keyword=kubernetes` | Filtro ILIKE          |
| `language`  | `?language=Go`     | Filtro por lenguaje       |
| `sort`      | `?sort=stars`      | `stars` (default) o `count` |
| `limit`     | `?limit=10`        | Default 20                |

```
GET /trends/stats
→ 200 {
    total_keywords: 30,
    total_repositories: 7850,
    total_links: 7850,
    total_searches: 1450,
    max_stars: 120000,
    top_language: "TypeScript"
  }
```

```
POST /trends/collect
```

Trigger manual de colección (ejecuta el mismo job del cron).

```
→ 200 {
    keywordsProcessed: 30,
    reposSaved: 285,
    durationMs: 12450,
    errors: []
  }
```

### Report

```
GET /trends/report
```

Reporte con insights agregados de toda la data colectada.

```
→ 200 {
    generated_at: "2026-06-30T14:00:00.000Z",
    top_repos: [
      { full_name: "kubernetes/kubernetes", stars: 120000, ... }
    ],
    language_breakdown: [
      { language: "TypeScript", count: 45, percentage: 28.3 }
    ],
    top_owners: [
      { owner: "microsoft", repo_count: 12, total_stars: 450000 }
    ],
    per_keyword: [
      { keyword: "rust", total_repos: 10, avg_stars: 4550, ... }
    ],
    newest_repos: [...],
    most_recently_pushed: [...],
    keyword_popularity: [...],
    totals: {
      total_repos: 7850,
      total_keywords: 30,
      total_owners: 340
    }
  }
```

---

## Cron

`trendsCollector` corre cada hora (configurable vía `SCHEDULE` en `api/src/jobs/trendsCollector.ts`).

Keywords colectadas (hardcodeadas):

```
typescript, javascript, python, go, rust, java, kotlin, swift,
cpp, ruby, react, vue, angular, svelte, nextjs, django, spring,
kubernetes, docker, terraform, machine-learning, blockchain,
deno, bun, prisma, tailwindcss, trpc, astro, tauri, solidity
```

---

## Rate Limits

| Scope  | Ventana | Máximo |
|--------|---------|--------|
| Global | 15 min  | 200    |
| Search | 1 min   | 60     |
| Trends | 1 min   | 30     |

---

## Métricas (OTLP → Grafana Cloud)

| Métrica                              | Tipo      | Atributos               |
|--------------------------------------|-----------|-------------------------|
| `http_request_duration_seconds`      | Histogram | method, route, status_code |
| `github_search_requests_total`       | Counter   | keyword, status         |
| `github_search_duration_seconds`     | Histogram | —                       |
| `github_cache_hit_requests_total`    | Counter   | keyword, status         |
| `get_trends`                         | Counter   | —                       |
| `get_trends_cache`                   | Counter   | —                       |
| `get_trends_stats`                   | Counter   | —                       |
| `get_trends_stats_cache`             | Counter   | —                       |
| `get_trends_collector`               | Counter   | —                       |

Se exportan cada 15s vía `OTLPMetricExporter` al endpoint `OTEL_EXPORTER_OTLP_ENDPOINT`.

---

## Trazas (OTLP → Grafana Cloud)

OpenTelemetry auto-instrumentación para HTTP y Express, más spans manuales en:

- `github.graphql.search` — cada llamada a GitHub GraphQL
- `trends.collect` — cada ejecución del cron

---

## Variables de Entorno

Ver `.env`:

| Variable                         | Requerida | Descripción                          |
|----------------------------------|-----------|--------------------------------------|
| `GITHUB_TOKEN`                   | ✅        | Token GitHub con scope repo          |
| `DATABASE_URL`                   | ✅        | PostgreSQL connection string         |
| `REDIS_URL`                      | ✅        | Redis connection string              |
| `API_KEY`                        | ✅        | API key para autenticar endpoints    |
| `CORS_ORIGIN`                    | —         | Origen permitido (default localhost) |
| `OTEL_EXPORTER_OTLP_ENDPOINT`    | —         | Endpoint OTLP (Grafana Cloud)        |
| `OTEL_EXPORTER_OTLP_HEADERS`     | —         | Auth header para OTLP                |
| `GRAFANA_LOKI_URL`               | —         | Endpoint Loki para logs              |
| `GRAFANA_LOKI_USERNAME`          | —         | Usuario Loki                         |
| `GRAFANA_CLOUD_API_KEY`          | —         | API key Grafana Cloud                |
| `GRAFANA_LOGS_WRITE`             | —         | Token write para Loki                |

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

## Deploy con Docker Compose

```bash
docker-compose up -d
```

Servicios:

| Nombre    | Puerto | Health check                       |
|-----------|--------|------------------------------------|
| postgres  | 5432   | `pg_isready`                       |
| redis     | 6379   | `redis-cli ping`                   |
| api       | 3000   | —                                  |
| alloy     | 12345  | — (logs → Grafana Cloud Loki)      |

La API se construye desde `api/Dockerfile` (Node 18 Alpine).

---

## Postman

Importar `GitHub-Analytics-API.postman_collection.json`.

Variable: `baseUrl = http://localhost:3000`

Colección incluye:

- `GET /health`
- `GET /search/{keyword}` (3 ejemplos)
- `GET /trends` (con filtros: keyword, language, sort, limit)
- `GET /trends/stats`
- `GET /trends/report`
- `POST /trends/collect`

---

## Estructura del proyecto

```
.
├── api/
│   ├── src/
│   │   ├── server.ts              # Entry point, carga dotenv + OTel
│   │   ├── app.ts                 # Express app setup
│   │   ├── config/
│   │   │   └── rateLimiters.ts    # Rate limiting config
│   │   ├── jobs/
│   │   │   └── trendsCollector.ts # Cron: colecta trends cada hora
│   │   ├── middlewares/
│   │   │   ├── auth.ts            # API key validation
│   │   │   ├── metrics.ts         # OTel metrics definición
│   │   │   └── tracing.ts         # OTel spans por request
│   │   ├── otel/
│   │   │   └── config.ts          # OpenTelemetry SDK setup
│   │   ├── routes/
│   │   │   ├── health.ts          # GET /health
│   │   │   ├── search.ts          # GET /search/:keyword
│   │   │   └── trends.ts          # GET /trends, GET /trends/stats, GET /trends/report, POST /trends/collect
│   │   └── services/
│   │       ├── database.ts        # PostgreSQL pool
│   │       ├── github.ts          # GitHub GraphQL client
│   │       ├── redis.ts           # Redis client + helpers cache
│   │       └── reports.ts         # Report generator (insights)
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── db/init/
│   └── 01-init.sql                # Schema PostgreSQL
├── config.alloy                   # Grafana Alloy → Loki config
├── docker-compose.yml
├── .env                           # Variables de entorno (no subir)
├── .gitignore
└── GitHub-Analytics-API.postman_collection.json
```
