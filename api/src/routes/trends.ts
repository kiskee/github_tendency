import { Router, Request, Response } from "express";
import { pool } from "../services/database.js";
import { getTrends, getTrendsStats, getTrendsReport, getTrendsCache, getTrendsStatsCache, getTrendsReportCache } from "../middlewares/metrics.js"
import { generateReport } from "../services/reports.js"
import { getCached, setCache } from "../services/redis.js";
import crypto from "crypto";

const router = Router();

function trendsCacheKey(req: Request): string {
  const hash = crypto.createHash("sha256").update(req.originalUrl).digest("hex");
  return `trends:data:${hash}`;
}

// GET /trends — traer data de la BD con paginación
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const key = trendsCacheKey(req);
    const cached = await getCached<{ total: number; page: number; limit: number; repoLimit: number; data: unknown[] }>(key);
    if (cached) {
      getTrendsCache.add(1, { status: "Cache success" })
      res.status(200).json(cached);
      return;
    }

    const { keyword, language, sort, limit, page, repoLimit } = req.query;

    let idx = 0;
    const params: any[] = [];
    const nextParam = () => `$${++idx}`;

    const searchConditions: string[] = [];
    if (keyword && typeof keyword === "string") {
      params.push(`%${keyword}%`);
      searchConditions.push(`keyword ILIKE ${nextParam()}`);
    }

    const searchWhere = searchConditions.length > 0 ? `WHERE ${searchConditions.join(" AND ")}` : "";

    const countRes = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int as total FROM searches ${searchWhere}`,
      params
    );
    const total = countRes.rows[0].total;

    const limitNum = Math.min(limit && typeof limit === "string" ? parseInt(limit, 10) || 20 : 20, 100);
    const pageNum = Math.max(page && typeof page === "string" ? parseInt(page, 10) || 1 : 1, 1);
    const offset = (pageNum - 1) * limitNum;
    const perRepoLimit = Math.min(repoLimit && typeof repoLimit === "string" ? parseInt(repoLimit, 10) || 10 : 10, 50);

    const pageLimitIdx = nextParam();
    params.push(limitNum);
    const offsetIdx = nextParam();
    params.push(offset);
    const repoLimitIdx = nextParam();
    params.push(perRepoLimit);

    let languageIdx = "";
    if (language && typeof language === "string") {
      languageIdx = nextParam();
      params.push(language);
    }

    let orderBy = "last_searched_at DESC";
    if (sort === "stars") {
      orderBy = `(SELECT MAX(r2.stars) FROM search_repository sr2 JOIN repositories r2 ON r2.id = sr2.repository_id WHERE sr2.search_id = searches.id) DESC`;
    } else if (sort === "count") {
      orderBy = "search_count DESC";
    } else if (sort === "score") {
      orderBy = `(SELECT MAX(r2.score) FROM search_repository sr2 JOIN repositories r2 ON r2.id = sr2.repository_id WHERE sr2.search_id = searches.id) DESC`;
    }

    const query = `
      SELECT s.id, s.keyword, s.search_count, s.last_searched_at, s.created_at,
             COALESCE(json_agg(json_build_object(
               'githubId', r.github_id,
               'name', r.name,
               'fullName', r.full_name,
               'description', r.description,
               'url', r.url,
               'owner', r.owner,
               'stars', r.stars,
               'forks', r.forks,
               'watchers', r.watchers,
               'openIssues', r.open_issues,
               'license', r.license,
               'language', r.language,
               'languages', r.languages,
               'topics', r.topics,
               'latestRelease', r.latest_release,
               'homepageUrl', r.homepage_url,
               'isArchived', r.is_archived,
               'diskUsage', r.disk_usage,
               'createdAt', r.created_at,
               'lastPush', r.pushed_at,
               'stars24h', r.stars_24h,
               'stars7d', r.stars_7d,
               'score', r.score
             ) ORDER BY r.score DESC, r.stars DESC), '[]'::json) as repositories
      FROM (
        SELECT id, keyword, search_count, last_searched_at, created_at
        FROM searches
        ${searchWhere}
        ORDER BY ${orderBy}
        LIMIT ${pageLimitIdx} OFFSET ${offsetIdx}
      ) s
      LEFT JOIN LATERAL (
        SELECT r.* FROM search_repository sr
        JOIN repositories r ON r.id = sr.repository_id
        WHERE sr.search_id = s.id
        ${languageIdx ? `AND r.language = ${languageIdx}` : ""}
        ORDER BY r.score DESC, r.stars DESC
        LIMIT ${repoLimitIdx}
      ) r ON true
      GROUP BY s.id, s.keyword, s.search_count, s.last_searched_at, s.created_at
    `;

    const result = await pool.query(query, params);
    getTrends.add(1, { status: "success" })
    const body = {
      total,
      page: pageNum,
      limit: limitNum,
      repoLimit: perRepoLimit,
      data: result.rows,
    };
    await setCache(key, body);
    res.status(200).json(body);
  } catch (error) {
    console.error("Error: [trends] Query failed:", error);
    res.status(500).json({ error: "Failed to query trends" });
  }
});

// GET /trends/stats — resumen de la BD
router.get("/stats", async (_req: Request, res: Response): Promise<void> => {
  try {
    const cached = await getCached<any>("trends:stats");
    if (cached) {
      getTrendsStatsCache.add(1, { status: "Cache success" })
      res.status(200).json(cached);
      return;
    }

    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM searches) as total_keywords,
        (SELECT COUNT(*) FROM repositories) as total_repositories,
        (SELECT COUNT(*) FROM search_repository) as total_links,
        (SELECT SUM(search_count) FROM searches) as total_searches,
        (SELECT MAX(stars) FROM repositories) as max_stars,
        (SELECT language FROM repositories GROUP BY language ORDER BY COUNT(*) DESC LIMIT 1) as top_language
    `);
    
    getTrendsStats.add(1, { status: "success" })

    const body = stats.rows[0];
    await setCache("trends:stats", body);
    res.status(200).json(body);
  } catch (error) {
    console.error("Error: [trends] Stats query failed:", error);
    res.status(500).json({ error: "Failed to query stats" });
  }
});

// GET /trends/report — reporte con insights agregados
router.get("/report", async (_req: Request, res: Response): Promise<void> => {
  try {
    const cached = await getCached<any>("trends:report");
    if (cached) {
      getTrendsReportCache.add(1, { status: "success" })
      res.status(200).json(cached);
      return;
    }

    const report = await generateReport();
    await setCache("trends:report", report);
    getTrendsReport.add(1, { status: "success" })
    res.status(200).json(report);
  } catch (error) {
    console.error("Error: [trends] Report generation failed:", error);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

export default router;
