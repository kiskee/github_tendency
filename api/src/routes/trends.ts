import { Router, Request, Response } from "express";
import { pool } from "../services/database";
import { collectTrends } from "../jobs/trendsCollector";
import { getTrends, getTrendsStats, getTrendsCollector } from "../middlewares/metrics"

const router = Router();

// GET /trends — traer data de la BD
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { keyword, language, sort, limit } = req.query;

    let query = `
      SELECT s.id, s.keyword, s.search_count, s.last_searched_at, s.created_at,
             json_agg(json_build_object(
               'id', r.id,
               'name', r.name,
               'full_name', r.full_name,
               'description', r.description,
               'url', r.url,
               'owner', r.owner,
               'stars', r.stars,
               'forks', r.forks,
               'language', r.language,
               'created_at', r.created_at,
               'pushed_at', r.pushed_at
             ) ORDER BY r.stars DESC) as repositories
      FROM searches s
      JOIN search_repository sr ON sr.search_id = s.id
      JOIN repositories r ON r.id = sr.repository_id
    `;

    const conditions: string[] = [];
    const params: any[] = [];

    if (keyword && typeof keyword === "string") {
      params.push(`%${keyword}%`);
      conditions.push(`s.keyword ILIKE $${params.length}`);
    }

    if (language && typeof language === "string") {
      params.push(language);
      conditions.push(`r.language = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` GROUP BY s.id`;

    if (sort === "stars") {
      query += ` ORDER BY (SELECT MAX(r2.stars) FROM search_repository sr2 JOIN repositories r2 ON r2.id = sr2.repository_id WHERE sr2.search_id = s.id) DESC`;
    } else if (sort === "count") {
      query += ` ORDER BY s.search_count DESC`;
    } else {
      query += ` ORDER BY s.last_searched_at DESC`;
    }

    if (limit && typeof limit === "string") {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        params.push(limitNum);
        query += ` LIMIT $${params.length}`;
      }
    }

    const result = await pool.query(query, params);
    getTrends.add(1, { status: "success" })
    res.status(200).json({
      total: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error: [trends] Query failed:", error);
    res.status(500).json({ error: "Failed to query trends" });
  }
});

// GET /trends/stats — resumen de la BD
router.get("/stats", async (_req: Request, res: Response): Promise<void> => {
  try {
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

    res.status(200).json(stats.rows[0]);
  } catch (error) {
    console.error("Error: [trends] Stats query failed:", error);
    res.status(500).json({ error: "Failed to query stats" });
  }
});

// POST /trends/collect — trigger manual del job
router.post("/collect", async (_req: Request, res: Response): Promise<void> => {
  try {
    console.log("[trends] Manual collection triggered");
    const result = await collectTrends();
    getTrendsCollector.add(1, { status: "success" })
    res.status(200).json({
      message: "Collection completed",
      ...result,
    });
  } catch (error) {
    console.error("Error: [trends] Manual collection failed:", error);
    res.status(500).json({ error: "Collection failed" });
  }
});

export default router;
