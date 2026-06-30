import { Request, Response, NextFunction } from "express";
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("http-server");

const httpRequestDuration = meter.createHistogram(
  "http_request_duration_seconds",
  {
    description: "Duration of HTTP requests in seconds",
    unit: "s",
  },
);

const searchRequestsTotal = meter.createCounter(
  "github_search_requests_total",
  {
    description: "Total GitHub search requests",
  },
);

const searchDuration = meter.createHistogram("github_search_duration_seconds", {
  description: "Duration of GitHub searches",
  unit: "s",
});

const cacheHits = meter.createCounter("github_cache_hit_requests_total", {
  description: "Total GitHub cache hit requests",
});

const getTrends = meter.createCounter("get_trends", {
  description: "Total Get Trends hit requests",
});

const getTrendsCache = meter.createCounter("get_trends_cache", {
  description: "Total Get Trends cache hit requests",
});

const getTrendsStats = meter.createCounter("get_trends_stats", {
  description: "Total Get Trends Stats hit requests",
});

const getTrendsStatsCache = meter.createCounter("get_trends_stats_cache", {
  description: "Total Get Trends Stats cache hit requests",
});

const getTrendsCollector = meter.createCounter("get_trends_collector", {
  description: "Total Get Trends Collector hit requests",
});

const getTrendsReport = meter.createCounter("get_trends_report", {
  description: "Total Get Trends Report requests",
});

export const metricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.record(duration, {
      method: req.method,
      route: req.path,
      status_code: res.statusCode,
    });
  });

  next();
};

export {
  searchRequestsTotal,
  searchDuration,
  cacheHits,
  getTrends,
  getTrendsStats,
  getTrendsCollector,
  getTrendsReport,
  getTrendsCache,
  getTrendsStatsCache,
};
