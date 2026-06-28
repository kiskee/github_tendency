# GitHub Analytics - Metrics Stack

Template para monitoreo de una API que consume GitHub GraphQL API.

## Que incluye

- **API** - Express + TypeScript, busca repos en GitHub por keyword
- **PostgreSQL** - Base de datos para stores resultados
- **Redis** - Cache
- **Prometheus** - Recolecta metricas de la API
- **Grafana** - Dashboards para visualizar
- **Jaeger** - Distributed tracing

## Como levantar

```bash
docker-compose up -d
```

## Servicios

| Servicio | Puerto | Que hace |
|----------|--------|----------|
| API | 3000 | Endpoints REST |
| Postgres | 5432 | DB |
| Redis | 6379 | Cache |
| Prometheus | 9090 | Scrape metrics |
| Grafana | 3001 | Dashboards |
| Jaeger | 16686 | Tracing UI |
| Jaeger OTLP gRPC | 4317 | Recibe traces gRPC |
| Jaeger OTLP HTTP | 4318 | Recibe traces HTTP |

## Endpoints

- `GET /search/:keyword` - Busca repos en GitHub
- `GET /health` - Health check
- `GET /metrics` - Metricas Prometheus

## Estructura

```
.
├── api/              # Express API
├── db/init/          # SQL seed
├── grafana/          # Datasource provisioning
├── prometheus.yml    # Config de scrape
├── .env              # Tokens y config (no subir al repo)
└── docker-compose.yml
```

## Variables de entorno

Las variables van en `.env`:

```
GITHUB_TOKEN=ghp_xxx
POSTGRES_DB=github_analytics
POSTGRES_USER=github_user
POSTGRES_PASSWORD=github_pass_123
DATABASE_URL=postgresql://github_user:github_pass_123@postgres:5432/github_analytics
REDIS_URL=redis://redis:6379
NODE_ENV=development
```

La API tambien tiene disponibles:
- `JAEGER_AGENT_HOST=jaeger`
- `JAEGER_COLLECTOR_URL=http://jaeger:14268`

## Notas

- El `.env` tiene el token de GitHub, no lo subas al repo
- Grafana entra en `localhost:3001` (user: admin, pass: admin)
- Prometheus en `localhost:9090`
- Jaeger UI en `localhost:16686`
